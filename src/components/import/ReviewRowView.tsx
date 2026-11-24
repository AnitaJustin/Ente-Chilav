import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { pickDate } from '@/components/pickDate';
import { longDateLabel } from '@/db';
import { sanitizeAmountText } from '@/features/transactionForm';
import type { ReviewRow } from '@/features/import/review';
import { radius, spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

type Props = {
  row: ReviewRow;
  symbol: string;
  categoryName: string;
  categoryColor: string;
  onChange: (key: string, patch: Partial<ReviewRow>) => void;
  onType: (key: string, type: 'debit' | 'credit') => void;
  onCategory: (key: string) => void;
  onUndoRepair: (key: string) => void;
};

function Badge({ text, tone, onPress, label }: { text: string; tone: 'warn' | 'ink3'; onPress?: () => void; label?: string }) {
  const { colors } = useTheme();
  const body = (
    <View style={[styles.badge, { borderColor: colors[tone] }]}>
      <AppText variant="caption" style={{ color: colors[tone], fontSize: fs(11) }}>
        {text}
      </AppText>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? text} hitSlop={6}>
      {body}
    </Pressable>
  );
}

// One transaction found in a screenshot, ready to check and change.
function ReviewRowViewBase({ row, symbol, categoryName, categoryColor, onChange, onType, onCategory, onUndoRepair }: Props) {
  const { colors } = useTheme();
  const dim = !row.include;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, opacity: dim ? 0.55 : 1 }]}>
      <View style={styles.top}>
        <Pressable
          onPress={() => onChange(row.key, { include: !row.include })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: row.include }}
          accessibilityLabel={`Include ${row.name}`}
          hitSlop={8}>
          <Ionicons name={row.include ? 'checkbox' : 'square-outline'} size={26} color={row.include ? colors.accent : colors.ink3} />
        </Pressable>
        <TextInput
          value={row.name}
          onChangeText={(t) => onChange(row.key, { name: t })}
          accessibilityLabel={`Name for ${row.name}`}
          maxLength={80}
          style={[styles.name, { color: colors.ink, backgroundColor: colors.surface2, borderColor: colors.line }]}
        />
        <View style={[styles.amountBox, { backgroundColor: colors.surface2, borderColor: colors.line }]}>
          <AppText variant="bodyBold" tone="ink3">
            {symbol}
          </AppText>
          <TextInput
            value={row.amountText}
            onChangeText={(t) => onChange(row.key, { amountText: sanitizeAmountText(t) })}
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessibilityLabel={`Amount for ${row.name}`}
            style={[styles.amount, { color: row.type === 'credit' ? colors.income : colors.ink }]}
          />
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={[styles.dir, { borderColor: colors.line }]}>
          {(['debit', 'credit'] as const).map((t) => {
            const on = row.type === t;
            return (
              <Pressable
                key={t}
                onPress={() => onType(row.key, t)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t === 'debit' ? 'Money out' : 'Money in'} for ${row.name}`}
                style={[styles.dirBtn, { backgroundColor: on ? (t === 'debit' ? colors.ink2 : colors.income) : 'transparent' }]}>
                <AppText variant="bodyBold" style={{ color: on ? colors.surface : colors.ink3, fontSize: fs(12) }}>
                  {t === 'debit' ? 'Out' : 'In'}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => onCategory(row.key)}
          accessibilityRole="button"
          accessibilityLabel={`Category for ${row.name}: ${categoryName}. Tap to change.`}
          style={[styles.category, { backgroundColor: colors.surface2, borderColor: row.categorySource === 'fallback' ? colors.warn : colors.line }]}>
          <View style={[styles.dot, { backgroundColor: categoryColor }]} />
          <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: fs(13), flexShrink: 1 }}>
            {categoryName}
          </AppText>
          <Ionicons name="chevron-down" size={14} color={colors.ink3} />
        </Pressable>
        <Pressable
          onPress={() => pickDate(row.date, (d) => onChange(row.key, { date: d, dateKnown: true }))}
          accessibilityRole="button"
          accessibilityLabel={`Date for ${row.name}: ${longDateLabel(row.date)}. Tap to change.`}
          style={styles.date}>
          <Ionicons name="calendar-outline" size={14} color={row.dateKnown ? colors.ink3 : colors.warn} />
          <AppText variant="caption" style={{ color: row.dateKnown ? colors.ink2 : colors.warn }}>
            {longDateLabel(row.date).replace(/^\w+, /, '')}
          </AppText>
        </Pressable>
      </View>

      {row.duplicate || row.uncertainDirection || row.pending || row.repairedFrom || row.categorySource === 'fallback' ? (
        <View style={styles.badges}>
          {row.duplicate === 'existing' ? <Badge text="Looks already added" tone="warn" /> : null}
          {row.duplicate === 'batch' ? <Badge text="Repeated in these screenshots" tone="warn" /> : null}
          {row.uncertainDirection ? <Badge text="Check: money in or out?" tone="warn" /> : null}
          {row.pending ? <Badge text="Pending" tone="ink3" /> : null}
          {row.repairedFrom ? (
            <Badge
              text={`Fixed: read as ${row.repairedFrom}. Tap to undo`}
              tone="ink3"
              onPress={() => onUndoRepair(row.key)}
              label={`Undo the fix for ${row.name}. It was first read as ${row.repairedFrom}.`}
            />
          ) : null}
          {row.categorySource === 'fallback' ? <Badge text="Please choose a category" tone="ink3" /> : null}
        </View>
      ) : null}
    </View>
  );
}

export const ReviewRowView = memo(ReviewRowViewBase);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm + 2, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, fontSize: fs(15), minHeight: 42 },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 118, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, minHeight: 42 },
  amount: { flex: 1, fontSize: fs(15), fontWeight: '700', paddingVertical: spacing.xs, textAlign: 'right' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingLeft: 34 },
  dir: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.pill, overflow: 'hidden' },
  dirBtn: { paddingHorizontal: spacing.sm + 4, paddingVertical: 5 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 5, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, paddingLeft: 34 },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
});
