import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

type Props = {
  label: string;
  selected?: boolean;
  dotColor?: string; // a small coloured dot, used for categories
  onPress: () => void;
};

// A small tappable pill. Highlighted when selected.
export function Chip({ label, selected, dotColor, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surface2,
          borderColor: selected ? colors.accent : colors.line,
        },
        pressed && styles.pressed,
      ]}>
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <AppText
        variant="bodyBold"
        style={{ color: selected ? colors.accentInk : colors.ink2, fontSize: fs(14) }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
    minHeight: 38,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pressed: { opacity: 0.8 },
});
