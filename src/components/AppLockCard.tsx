import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LOCK_TIMEOUTS } from '@/features/lockPolicy';
import { useAppLock } from '@/state/AppLockContext';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Card } from './Card';
import { Chip } from './Chip';

// Turn the fingerprint / PIN lock on or off, and choose how soon it locks again.
export function AppLockCard() {
  const { enabled, timeoutSeconds, notice, enable, disable, setTimeoutSeconds } = useAppLock();
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  async function switchTo(on: boolean) {
    if (working || on === enabled) return;
    setWorking(true);
    setMessage(null);
    const result = on ? await enable() : await disable();
    setMessage(result.ok ? { text: on ? 'App lock is on.' : 'App lock is off.', good: true } : { text: result.reason, good: false });
    setWorking(false);
  }

  return (
    <Card>
      <AppText variant="heading">App lock</AppText>
      <AppText>
        Ask for your fingerprint, face, or phone PIN every time the app opens. You’ll be asked once
        to confirm it works before it turns on.
      </AppText>
      <View style={styles.chips}>
        <Chip label="Off" selected={!enabled} onPress={() => switchTo(false)} />
        <Chip label="On" selected={enabled} onPress={() => switchTo(true)} />
      </View>
      {notice && !message ? (
        <AppText variant="bodyBold" tone="warn">
          {notice}
        </AppText>
      ) : null}
      {message ? (
        <AppText variant="bodyBold" tone={message.good ? 'income' : 'expense'}>
          {message.text}
        </AppText>
      ) : null}
      {enabled ? (
        <>
          <AppText variant="caption">Lock again after I’ve left the app for:</AppText>
          <View style={styles.chips}>
            {LOCK_TIMEOUTS.map((t) => (
              <Chip key={t.seconds} label={t.label} selected={t.seconds === timeoutSeconds} onPress={() => setTimeoutSeconds(t.seconds)} />
            ))}
          </View>
        </>
      ) : null}
      <AppText variant="caption">
        This keeps people out of the app itself. Your phone’s own screen lock is what protects the
        data stored on the phone.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
