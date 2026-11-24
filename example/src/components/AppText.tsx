import { StyleSheet, Text, type TextProps } from 'react-native';

import type { Palette } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Variant = 'title' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'number';

type Props = TextProps & {
  variant?: Variant;
  tone?: keyof Palette; // pick a colour from the palette, e.g. tone="income"
};

const defaultTone: Record<Variant, keyof Palette> = {
  title: 'ink',
  heading: 'ink',
  body: 'ink2',
  bodyBold: 'ink',
  caption: 'ink3',
  number: 'ink',
};

export function AppText({ variant = 'body', tone, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[styles[variant], { color: colors[tone ?? defaultTone[variant]] }, style]}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
  number: { fontSize: 24, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
