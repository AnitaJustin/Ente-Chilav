import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { formatMoney, type CurrencyCode } from '@/db';
import { changeFraction, percentText, type CategoryStat } from '@/features/analysis';
import { budgetStatus, type CategoryLine } from '@/features/budgets';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = {
  lines: CategoryLine[]; // biggest first, with each category's budget if it has one
  outflowMinor: number;
  previous: CategoryStat[] | null; // same categories for the previous month, or null to hide changes
  currency: CurrencyCode;
  onPressCategory: (categoryId: number) => void;
};

// "Where it went": one tappable row per spending category, with budget progress where set.
export function CategoryBreakdown({ lines, outflowMinor, previous, currency, onPressCategory }: Props) {
  const { colors } = useTheme();
  const max = Math.max(1, ...lines.map((l) => l.amountMinor));
  const prevById = previous ? new Map(previous.map((c) => [c.categoryId, c.amountMinor])) : null;
  const money = (minor: number) => formatMoney(minor, currency);

  return (
    <View>
      {lines.map((c) => {
        const prev = prevById ? (prevById.get(c.categoryId) ?? 0) : null;
        const change = prev !== null ? changeFraction(c.amountMinor, prev) : null;
        const hasBudget = c.budgetMinor !== null;
        const status = hasBudget ? budgetStatus(c.amountMinor, c.budgetMinor as number) : null;
        const statusColor = status === 'over' ? colors.expense : status === 'close' ? colors.warn : colors.income;
        const budgetText = hasBudget
          ? status === 'over'
            ? `${money(c.amountMinor - (c.budgetMinor as number))} over the ${money(c.budgetMinor as number)} budget`
            : `${money((c.budgetMinor as number) - c.amountMinor)} left of ${money(c.budgetMinor as number)}`
          : null;

        return (
          <Pressable
            key={c.categoryId}
            onPress={() => onPressCategory(c.categoryId)}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}, ${money(c.amountMinor)}, ${percentText(c.amountMinor / Math.max(outflowMinor, 1))} of spending${budgetText ? '. ' + budgetText : ''}. Tap to see transactions.`}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
            <View style={styles.top}>
              <View style={styles.name}>
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <AppText variant="bodyBold" numberOfLines={1} style={styles.nameText}>
                  {c.name}
                </AppText>
                {c.count > 0 ? <AppText variant="caption">{c.count}</AppText> : null}
              </View>
              <View style={styles.amount}>
                <AppText variant="bodyBold">{money(c.amountMinor)}</AppText>
                <AppText variant="caption">
                  {percentText(c.amountMinor / Math.max(outflowMinor, 1))}
                  {change !== null ? '  ' : ''}
                  {change !== null ? (
                    <AppText variant="caption" style={{ color: change > 0 ? colors.expense : colors.income }}>
                      {(change > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(change * 100)) + '%'}
                    </AppText>
                  ) : prev === 0 && c.amountMinor > 0 ? (
                    <AppText variant="caption">  New</AppText>
                  ) : null}
                </AppText>
              </View>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
              <View style={{ width: `${(c.amountMinor / max) * 100}%`, height: '100%', backgroundColor: c.color, borderRadius: 99 }} />
            </View>
            {hasBudget ? (
              <View style={styles.budget}>
                <View style={[styles.budgetTrack, { backgroundColor: colors.surface2 }]}>
                  <View
                    style={{
                      width: `${Math.min(100, (c.amountMinor / (c.budgetMinor as number)) * 100)}%`,
                      height: '100%',
                      backgroundColor: statusColor,
                      borderRadius: 99,
                    }}
                  />
                </View>
                <AppText variant="caption" style={{ color: statusColor }}>
                  {budgetText}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xs, borderRadius: radius.md, gap: 6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  amount: { alignItems: 'flex-end' },
  track: { height: 8, borderRadius: 99, overflow: 'hidden' },
  budget: { gap: 3 },
  budgetTrack: { height: 4, borderRadius: 99, overflow: 'hidden' },
});
