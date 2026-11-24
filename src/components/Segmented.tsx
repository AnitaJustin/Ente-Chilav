import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean; // greyed out and not tappable
};

// A row of connected buttons where exactly one is selected, like "Money out | Money in".
export function Segmented<T extends string>({ options, value, onChange, disabled }: Props<T>) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface2, borderColor: colors.line }, disabled && { opacity: 0.55 }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: !!disabled }}
            style={[styles.item, selected && { backgroundColor: colors.accent }]}>
            <AppText
              variant="bodyBold"
              style={{ color: selected ? colors.accentInk : colors.ink2, fontSize: fs(14) }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  item: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 3,
    paddingHorizontal: spacing.sm,
  },
});
