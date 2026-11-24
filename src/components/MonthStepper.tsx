import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { monthLabel } from '@/db';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';
import { Chip } from './Chip';

type Props = {
  months: string[]; // oldest first, e.g. ['2026-09', '2026-10', '2026-11']
  value: string; // a month like '2026-11', or 'all'
  onChange: (value: string) => void;
  allowAll?: boolean; // show the "All time" switch (default true)
};

// "‹  November 2026  ›" with an "All time" switch.
export function MonthStepper({ months, value, onChange, allowAll = true }: Props) {
  const { colors } = useTheme();
  const index = months.indexOf(value);
  const isAll = value === 'all';
  const canPrev = !isAll && index > 0;
  const canNext = !isAll && index >= 0 && index < months.length - 1;

  function arrow(direction: 'back' | 'forward', enabled: boolean, onPress: () => void) {
    return (
      <Pressable
        onPress={onPress}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel={direction === 'back' ? 'Previous month' : 'Next month'}
        style={[
          styles.arrow,
          { backgroundColor: colors.surface, borderColor: colors.line },
          !enabled && styles.disabled,
        ]}>
        <Ionicons name={direction === 'back' ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.ink} />
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      {arrow('back', canPrev, () => onChange(months[index - 1]))}
      <View style={styles.label}>
        <AppText variant="bodyBold">{isAll ? 'All time' : monthLabel(value)}</AppText>
      </View>
      {arrow('forward', canNext, () => onChange(months[index + 1]))}
      {allowAll ? (
        <Chip
          label="All time"
          selected={isAll}
          onPress={() => onChange(isAll ? months[months.length - 1] : 'all')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  label: { flex: 1, alignItems: 'center' },
});
