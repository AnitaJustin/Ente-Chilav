import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  CURRENCIES,
  formatMoney,
  getCurrency,
  getRecentAverages,
  listBudgets,
  listCategories,
  parseAmount,
  setBudgets,
  type Category,
  type CurrencyCode,
} from '@/db';
import { niceBudget } from '@/features/budgets';
import { minorToInputText, sanitizeAmountText } from '@/features/transactionForm';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { radius, spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function BudgetsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [averages, setAverages] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cats, budgets, avg, cur] = await Promise.all([
        listCategories(db),
        listBudgets(db),
        getRecentAverages(db),
        getCurrency(db),
      ]);
      if (!alive) return;
      const spending = cats.filter((c) => c.kind === 'expense');
      const initial: Record<number, string> = {};
      for (const b of budgets) initial[b.categoryId] = minorToInputText(b.amountMinor);
      setCategories(spending);
      setTexts(initial);
      setAverages(avg);
      setCurrency(cur);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  const symbol = CURRENCIES[currency].symbol;
  const hasAverages = categories.some((c) => (averages[c.id] ?? 0) > 0);

  function edit(id: number, text: string) {
    setTexts((t) => ({ ...t, [id]: sanitizeAmountText(text) }));
    setSaved(false);
    setError(null);
  }

  // Fills only the empty boxes, so anything you've typed is never overwritten.
  function fillFromAverages() {
    setTexts((t) => {
      const next = { ...t };
      for (const c of categories) {
        const avg = averages[c.id] ?? 0;
        if (avg > 0 && !(next[c.id] ?? '').trim()) next[c.id] = minorToInputText(niceBudget(avg));
      }
      return next;
    });
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (saving) return;
    const entries: { categoryId: number; amountMinor: number | null }[] = [];
    for (const c of categories) {
      const text = (texts[c.id] ?? '').trim();
      if (!text) {
        entries.push({ categoryId: c.id, amountMinor: null });
        continue;
      }
      const minor = parseAmount(text);
      if (minor === null) {
        setError(`Check the amount for ${c.name}.`);
        return;
      }
      entries.push({ categoryId: c.id, amountMinor: minor > 0 ? minor : null });
    }
    setSaving(true);
    try {
      await setBudgets(db, entries);
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the budgets.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScreenHeader title="Monthly budgets" subtitle="A spending limit per category, per month" />
      {loading ? (
        <View style={styles.center}>
          <AppText variant="caption">Loading…</AppText>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <Card>
            <AppText>
              Type a limit for each category you want to watch, and leave the rest empty. The Overview
              shows how much of each you’ve used this month.
            </AppText>
            {hasAverages ? (
              <Button label="Fill empty ones from my recent spending" variant="secondary" onPress={fillFromAverages} />
            ) : (
              <AppText variant="caption">
                Once you have a full month of transactions, you’ll be able to fill these in from your
                recent spending.
              </AppText>
            )}
          </Card>

          <Card>
            {categories.map((c, i) => {
              const avg = averages[c.id] ?? 0;
              return (
                <View
                  key={c.id}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <View style={styles.names}>
                      <AppText variant="bodyBold" numberOfLines={1}>
                        {c.name}
                      </AppText>
                      {avg > 0 ? (
                        <AppText variant="caption">Usually {formatMoney(avg, currency)} a month</AppText>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.inputBox, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
                    <AppText variant="bodyBold" tone="ink3">
                      {symbol}
                    </AppText>
                    <TextInput
                      value={texts[c.id] ?? ''}
                      onChangeText={(t) => edit(c.id, t)}
                      placeholder="No limit"
                      placeholderTextColor={colors.ink3}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      accessibilityLabel={`${c.name} monthly budget`}
                      style={[styles.input, { color: colors.ink }]}
                    />
                  </View>
                </View>
              );
            })}
          </Card>

          {error ? (
            <View style={[styles.message, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}
          {saved ? (
            <View style={[styles.message, { backgroundColor: colors.incomeSoft }]}>
              <AppText variant="bodyBold" tone="income">
                Budgets saved.
              </AppText>
            </View>
          ) : null}
          <Button label={saving ? 'Saving…' : 'Save budgets'} onPress={save} disabled={saving} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  names: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 132,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    minHeight: 42,
  },
  input: { flex: 1, fontSize: fs(15), paddingVertical: spacing.xs, textAlign: 'right' },
  message: { padding: spacing.md - 4, borderRadius: 12 },
});
