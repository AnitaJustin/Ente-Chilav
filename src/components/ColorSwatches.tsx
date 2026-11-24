import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { CATEGORY_COLORS } from '@/theme/categoryColors';
import { spacing } from '@/theme/tokens';

// A grid of colour circles. Tap one to choose it.
export function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <View style={styles.grid}>
      {CATEGORY_COLORS.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="button"
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ selected }}
            style={[styles.swatch, { backgroundColor: c }]}>
            {selected ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  swatch: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
