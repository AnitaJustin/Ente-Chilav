import { Pressable, StyleSheet, View } from 'react-native';

import { formatMoney, type CurrencyCode, type TransactionRow as Row } from '@/db';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

type Props = {
  row: Row;
  currency: CurrencyCode;
  first: boolean; // first row of a day: rounded top corners
  last: boolean; // last row of a day: rounded bottom corners
  showAccount?: boolean; // name the account (useful when you have more than one)
  onPress: () => void;
};

export function TransactionRow({ row, currency, first, last, showAccount, onPress }: Props) {
  const { colors } = useTheme();
  const credit = row.type === 'credit';
  const ignored = row.categoryKind === 'ignore';
  const amount = (credit ? '+' : '−') + formatMoney(row.amountMinor, currency);
  const detail = [ignored ? 'Not counted' : null, row.categoryName, showAccount ? row.accountName : null, row.note || null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.description}, ${credit ? 'received' : 'paid'} ${formatMoney(row.amountMinor, currency)}, ${row.categoryName}${showAccount ? ', ' + row.accountName : ''}. Tap to edit.`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surface2 : colors.surface,
          borderColor: colors.line,
          borderTopLeftRadius: first ? radius.lg : 0,
          borderTopRightRadius: first ? radius.lg : 0,
          borderBottomLeftRadius: last ? radius.lg : 0,
          borderBottomRightRadius: last ? radius.lg : 0,
          borderBottomWidth: last ? 1 : 0,
          borderTopWidth: 1,
        },
      ]}>
      <View style={[styles.badge, { backgroundColor: row.categoryColor + '2B' }]}>
        <View style={[styles.dot, { backgroundColor: row.categoryColor }]} />
      </View>
      <View style={styles.middle}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {row.description}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {detail}
        </AppText>
      </View>
      <AppText
        variant="bodyBold"
        style={{ color: credit ? colors.income : colors.ink, fontVariant: ['tabular-nums'] }}>
        {amount}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  middle: { flex: 1, gap: 1 },
});
