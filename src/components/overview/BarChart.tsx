import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { formatCompact, type CurrencyCode } from '@/db';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type BarGroup = {
  key: string;
  label?: string; // shown under the bars
  bars: { value: number; color: string }[]; // values in paise/cents
  shaded?: boolean; // lightly tint the background, e.g. weekends
  accessibilityLabel: string;
};

type Props = {
  groups: BarGroup[];
  currency: CurrencyCode;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  height?: number;
};

const AXIS_WIDTH = 44;

// A round "nice" top value for the chart: 83,000 -> 100,000, 22,000 -> 25,000.
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / e;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * e;
}

// A simple bar chart. Tap a bar to select it. Built from plain views, so it needs no chart library.
export function BarChart({ groups, currency, selectedIndex, onSelect, height = 150 }: Props) {
  const { colors } = useTheme();
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value))));
  const tight = groups.length > 20;

  return (
    <View>
      <View style={styles.row}>
        <View style={{ width: AXIS_WIDTH, height }}>
          <AppText variant="caption" style={[styles.axisLabel, { top: -8 }]}>
            {formatCompact(max, currency)}
          </AppText>
          <AppText variant="caption" style={[styles.axisLabel, { top: height / 2 - 8 }]}>
            {formatCompact(max / 2, currency)}
          </AppText>
        </View>

        <View style={[styles.plot, { height }]}>
          <View style={[styles.gridLine, { top: 0, borderColor: colors.line }]} />
          <View style={[styles.gridLine, { top: height / 2, borderColor: colors.line }]} />
          <View style={[styles.gridLine, { bottom: 0, borderColor: colors.line }]} />
          <View style={styles.columns}>
            {groups.map((g, i) => (
              <Pressable
                key={g.key}
                onPress={() => onSelect(i)}
                accessibilityRole="button"
                accessibilityLabel={g.accessibilityLabel}
                style={[
                  styles.column,
                  { paddingHorizontal: tight ? 1 : 4 },
                  g.shaded && { backgroundColor: colors.surface2 },
                  selectedIndex === i && { backgroundColor: colors.accentSoft },
                ]}>
                {g.bars.map((b, j) => (
                  <View
                    key={j}
                    style={[
                      styles.bar,
                      {
                        height: b.value > 0 ? Math.max(2, (b.value / max) * height) : 0,
                        backgroundColor: b.color,
                      },
                    ]}
                  />
                ))}
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.row, { marginLeft: AXIS_WIDTH }]}>
        {groups.map((g) => (
          <View key={g.key} style={styles.labelCell}>
            {g.label ? (
              <AppText variant="caption" numberOfLines={1} style={styles.label}>
                {g.label}
              </AppText>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  axisLabel: { position: 'absolute', right: spacing.sm, textAlign: 'right' },
  plot: { flex: 1 },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  columns: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  bar: { flex: 1, maxWidth: 20, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  labelCell: { flex: 1, alignItems: 'center', overflow: 'visible', height: 18, marginTop: 4 },
  label: { width: 40, textAlign: 'center' },
});
