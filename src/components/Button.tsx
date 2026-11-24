import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({ label, variant = 'primary', disabled, ...rest }: Props) {
  const { colors } = useTheme();

  const look = {
    primary: { bg: colors.accent, border: colors.accent, text: colors.accentInk },
    secondary: { bg: colors.surface2, border: colors.line, text: colors.ink },
    danger: { bg: colors.expenseSoft, border: colors.expenseSoft, text: colors.expense },
  }[variant];

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.bg, borderColor: look.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <AppText variant="bodyBold" style={{ color: look.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
