import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ColorSwatches } from '@/components/ColorSwatches';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import {
  addCategory,
  countTransactionsInCategory,
  deleteCategory,
  getCategory,
  listCategories,
  MAX_CATEGORY_NAME,
  setCategoryHidden,
  updateCategory,
  type Category,
  type CategoryKind,
} from '@/db';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { CATEGORY_COLORS } from '@/theme/categoryColors';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const CATCH_ALL = ['Other expense', 'Other income'];

export default function CategoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [original, setOriginal] = useState<Category | null>(null);
  const [txCount, setTxCount] = useState(0);

  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [hidden, setHidden] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (editingId == null) {
        // Pick a different starting colour for each new category.
        const all = await listCategories(db, { includeHidden: true });
        if (!alive) return;
        setColor(CATEGORY_COLORS[all.length % CATEGORY_COLORS.length]);
      } else {
        const cat = await getCategory(db, editingId);
        if (!alive) return;
        if (!cat) {
          setMissing(true);
        } else {
          const n = await countTransactionsInCategory(db, editingId);
          if (!alive) return;
          setOriginal(cat);
          setTxCount(n);
          setName(cat.name);
          setColor(cat.color);
          setKind(cat.kind);
          setHidden(cat.isHidden);
        }
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db, editingId]);

  const builtIn = !!original?.isDefault;
  const kindLocked = builtIn || (editingId != null && txCount > 0);
  const catchAll = builtIn && !!original && CATCH_ALL.includes(original.name);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      if (editingId == null) {
        await addCategory(db, { name, color, kind });
      } else {
        await updateCategory(db, editingId, builtIn ? { color } : { name, color, kind });
        if (original && hidden !== original.isHidden) await setCategoryHidden(db, editingId, hidden);
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (editingId == null || !original) return;
    Alert.alert(
      `Delete “${original.name}”?`,
      txCount > 0
        ? `Its ${txCount} transaction${txCount === 1 ? '' : 's'} will move to “Other expense” or “Other income”, so nothing is lost from your totals.`
        : 'This category has no transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(db, editingId);
              router.back();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete.');
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.topBar}>
        <AppText variant="heading">{editingId != null ? 'Edit category' : 'New category'}</AppText>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <AppText variant="caption">Loading…</AppText>
        </View>
      ) : missing ? (
        <View style={styles.center}>
          <AppText variant="heading">Category not found</AppText>
          <Button label="Go back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.form, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <TextField
            label="Name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="e.g. Pets, Gym, Pocket money"
            maxLength={MAX_CATEGORY_NAME}
            editable={!builtIn}
            autoFocus={editingId == null}
            autoCapitalize="words"
          />
          {builtIn ? <AppText variant="caption">Built-in category names can’t be changed, but you can recolour or hide them.</AppText> : null}

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Type
            </AppText>
            <Segmented<CategoryKind>
              options={[
                { value: 'expense', label: 'Spending' },
                { value: 'income', label: 'Income' },
                { value: 'ignore', label: 'Not counted' },
              ]}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setError(null);
              }}
              disabled={kindLocked}
            />
            <AppText variant="caption">
              {builtIn
                ? 'The type of a built-in category is fixed.'
                : kindLocked
                  ? 'The type is locked because this category already has transactions.'
                  : kind === 'ignore'
                    ? '“Not counted” is for moving money between your own accounts. It’s left out of every total.'
                    : kind === 'income'
                      ? 'Choose this for money coming in.'
                      : 'Choose this for money going out. You can set a monthly budget for it.'}
            </AppText>
          </View>

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Colour
            </AppText>
            <ColorSwatches value={color} onChange={setColor} />
          </View>

          {editingId != null ? (
            <View style={styles.block}>
              <AppText variant="caption" style={styles.label}>
                Visibility
              </AppText>
              <View style={styles.row}>
                <Chip label={hidden ? 'Hidden from lists' : 'Shown in lists'} selected={hidden} onPress={() => setHidden(!hidden)} />
              </View>
              <AppText variant="caption">
                {catchAll
                  ? 'This is the catch-all category, so it always stays visible.'
                  : 'Hidden categories disappear from the pickers. Past transactions keep them, and they still count in your totals.'}
              </AppText>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}

          <Button label={saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add category'} onPress={save} disabled={saving} />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
          {editingId != null && !builtIn ? <Button label="Delete category" variant="danger" onPress={confirmDelete} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  close: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  form: { padding: spacing.md, gap: spacing.md },
  block: { gap: spacing.sm },
  label: { fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm },
  errorBox: { padding: spacing.md - 4, borderRadius: 12 },
});
