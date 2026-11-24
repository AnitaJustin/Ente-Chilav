import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppLock } from '@/state/AppLockContext';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Loading } from './Loading';

// Wraps the whole app. While the lock is on and you haven't unlocked, it hides everything
// behind a lock screen. The app underneath stays loaded, so you come back to exactly
// where you were.
export function LockGate({ children }: { children: ReactNode }) {
  const { ready, locked, unlock } = useAppLock();
  const { colors } = useTheme();

  // Ask for your fingerprint or PIN automatically each time the app locks.
  useEffect(() => {
    if (ready && locked) {
      Keyboard.dismiss();
      unlock();
    }
  }, [ready, locked, unlock]);

  if (!ready) return <Loading />;

  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={locked}>
        {children}
      </View>
      {locked ? (
        <View style={[styles.overlay, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
          <Ionicons name="lock-closed" size={44} color={colors.accent} />
          <AppText variant="heading">Ente Chilavu is locked</AppText>
          <AppText variant="caption" style={styles.center}>
            Use your fingerprint, face, or phone PIN to continue.
          </AppText>
          <View style={styles.button}>
            <Button label="Unlock" onPress={() => unlock()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md - 2,
    padding: spacing.lg,
  },
  center: { textAlign: 'center' },
  button: { marginTop: spacing.sm, alignSelf: 'stretch' },
});
