import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  overlay?: ReactNode; // floats above the scrolling content, e.g. the + button
};

// The frame every tab uses: safe area at the top, a title, and a scrolling body.
export function Screen({ title, subtitle, children, overlay }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="title">{title}</AppText>
          {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
        </View>
        {children}
      </ScrollView>
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: 100, gap: spacing.md },
  header: { marginTop: spacing.sm, gap: spacing.xs },
});
