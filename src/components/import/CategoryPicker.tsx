import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import type { Category } from '@/db';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type PickOptions = { applyToSame: boolean; remember: boolean };

type Props = {
  visible: boolean;
  title: string;
  categories: Category[]; // the ones that can be chosen
  merchant: string | null; // set when changing a single row: its merchant's name
  sameCount: number; // how many OTHER rows are from the same merchant
  onClose: () => void;
  onPick: (categoryId: number, options: PickOptions) => void;
};

function Check({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: value }} style={styles.check}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={24} color={value ? colors.accent : colors.ink3} />
      <AppText style={styles.checkLabel}>{label}</AppText>
    </Pressable>
  );
}

// A sheet that slides up to choose a category, with the choices about how far the change should reach.
export function CategoryPicker({ visible, title, categories, merchant, sameCount, onClose, onPick }: Props) {
  const { colors } = useTheme();
  const [applyToSame, setApplyToSame] = useState(true);
  const [remember, setRemember] = useState(true);

  // Each time it opens, start from the sensible defaults.
  useEffect(() => {
    if (visible) {
      setApplyToSame(true);
      setRemember(merchant !== null); // remembering is the default for one merchant, not for a bulk change
    }
  }, [visible, merchant]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close without changing" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <AppText variant="heading">{title}</AppText>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} dotColor={c.color} onPress={() => onPick(c.id, { applyToSame: merchant !== null && applyToSame, remember })} />
            ))}
          </ScrollView>
          {merchant !== null && sameCount > 0 ? (
            <Check
              label={`Also change the ${sameCount} other “${merchant}” row${sameCount === 1 ? '' : 's'}`}
              value={applyToSame}
              onPress={() => setApplyToSame(!applyToSame)}
            />
          ) : null}
          <Check
            label={merchant !== null ? `Remember this for next time` : 'Remember these merchants for next time'}
            value={remember}
            onPress={() => setRemember(!remember)}
          />
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm + 2, maxHeight: '75%' },
  scroll: { flexGrow: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.xs },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  checkLabel: { flex: 1 },
});
