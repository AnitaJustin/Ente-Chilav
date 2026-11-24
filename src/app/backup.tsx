import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  buildBackup,
  countTransactions,
  getCurrency,
  getSetting,
  listTransactions,
  longDateLabel,
  parseBackup,
  restoreBackup,
  serializeBackup,
  setSetting,
  summarizeBackup,
  todayYmd,
  type BackupSummary,
} from '@/db';
import { buildCsv } from '@/features/csv';
import { pickTextFile, shareTextFile } from '@/features/files';
import { useAppLock } from '@/state/AppLockContext';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Notice = { text: string; good: boolean };

// Wraps Alert.alert so we can simply wait for the answer.
function confirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function dateOf(iso: string): string | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : longDateLabel(todayYmd(d));
}

function describe(s: BackupSummary): string {
  const range = s.firstDate && s.lastDate ? ` from ${longDateLabel(s.firstDate)} to ${longDateLabel(s.lastDate)}` : '';
  const made = dateOf(s.createdAt);
  return [
    made ? `Backup made on ${made}.` : null,
    s.skippedSample > 0 ? `${s.skippedSample} made-up sample transaction${s.skippedSample === 1 ? '' : 's'} in the file will be left out.` : null,
    `${s.transactions} transaction${s.transactions === 1 ? '' : 's'}${s.transfers > 0 ? ` and ${s.transfers} transfer${s.transfers === 1 ? '' : 's'} between accounts` : ''}${range}, ${s.accounts} account${s.accounts === 1 ? '' : 's'}, ${s.customCategories} of your own categor${s.customCategories === 1 ? 'y' : 'ies'}, and ${s.budgets} budget${s.budgets === 1 ? '' : 's'}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { suppressRelock } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const loadLastBackup = useCallback(async () => {
    const saved = await getSetting(db, 'last_backup_at');
    setLastBackup(saved ? dateOf(saved) : null);
  }, [db]);
  useEffect(() => {
    loadLastBackup();
  }, [loadLastBackup]);

  // Runs one action at a time, and turns any unexpected error into a readable message.
  async function run(action: () => Promise<Notice | null>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Something went wrong. Please try again.', good: false });
    } finally {
      setBusy(false);
    }
  }

  const exportCsv = () =>
    run(async () => {
      const [rows, currency] = await Promise.all([listTransactions(db), getCurrency(db)]);
      if (rows.length === 0) return { text: 'Nothing to export yet. Add some transactions first.', good: false };
      const name = `ente-chilavu-transactions-${todayYmd()}.csv`;
      const result = await suppressRelock(() => shareTextFile(name, buildCsv(rows, currency), 'text/csv'));
      if (result === 'unavailable') return { text: 'Sharing isn’t available on this phone.', good: false };
      return { text: `Prepared ${rows.length} transaction${rows.length === 1 ? '' : 's'} as a spreadsheet.`, good: true };
    });

  const makeBackup = () =>
    run(async () => {
      const backup = await buildBackup(db);
      const name = `ente-chilavu-backup-${todayYmd()}.json`;
      const result = await suppressRelock(() => shareTextFile(name, serializeBackup(backup), 'application/json'));
      if (result === 'unavailable') return { text: 'Sharing isn’t available on this phone.', good: false };
      await setSetting(db, 'last_backup_at', new Date().toISOString());
      await loadLastBackup();
      const s = summarizeBackup(backup);
      return {
        text: `Backup ready: ${s.transactions} transaction${s.transactions === 1 ? '' : 's'}, ${s.categories} categories and ${s.budgets} budget${s.budgets === 1 ? '' : 's'}. Keep the file somewhere safe.`,
        good: true,
      };
    });

  const restore = () =>
    run(async () => {
      const picked = await suppressRelock(() => pickTextFile());
      if (!picked) return null; // you cancelled
      const file = parseBackup(picked.text); // refuses anything damaged before touching your data
      const summary = summarizeBackup(file);
      const current = await countTransactions(db);
      const go = await confirm(
        'Replace everything with this backup?',
        `${picked.name}\n\n${describe(summary)}\n\nThis replaces the ${current} transaction${current === 1 ? '' : 's'} currently in the app, along with your categories and budgets. It can’t be undone.`,
        'Replace',
      );
      if (!go) return null;
      const done = await restoreBackup(db, file);
      return {
        text: `Restored ${done.transactions} transaction${done.transactions === 1 ? '' : 's'}${done.transfers > 0 ? ` and ${done.transfers} transfer${done.transfers === 1 ? '' : 's'}` : ''}, ${done.accounts} account${done.accounts === 1 ? '' : 's'}, ${done.customCategories} of your own categor${done.customCategories === 1 ? 'y' : 'ies'} and ${done.budgets} budget${done.budgets === 1 ? '' : 's'}.${done.skippedSample > 0 ? ` ${done.skippedSample} sample transaction${done.skippedSample === 1 ? ' was' : 's were'} left out.` : ''}`,
        good: true,
      };
    });

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScreenHeader title="Backup & export" subtitle="Keep your data safe, or take it elsewhere" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <AppText variant="heading">Spreadsheet</AppText>
          <AppText>
            Every transaction in a CSV file you can open in Excel or Google Sheets. It’s for looking at
            your data elsewhere, not for restoring.
          </AppText>
          <Button label="Download as a spreadsheet (CSV)" onPress={exportCsv} disabled={busy} />
        </Card>

        <Card>
          <AppText variant="heading">Back up everything</AppText>
          <AppText>
            One file with all your transactions, accounts, categories, budgets and currency. Save it to your own
            cloud storage or email it to yourself. You can restore from it on this phone or a new one.
          </AppText>
          {lastBackup ? <AppText variant="caption">Last backup file made on {lastBackup}.</AppText> : null}
          <Button label="Back up everything" onPress={makeBackup} disabled={busy} />
          <AppText variant="caption">
            A backup holds all your financial details and isn’t locked, so keep it somewhere private.
          </AppText>
        </Card>

        <Card>
          <AppText variant="heading">Restore from a backup</AppText>
          <AppText>
            Pick a backup file you made earlier. You’ll see what’s inside and be asked to confirm before
            anything changes. Restoring replaces everything currently in the app.
          </AppText>
          <Button label="Restore from a backup file" variant="secondary" onPress={restore} disabled={busy} />
        </Card>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: notice.good ? colors.incomeSoft : colors.expenseSoft }]}>
            <AppText variant="bodyBold" tone={notice.good ? 'income' : 'expense'}>
              {notice.text}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  notice: { padding: spacing.md - 4, borderRadius: 12 },
});
