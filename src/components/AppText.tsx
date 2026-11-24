import { StyleSheet, Text, type TextProps } from 'react-native';

import type { Palette } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

type Variant = 'title' | 'headline' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'number';

type Props = TextProps & {
  variant?: Variant;
  tone?: keyof Palette; // pick a colour from the palette, e.g. tone="income"
};

const defaultTone: Record<Variant, keyof Palette> = {
  title: 'ink',
  headline: 'ink',
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
  title: { fontSize: fs(30), lineHeight: fs(36), fontWeight: '700', letterSpacing: -0.6 },
  headline: { fontSize: fs(26), lineHeight: fs(33), fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: fs(18), lineHeight: fs(24), fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: fs(15), lineHeight: fs(22) },
  bodyBold: { fontSize: fs(15), lineHeight: fs(22), fontWeight: '600' },
  caption: { fontSize: fs(13), lineHeight: fs(18) },
  number: { fontSize: fs(24), lineHeight: fs(30), fontWeight: '700', fontVariant: ['tabular-nums'] },
});
