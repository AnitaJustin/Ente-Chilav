import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

import { AppText } from './AppText';

// Shown for a moment while the database opens.
export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={colors.accent} size="large" />
      <AppText variant="caption">Opening your ledger…</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});
