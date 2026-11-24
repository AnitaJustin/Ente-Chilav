import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DateField } from '@/components/DateField';
import { ModalHeader } from '@/components/ModalHeader';
import { TextField } from '@/components/TextField';
import { addTransfer, CURRENCIES, getCurrency, listAccounts, parseAmount, todayYmd, type Account, type CurrencyCode } from '@/db';
import { sanitizeAmountText } from '@/features/transactionForm';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function TransferScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, cur] = await Promise.all([listAccounts(db), getCurrency(db)]);
      if (!alive) return;
      setAccounts(list);
      setCurrency(cur);
      setFromId(list[0]?.id ?? null);
      setToId(list[1]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  // Picking the same account for both sides swaps the other one out of the way.
  function chooseFrom(id: number) {
    if (id === toId) setToId(fromId);
    setFromId(id);
    setError(null);
  }
  function chooseTo(id: number) {
    if (id === fromId) setFromId(toId);
    setToId(id);
    setError(null);
  }

  const fromAccount = accounts.find((a) => a.id === fromId);
  const toAccount = accounts.find((a) => a.id === toId);
  const hint =
    fromAccount && toAccount && !fromAccount.isSavings && toAccount.isSavings
      ? `${toAccount.name} is a savings account, so this counts as moved to savings in your Overview.`
      : fromAccount && toAccount && fromAccount.isSavings && !toAccount.isSavings
        ? `${fromAccount.name} is a savings account, so this is shown as money taken out of savings.`
        : null;

  async function save() {
    if (saving || fromId === null || toId === null) return;
    const minor = parseAmount(amountText);
    if (minor === null || minor <= 0) {
      setError('Enter an amount above zero.');
      return;
    }
    setSaving(true);
    try {
      await addTransfer(db, { fromAccountId: fromId, toAccountId: toId, amountMinor: minor, date, note });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ModalHeader title="Move money" />
      {loading ? (
        <View style={styles.center}>
          <AppText variant="caption">Loading…</AppText>
        </View>
      ) : accounts.length < 2 ? (
        <View style={styles.center}>
          <AppText variant="heading">You need two accounts</AppText>
          <AppText style={styles.centered}>Add a second account first, then you can move money between them.</AppText>
          <Button label="Go back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.form, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <AppText variant="caption">
            Use this for things like withdrawing cash from the bank. It changes both balances but isn’t counted as spending
            or income.
          </AppText>

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              From
            </AppText>
            <View style={styles.row}>
              {accounts.map((a) => (
                <Chip key={a.id} label={a.name} dotColor={a.color} selected={fromId === a.id} onPress={() => chooseFrom(a.id)} />
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              To
            </AppText>
            <View style={styles.row}>
              {accounts.map((a) => (
                <Chip key={a.id} label={a.name} dotColor={a.color} selected={toId === a.id} onPress={() => chooseTo(a.id)} />
              ))}
            </View>
          </View>

          {hint ? (
            <View style={[styles.hint, { backgroundColor: colors.accentSoft }]}>
              <AppText variant="caption" style={{ color: colors.ink }}>
                {hint}
              </AppText>
            </View>
          ) : null}

          <TextField
            label="Amount"
            prefix={CURRENCIES[currency].symbol}
            value={amountText}
            onChangeText={(t) => {
              setAmountText(sanitizeAmountText(t));
              setError(null);
            }}
            placeholder="0"
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus
          />
          <DateField label="Date" value={date} onChange={setDate} />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. ATM withdrawal" maxLength={120} />

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}

          <Button label={saving ? 'Saving…' : 'Move money'} onPress={save} disabled={saving} />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  centered: { textAlign: 'center' },
  form: { padding: spacing.md, gap: spacing.md },
  block: { gap: spacing.sm },
  label: { fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  errorBox: { padding: spacing.md - 4, borderRadius: 12 },
  hint: { padding: spacing.md - 4, borderRadius: 12 },
});
