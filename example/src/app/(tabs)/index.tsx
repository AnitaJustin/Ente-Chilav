import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { radius, spacing, type Palette } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

function Swatch({ label, colorKey }: { label: string; colorKey: keyof Palette }) {
  const { colors } = useTheme();
  return (
    <View style={styles.swatch}>
      <View style={[styles.chip, { backgroundColor: colors[colorKey] }]} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

export default function OverviewScreen() {
  return (
    <Screen title="Ente Chilav" subtitle="Your money, month by month">
      <Card>
        <AppText variant="heading">Welcome</AppText>
        <AppText>
          This is the Overview tab. Your savings summary, category breakdown and charts will
          appear here once we build them.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Colour check</AppText>
        <AppText variant="caption">
          These are the app’s main colours. Switch your phone between light and dark mode and
          watch them change.
        </AppText>
        <View style={styles.row}>
          <Swatch label="Accent" colorKey="accent" />
          <Swatch label="Money in" colorKey="income" />
          <Swatch label="Spent" colorKey="expense" />
          <Swatch label="Warning" colorKey="warn" />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  swatch: { alignItems: 'center', gap: spacing.xs },
  chip: { width: 44, height: 44, borderRadius: radius.md },
});
