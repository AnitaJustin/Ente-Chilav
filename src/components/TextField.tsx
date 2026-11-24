import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

type Props = TextInputProps & {
  label: string;
  prefix?: string; // e.g. the currency symbol, shown inside the box before the text
  invalid?: boolean;
};

export function TextField({ label, prefix, invalid, style, onFocus, onBlur, ...rest }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surface2,
            borderColor: invalid ? colors.expense : focused ? colors.accent : colors.line,
          },
        ]}>
        {prefix ? (
          <AppText variant="bodyBold" tone="ink3">
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          {...rest}
          placeholderTextColor={colors.ink3}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: colors.ink }, style]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontWeight: '600' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: fs(16), paddingVertical: spacing.sm },
});
