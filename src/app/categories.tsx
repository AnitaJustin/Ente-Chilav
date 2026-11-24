import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenHeader';
import { countTransactionsByCategory, listCategories, type Category, type CategoryKind } from '@/db';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const SECTIONS: { kind: CategoryKind; title: string; note: string }[] = [
  { kind: 'expense', title: 'Spending', note: 'For money going out' },
  { kind: 'income', title: 'Income', note: 'For money coming in' },
  { kind: 'ignore', title: 'Not counted', note: 'Moves between your own accounts; left out of all totals' },
];

export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [cats, byCat] = await Promise.all([listCategories(db, { includeHidden: true }), countTransactionsByCategory(db)]);
        if (!alive) return;
        setCategories(cats);
        setCounts(byCat);
        setLoaded(true);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScreenHeader title="Categories" subtitle="Add your own, recolour, or hide the ones you don’t use" />
      <ScrollView contentContainerStyle={styles.content}>
        <Button label="Add a category" onPress={() => router.push('/category')} />

        {loaded
          ? SECTIONS.map((section) => {
              const list = categories.filter((c) => c.kind === section.kind);
              if (list.length === 0) return null;
              return (
                <Card key={section.kind}>
                  <AppText variant="heading">{section.title}</AppText>
                  <AppText variant="caption">{section.note}</AppText>
                  <View>
                    {list.map((c, i) => {
                      const n = counts[c.id] ?? 0;
                      const detail = [
                        `${n} transaction${n === 1 ? '' : 's'}`,
                        c.isDefault ? 'Built-in' : 'Yours',
                        c.isHidden ? 'Hidden' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => router.push({ pathname: '/category', params: { id: String(c.id) } })}
                          accessibilityRole="button"
                          accessibilityLabel={`${c.name}. ${detail}. Tap to edit.`}
                          style={({ pressed }) => [
                            styles.row,
                            i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                            pressed && { backgroundColor: colors.surface2 },
                            c.isHidden && { opacity: 0.6 },
                          ]}>
                          <View style={[styles.dot, { backgroundColor: c.color }]} />
                          <View style={styles.names}>
                            <AppText variant="bodyBold" numberOfLines={1}>
                              {c.name}
                            </AppText>
                            <AppText variant="caption">{detail}</AppText>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, paddingVertical: spacing.sm + 2 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  names: { flex: 1 },
});
