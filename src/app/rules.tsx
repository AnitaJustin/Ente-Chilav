import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ModalHeader } from '@/components/ModalHeader';
import { deleteRule, listCategories, listRules, type Category, type Rule } from '@/db';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The merchants you've told the app to put in a particular category, each with a way to forget it.
export default function RulesScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([listRules(db), listCategories(db, { includeHidden: true })]);
    setRules(r);
    setCategories(c);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function forget(key: string) {
    await deleteRule(db, key);
    await load();
  }

  const colorOf = (id: number) => categories.find((c) => c.id === id)?.color ?? colors.ink3;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ModalHeader title="Remembered merchants" />
      <ScrollView contentContainerStyle={styles.body}>
        <AppText variant="caption">
          When you add transactions from screenshots, the app puts these merchants in the category you chose before. Forget one and it
          goes back to guessing.
        </AppText>
        {rules === null ? (
          <AppText variant="caption">Loading…</AppText>
        ) : rules.length === 0 ? (
          <Card>
            <AppText variant="heading">Nothing remembered yet</AppText>
            <AppText>
              When you change a category while adding from screenshots, tick “Remember this for next time” and it will show up here.
            </AppText>
          </Card>
        ) : (
          <Card>
            {rules.map((r, i) => (
              <View key={r.merchantKey} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={styles.text}>
                  <AppText variant="bodyBold" numberOfLines={1}>
                    {r.merchantKey}
                  </AppText>
                  <View style={styles.cat}>
                    <View style={[styles.dot, { backgroundColor: colorOf(r.categoryId) }]} />
                    <AppText variant="caption">{r.categoryName}</AppText>
                  </View>
                </View>
                <Pressable
                  onPress={() => forget(r.merchantKey)}
                  accessibilityRole="button"
                  accessibilityLabel={`Forget ${r.merchantKey}`}
                  hitSlop={10}
                  style={[styles.forget, { backgroundColor: colors.surface2 }]}>
                  <Ionicons name="trash-outline" size={18} color={colors.ink2} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  text: { flex: 1, gap: 2 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  forget: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
