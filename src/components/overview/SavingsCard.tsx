import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { formatMoney, type CurrencyCode, type SavingsMovement } from '@/db';
import { describeSavings } from '@/features/savings';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = { keptMinor: number; savings: SavingsMovement; currency: CurrencyCode };

// Of the money you kept, how much went into savings accounts (RDs, FDs...) and how much stayed in your bank.
export function SavingsCard({ keptMinor, savings, currency }: Props) {
  const { colors } = useTheme();
  const money = (m: number) => formatMoney(m, currency);
  const summary = describeSavings(keptMinor, savings, money);
  return (
    <Card>
      <AppText variant="heading">Savings accounts</AppText>
      {summary.bar ? (
        <>
          <View
            accessible
            accessibilityLabel={`Of ${money(keptMinor)} kept, ${money(summary.bar.savedMinor)} moved into savings accounts and ${money(summary.bar.stayedMinor)} stayed in your bank and cash`}
            style={[styles.bar, { backgroundColor: colors.surface2 }]}>
            {summary.bar.savedMinor > 0 ? <View style={[styles.segment, { flex: summary.bar.savedMinor, backgroundColor: colors.savings }]} /> : null}
            {summary.bar.stayedMinor > 0 ? <View style={[styles.segment, { flex: summary.bar.stayedMinor, backgroundColor: colors.accent }]} /> : null}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.savings }]} />
              <AppText variant="caption">Moved to savings {money(summary.bar.savedMinor)}</AppText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <AppText variant="caption">Still in bank and cash {money(summary.bar.stayedMinor)}</AppText>
            </View>
          </View>
        </>
      ) : null}
      {summary.lines.map((line, i) => (
        <AppText key={i} variant={i === 0 ? 'bodyBold' : 'caption'}>
          {line}
        </AppText>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden' },
  segment: { height: '100%' },
  legend: { gap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
