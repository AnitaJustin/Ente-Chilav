import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, StyleSheet, View } from 'react-native';

import { addDays, longDateLabel, todayYmd } from '@/db';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Chip } from './Chip';

type Props = {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  extras?: { label: string; value: string }[]; // more quick choices, e.g. "Start of this month"
  maxToday?: boolean; // don't allow dates after today
};

// A date shown in words, with quick choices and a calendar.
export function DateField({ label, value, onChange, extras = [], maxToday }: Props) {
  const today = todayYmd();
  const yesterday = addDays(today, -1);

  function pick() {
    if (Platform.OS !== 'android') return;
    const [y, m, d] = value.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d),
      mode: 'date',
      maximumDate: maxToday ? new Date() : undefined,
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) onChange(todayYmd(selected));
      },
    });
  }

  return (
    <View style={styles.block}>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="bodyBold">{longDateLabel(value)}</AppText>
      <View style={styles.row}>
        <Chip label="Today" selected={value === today} onPress={() => onChange(today)} />
        <Chip label="Yesterday" selected={value === yesterday} onPress={() => onChange(yesterday)} />
        {extras.map((e) => (
          <Chip key={e.label} label={e.label} selected={value === e.value} onPress={() => onChange(e.value)} />
        ))}
        <Chip label="Pick a date" onPress={pick} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  label: { fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
