import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { DateField } from '@/components/DateField';
import { ModalHeader } from '@/components/ModalHeader';
import { TextField } from '@/components/TextField';
import {
  addBalanceCheck,
  CURRENCIES,
  formatMoney,
  getCurrency,
  isTracked,
  listAccounts,
  parseAmount,
  todayYmd,
  type Account,
  type CheckResult,
  type CurrencyCode,
} from '@/db';
import { describeDifference } from '@/features/accounts';
import { sanitizeAmountText } from '@/features/transactionForm';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function BalanceCheckScreen() {
  const params = useLocalSearchParams<{ accountId?: string; date?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]); // only accounts whose balance is tracked
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(params.date && params.date <= todayYmd() ? params.date : todayYmd());
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, cur] = await Promise.all([listAccounts(db), getCurrency(db)]);
      if (!alive) return;
      const tracked = list.filter(isTracked);
      setAccounts(tracked);
      setCurrency(cur);
      const wanted = params.accountId ? Number(params.accountId) : null;
      setAccountId(tracked.some((a) => a.id === wanted) ? wanted : (tracked[0]?.id ?? null));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db, params.accountId]);

  const money = (m: number) => formatMoney(m, currency);
  const account = accounts.find((a) => a.id === accountId) ?? null;

  async function save() {
    if (saving || accountId === null) return;
    const minor = parseAmount(amountText);
    if (minor === null) {
      setError('Enter the balance your bank shows, like 7488750 or 7488.50.');
      return;
    }
    setSaving(true);
    try {
      setResult(await addBalanceCheck(db, { accountId, date, actualMinor: minor }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Opens the add-transaction form with the missing amount already filled in.
  function addMissing(r: CheckResult) {
    router.replace({
      pathname: '/transaction',
      params: {
        accountId: String(r.accountId),
        type: r.differenceMinor < 0 ? 'debit' : 'credit',
        amountMinor: String(Math.abs(r.differenceMinor)),
        date: r.date,
        description: 'Balance adjustment',
        note: 'Added from a balance check',
      },
    });
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ModalHeader title="Check a balance" />
      {loading ? (
        <View style={styles.center}>
          <AppText variant="caption">Loading…</AppText>
        </View>
      ) : accounts.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="heading">No account to check</AppText>
          <AppText style={styles.centered}>Set an opening balance on an account first, so the app can work out what it should be.</AppText>
          <Button label="Go back" onPress={() => router.back()} />
        </View>
      ) : result ? (
        <ScrollView contentContainerStyle={styles.form}>
          <Card>
            <AppText variant="heading">{account?.name}</AppText>
            <View style={styles.line}>
              <AppText>Your records say</AppText>
              <AppText variant="bodyBold">{money(result.expectedMinor)}</AppText>
            </View>
            <View style={styles.line}>
              <AppText>Your bank shows</AppText>
              <AppText variant="bodyBold">{money(result.actualMinor)}</AppText>
            </View>
          </Card>
          <View style={[styles.errorBox, { backgroundColor: result.differenceMinor === 0 ? colors.incomeSoft : colors.expenseSoft }]}>
            <AppText variant="bodyBold" tone={result.differenceMinor === 0 ? 'income' : 'expense'}>
              {result.differenceMinor === 0 ? '✓ ' : ''}
              {describeDifference(result.differenceMinor, money)}
            </AppText>
          </View>
          {result.differenceMinor !== 0 ? (
            <>
              <AppText variant="caption">
                Look through your bank statement for a payment you haven’t added. Or add the difference now as a single
                adjustment and sort out the details later.
              </AppText>
              <Button
                label={result.differenceMinor < 0 ? `Add the missing ${money(-result.differenceMinor)} as an expense` : `Add the missing ${money(result.differenceMinor)} as income`}
                onPress={() => addMissing(result)}
              />
            </>
          ) : null}
          <Button label="Done" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.form, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <AppText variant="caption">
            Type the balance your bank app or wallet shows right now, and the app compares it with what your records say it
            should be.
          </AppText>
          {accounts.length > 1 ? (
            <View style={styles.block}>
              <AppText variant="caption" style={styles.label}>
                Account
              </AppText>
              <View style={styles.row}>
                {accounts.map((a) => (
                  <Chip key={a.id} label={a.name} dotColor={a.color} selected={accountId === a.id} onPress={() => { setAccountId(a.id); setError(null); }} />
                ))}
              </View>
            </View>
          ) : null}
          <TextField
            label={`Balance shown${account ? ` for ${account.name}` : ''}`}
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
          <DateField label="As of" value={date} onChange={setDate} maxToday />
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}
          <Button label={saving ? 'Checking…' : 'Check it'} onPress={save} disabled={saving} />
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
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  errorBox: { padding: spacing.md - 4, borderRadius: 12 },
});
