import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { spacing } from '@/theme/tokens';

export type MiniItem = {
  key: string;
  title: string;
  subtitle?: string;
  value: string;
  valueColor?: string;
  dotColor?: string;
};

// A compact list of "name ........ amount" rows.
export function MiniList({ items, emptyText }: { items: MiniItem[]; emptyText: string }) {
  if (items.length === 0) return <AppText variant="caption">{emptyText}</AppText>;
  return (
    <View style={styles.list}>
      {items.map((it) => (
        <View key={it.key} style={styles.row}>
          <View style={styles.left}>
            {it.dotColor ? <View style={[styles.dot, { backgroundColor: it.dotColor }]} /> : null}
            <View style={styles.texts}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {it.title}
              </AppText>
              {it.subtitle ? (
                <AppText variant="caption" numberOfLines={1}>
                  {it.subtitle}
                </AppText>
              ) : null}
            </View>
          </View>
          <AppText variant="bodyBold" style={it.valueColor ? { color: it.valueColor } : undefined}>
            {it.value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  texts: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
