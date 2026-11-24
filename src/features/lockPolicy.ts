// The rules for when the app locks itself, kept separate so they can be tested.

export const LOCK_TIMEOUTS = [
  { seconds: 0, label: 'Right away' },
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
] as const;

export const DEFAULT_LOCK_SECONDS = 0;

// Reads the saved "lock after" setting, falling back to the default if it's missing or odd.
export function parseTimeout(saved: string | null): number {
  if (saved === null) return DEFAULT_LOCK_SECONDS;
  const n = Number(saved);
  return LOCK_TIMEOUTS.some((t) => t.seconds === n) ? n : DEFAULT_LOCK_SECONDS;
}

// Should the app lock when you come back to it?
// It should if the lock is on and you were away for at least the chosen time.
// If the phone's clock went backwards while you were away, we lock to be safe.
export function shouldRelock(input: {
  enabled: boolean;
  backgroundedAt: number | null; // when you left the app, in milliseconds, or null if you didn't
  now: number;
  timeoutSeconds: number;
}): boolean {
  if (!input.enabled || input.backgroundedAt === null) return false;
  const away = input.now - input.backgroundedAt;
  return away < 0 || away >= input.timeoutSeconds * 1000;
}
