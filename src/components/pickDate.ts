import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

import { todayYmd } from '@/db';

// Opens the phone's calendar and reports the chosen day as YYYY-MM-DD.
export function pickDate(value: string, onChange: (value: string) => void, maxToday = true): void {
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
