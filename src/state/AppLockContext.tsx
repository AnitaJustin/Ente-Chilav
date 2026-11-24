import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { getSetting, setSetting } from '@/db';
import { DEFAULT_LOCK_SECONDS, LOCK_TIMEOUTS, parseTimeout, shouldRelock } from '@/features/lockPolicy';

type Result = { ok: true } | { ok: false; reason: string };

type AppLock = {
  ready: boolean; // false until the saved settings have been read
  enabled: boolean;
  timeoutSeconds: number;
  locked: boolean;
  notice: string | null; // set if the app lock had to be switched off by itself
  unlock: () => Promise<boolean>;
  enable: () => Promise<Result>;
  disable: () => Promise<Result>;
  setTimeoutSeconds: (seconds: number) => Promise<void>;
  // Run something that opens a system screen (the share sheet, the file picker) without
  // the app mistaking it for you leaving, which would lock it when you come back.
  suppressRelock: <T>(action: () => Promise<T>) => Promise<T>;
};

const AppLockContext = createContext<AppLock | null>(null);

// Longest a system screen is allowed to hold off locking, as a safety net.
const SUPPRESS_LIMIT_MS = 120_000;

export function AppLockProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [timeoutSeconds, setTimeoutSecondsState] = useState(DEFAULT_LOCK_SECONDS);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Refs so the app-state listener always sees the current values.
  const enabledRef = useRef(false);
  const timeoutRef = useRef(DEFAULT_LOCK_SECONDS);
  const backgroundedAt = useRef<number | null>(null);
  const suppress = useRef({ count: 0, since: 0 });
  const authenticating = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    timeoutRef.current = timeoutSeconds;
  }, [timeoutSeconds]);

  // Read the saved settings once. If the lock is on, the app starts locked.
  useEffect(() => {
    let alive = true;
    (async () => {
      let on = false;
      let secs: string | null = null;
      try {
        [on, secs] = await Promise.all([
          getSetting(db, 'app_lock').then((v) => v === '1'),
          getSetting(db, 'lock_timeout'),
        ]);
      } catch {
        // If settings can't be read, stay unlocked rather than locking you out of your own data.
      }
      if (!alive) return;
      setEnabled(on);
      setLocked(on);
      setTimeoutSecondsState(parseTimeout(secs));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  // Note when you leave the app, and lock when you come back after long enough.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const held = suppress.current.count > 0 && Date.now() - suppress.current.since < SUPPRESS_LIMIT_MS;
      if (held) return;
      if (next === 'background' || next === 'inactive') {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const left = backgroundedAt.current;
        backgroundedAt.current = null;
        if (shouldRelock({ enabled: enabledRef.current, backgroundedAt: left, now: Date.now(), timeoutSeconds: timeoutRef.current })) {
          setLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const suppressRelock = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    suppress.current.count++;
    suppress.current.since = Date.now();
    try {
      return await action();
    } finally {
      suppress.current.count--;
      backgroundedAt.current = null;
    }
  }, []);

  // Asks the phone to check your fingerprint, face, or PIN/pattern.
  const authenticate = useCallback(async (): Promise<boolean> => {
    if (authenticating.current) return false;
    authenticating.current = true;
    try {
      return await suppressRelock(async () => {
        try {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Ente Chilavu',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false, // lets you use your phone's PIN or pattern too
          });
          return result.success;
        } catch {
          return false;
        }
      });
    } finally {
      authenticating.current = false;
    }
  }, [suppressRelock]);

  const unlock = useCallback(async () => {
    // If the phone's own screen lock has been removed since, nothing can check who you are,
    // so the app lock could never be passed and you'd be shut out of your own data.
    // In that case, switch it off and let you in.
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        await setSetting(db, 'app_lock', '0');
        setEnabled(false);
        setLocked(false);
        setNotice('App lock was turned off because this phone no longer has a fingerprint, PIN or pattern set up.');
        return true;
      }
    } catch {
      // Couldn't tell; carry on and ask normally.
    }
    const ok = await authenticate();
    if (ok) setLocked(false);
    return ok;
  }, [authenticate, db]);

  const enable = useCallback(async (): Promise<Result> => {
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        return { ok: false, reason: 'Set up a fingerprint, face unlock, PIN or pattern in your phone’s settings first, then try again.' };
      }
      // Prove it works before turning it on, so you can't lock yourself out.
      if (!(await authenticate())) return { ok: false, reason: 'That didn’t work, so the app lock stays off.' };
      await setSetting(db, 'app_lock', '1');
      setEnabled(true);
      setLocked(false);
      setNotice(null);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Couldn’t turn on the app lock. Please try again.' };
    }
  }, [authenticate, db]);

  const disable = useCallback(async (): Promise<Result> => {
    try {
      if (!(await authenticate())) return { ok: false, reason: 'That didn’t work, so the app lock stays on.' };
      await setSetting(db, 'app_lock', '0');
      setEnabled(false);
      setLocked(false);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Couldn’t turn off the app lock. Please try again.' };
    }
  }, [authenticate, db]);

  const setTimeoutSeconds = useCallback(
    async (seconds: number) => {
      if (!LOCK_TIMEOUTS.some((t) => t.seconds === seconds)) return;
      await setSetting(db, 'lock_timeout', String(seconds));
      setTimeoutSecondsState(seconds);
    },
    [db],
  );

  const value = useMemo(
    () => ({ ready, enabled, timeoutSeconds, locked, notice, unlock, enable, disable, setTimeoutSeconds, suppressRelock }),
    [ready, enabled, timeoutSeconds, locked, notice, unlock, enable, disable, setTimeoutSeconds, suppressRelock],
  );
  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLock {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used inside <AppLockProvider>');
  return ctx;
}
