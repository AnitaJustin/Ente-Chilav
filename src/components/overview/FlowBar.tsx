import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { formatMoney, type CurrencyCode } from '@/db';
import type { CategoryStat } from '@/features/analysis';
import { flowBlocks } from '@/features/savings';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = {
  categories: CategoryStat[]; // spending, biggest first
  inflowMinor: number;
  outflowMinor: number;
  currency: CurrencyCode;
  // Leave this out if you have no savings accounts. If you do have some, pass how much you moved into them
  // (zero if nothing): the bar then shows just your spending and your savings, filling the whole width.
  movedToSavingsMinor?: number;
};

// One bar showing where your money went. Each coloured block is a spending category.
//   Without savings accounts, the accent block at the end is what you kept, as a share of your income.
//   With savings accounts, the last block is what you moved into them, and the bar is spending and savings only.
export function FlowBar({ categories, inflowMinor, outflowMinor, currency, movedToSavingsMinor }: Props) {
  const { colors } = useTheme();
  const savingsMode = movedToSavingsMinor !== undefined;
  const blocks = flowBlocks(categories, inflowMinor, outflowMinor, movedToSavingsMinor);
  const colorOf = new Map(categories.map((c) => [c.categoryId, c.color]));
  const barTotal = Math.max(1, blocks.reduce((sum, b) => sum + b.amountMinor, 0));
  const total = Math.max(inflowMinor, outflowMinor, 1);
  const overspent = !savingsMode && outflowMinor > inflowMinor && inflowMinor > 0;
  const lastBlock = blocks.find((b) => b.kind === 'kept' || b.kind === 'savings');
  const lastAmount = lastBlock?.amountMinor ?? 0;

  const legend = categories.slice(0, 6);
  const more = categories.length - legend.length;
  // Percentages match the bar: of the bar's whole width with savings accounts, otherwise of your spending / income.
  const categoryShare = (minor: number) => Math.round((minor / (savingsMode ? barTotal : Math.max(outflowMinor, 1))) * 100);
  const lastShare = Math.round((lastAmount / (savingsMode ? barTotal : Math.max(inflowMinor, 1))) * 100);

  const label = savingsMode
    ? `Spending and savings: spent ${formatMoney(outflowMinor, currency)}${lastAmount > 0 ? `, moved to savings ${formatMoney(lastAmount, currency)}` : ''}`
    : `Income split: spent ${formatMoney(outflowMinor, currency)}, saved ${formatMoney(lastAmount, currency)}`;

  return (
    <View style={styles.wrap}>
      <View accessibilityRole="image" accessibilityLabel={label} style={[styles.track, { backgroundColor: colors.surface2 }]}>
        {blocks.map((b) => (
          <View
            key={b.kind === 'category' ? `c${b.id}` : b.kind}
            style={[
              styles.segment,
              { flex: b.amountMinor, backgroundColor: b.kind === 'category' ? (colorOf.get(b.id) as string) : b.kind === 'savings' ? colors.savings : colors.accent },
            ]}
          />
        ))}
        {overspent ? (
          <View style={[styles.cut, { left: `${(inflowMinor / total) * 100}%`, backgroundColor: colors.ink }]} />
        ) : null}
      </View>
      <View style={styles.caption}>
        <AppText variant="caption">0</AppText>
        <AppText variant="caption">{savingsMode ? 'Spending and savings' : overspent ? 'Spending (income ends at the line)' : 'Income'}</AppText>
      </View>
      <View style={styles.legend}>
        {legend.map((c) => (
          <View key={c.categoryId} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <AppText variant="caption">
              {c.name} {categoryShare(c.amountMinor)}%
            </AppText>
          </View>
        ))}
        {more > 0 ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.line }]} />
            <AppText variant="caption">+{more} more</AppText>
          </View>
        ) : null}
        {lastAmount > 0 ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: savingsMode ? colors.savings : colors.accent }]} />
            <AppText variant="caption">
              {savingsMode ? 'Moved to savings' : 'Saved'} {lastShare}%
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  track: { flexDirection: 'row', height: 40, borderRadius: radius.md, overflow: 'hidden', gap: 2 },
  segment: { height: '100%', minWidth: 2 },
  cut: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  caption: { flexDirection: 'row', justifyContent: 'space-between' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 3 },
});
