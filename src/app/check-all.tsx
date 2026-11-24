import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DateField } from '@/components/DateField';
import { ModalHeader } from '@/components/ModalHeader';
import {
  addBalanceChecks,
  CURRENCIES,
  formatMoney,
  getCurrency,
  isTracked,
  listAccounts,
  parseAmount,
  todayYmd,
  type Account,
  type CheckAllResult,
  type CurrencyCode,
} from '@/db';
import { describeDifference } from '@/features/accounts';
import { sanitizeAmountText } from '@/features/transactionForm';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { radius, spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function CheckAllScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]); // only accounts whose balance is tracked
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [date, setDate] = useState(params.date && params.date <= todayYmd() ? params.date : todayYmd());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CheckAllResult | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, cur] = await Promise.all([listAccounts(db), getCurrency(db)]);
      if (!alive) return;
      setAccounts(list.filter(isTracked));
      setCurrency(cur);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  const money = (m: number) => formatMoney(m, currency);
  const symbol = CURRENCIES[currency].symbol;

  async function save() {
    if (saving) return;
    const entries: { accountId: number; actualMinor: number }[] = [];
    for (const a of accounts) {
      const text = (texts[a.id] ?? '').trim();
      if (!text) continue; // left empty: skipped
      const minor = parseAmount(text);
      if (minor === null) {
        setError(`Check the balance you entered for ${a.name}.`);
        return;
      }
      entries.push({ accountId: a.id, actualMinor: minor });
    }
    if (entries.length === 0) {
      setError('Enter at least one balance.');
      return;
    }
    setSaving(true);
    try {
      setResult(await addBalanceChecks(db, { date, entries }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Opens the add-transaction form with the missing amount already filled in.
  function addMissing(r: CheckAllResult['results'][number]) {
    router.push({
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

  function verdict(r: CheckAllResult): { good: boolean; text: string } {
    const allMatch = r.results.every((x) => x.differenceMinor === 0);
    if (allMatch) {
      return { good: true, text: `✓ Everything matches. ${r.results.length === 1 ? 'The account' : `Your ${r.results.length} accounts`} add up to ${money(r.actualTotalMinor)}.` };
    }
    if (r.differenceMinor === 0) {
      return { good: false, text: 'The total matches your records, but individual accounts are off. The mistakes cancel each other out, so look at the accounts below.' };
    }
    return { good: false, text: `Together your accounts show ${money(r.actualTotalMinor)} and your records say ${money(r.expectedTotalMinor)}. ${describeDifference(r.differenceMinor, money)}` };
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ModalHeader title="Check all balances" />
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
          {(() => {
            const v = verdict(result);
            return (
              <View style={[styles.box, { backgroundColor: v.good ? colors.incomeSoft : colors.expenseSoft }]}>
                <AppText variant="bodyBold" tone={v.good ? 'income' : 'expense'}>
                  {v.text}
                </AppText>
              </View>
            );
          })()}

          <Card>
            <AppText variant="heading">Total</AppText>
            <View style={styles.line}>
              <AppText>Your records say</AppText>
              <AppText variant="bodyBold">{money(result.expectedTotalMinor)}</AppText>
            </View>
            <View style={styles.line}>
              <AppText>Your accounts show</AppText>
              <AppText variant="bodyBold">{money(result.actualTotalMinor)}</AppText>
            </View>
          </Card>

          {result.results.map((r) => (
            <Card key={r.id}>
              <AppText variant="bodyBold">{r.name}</AppText>
              <View style={styles.line}>
                <AppText variant="caption">Your records say</AppText>
                <AppText variant="caption">{money(r.expectedMinor)}</AppText>
              </View>
              <View style={styles.line}>
                <AppText variant="caption">Shown by the account</AppText>
                <AppText variant="caption">{money(r.actualMinor)}</AppText>
              </View>
              <AppText variant="caption" style={{ color: r.differenceMinor === 0 ? colors.income : colors.expense }}>
                {r.differenceMinor === 0 ? '✓ ' : ''}
                {describeDifference(r.differenceMinor, money)}
              </AppText>
              {r.differenceMinor !== 0 ? (
                <Button
                  label={r.differenceMinor < 0 ? `Add the missing ${money(-r.differenceMinor)} as an expense` : `Add the missing ${money(r.differenceMinor)} as income`}
                  variant="secondary"
                  onPress={() => addMissing(r)}
                />
              ) : null}
            </Card>
          ))}
          <Button label="Done" onPress={() => router.back()} />
        </ScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.form, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <AppText variant="caption">
            Type what each bank app or wallet shows right now. The app checks the total first, then each account. Leave an
            account empty to skip it.
          </AppText>
          <DateField label="As of" value={date} onChange={setDate} maxToday />
          <Card>
            {accounts.map((a, i) => (
              <View key={a.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={styles.rowLeft}>
                  <View style={[styles.dot, { backgroundColor: a.color }]} />
                  <AppText variant="bodyBold" numberOfLines={1} style={styles.name}>
                    {a.name}
                  </AppText>
                </View>
                <View style={[styles.inputBox, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
                  <AppText variant="bodyBold" tone="ink3">
                    {symbol}
                  </AppText>
                  <TextInput
                    value={texts[a.id] ?? ''}
                    onChangeText={(t) => {
                      setTexts((prev) => ({ ...prev, [a.id]: sanitizeAmountText(t) }));
                      setError(null);
                    }}
                    placeholder="Skip"
                    placeholderTextColor={colors.ink3}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    accessibilityLabel={`${a.name} balance shown`}
                    style={[styles.input, { color: colors.ink }]}
                  />
                </View>
              </View>
            ))}
          </Card>
          {error ? (
            <View style={[styles.box, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}
          <Button label={saving ? 'Checking…' : 'Check them all'} onPress={save} disabled={saving} />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 150, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm + 2, minHeight: 42 },
  input: { flex: 1, fontSize: fs(15), paddingVertical: spacing.xs, textAlign: 'right' },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  box: { padding: spacing.md - 4, borderRadius: 12 },
});
