import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import {
  daysInMonth,
  dayLabel,
  formatMoney,
  monthLabel,
  monthShortLabel,
  type CurrencyCode,
  type MonthTotals,
} from '@/db';
import type { Stats } from '@/features/analysis';
import { useTheme } from '@/theme/useTheme';

import { BarChart, type BarGroup } from './BarChart';

const pad = (n: number) => (n < 10 ? '0' + n : String(n));

// Spending on each day of a month. Weekends are tinted and today is highlighted.
export function DailyChart({ month, stats, today, currency }: { month: string; stats: Stats; today: string; currency: CurrencyCode }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [y, m] = month.split('-').map(Number);
  const n = daysInMonth(month);

  const groups: BarGroup[] = [];
  for (let d = 1; d <= n; d++) {
    const date = `${month}-${pad(d)}`;
    const value = stats.outflowByDay[date] ?? 0;
    const weekday = new Date(y, m - 1, d).getDay();
    groups.push({
      key: date,
      label: d === 1 || d % 5 === 0 ? String(d) : undefined,
      bars: [{ value, color: date === today ? colors.accent : colors.ink }],
      shaded: weekday === 0 || weekday === 6,
      accessibilityLabel: `${dayLabel(date)}: ${value ? formatMoney(value, currency) : 'no spending'}`,
    });
  }
  const sel = selected === null ? null : groups[selected];
  const value = selected === null ? 0 : (stats.outflowByDay[groups[selected].key] ?? 0);

  return (
    <View style={{ gap: 6 }}>
      <BarChart groups={groups} currency={currency} selectedIndex={selected} onSelect={setSelected} />
      <AppText variant="caption">
        {sel ? (
          <>
            <AppText variant="caption" style={{ fontWeight: '700', color: colors.ink }}>
              {dayLabel(sel.key)}
            </AppText>
            {' · ' + (value ? formatMoney(value, currency) : 'no spending')}
          </>
        ) : (
          'Tap a bar to see that day’s spending.'
        )}
      </AppText>
    </View>
  );
}

// Money in (green) and money out (dark) for each month. Tap a month to open it.
export function TrendChart({
  trend,
  selectedMonth,
  currency,
  onPickMonth,
}: {
  trend: MonthTotals[];
  selectedMonth: string;
  currency: CurrencyCode;
  onPickMonth: (month: string) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const groups: BarGroup[] = trend.map((t) => ({
    key: t.month,
    label: monthShortLabel(t.month),
    bars: [
      { value: t.inflowMinor, color: colors.income },
      { value: t.outflowMinor, color: colors.ink },
    ],
    accessibilityLabel: `${monthLabel(t.month)}: in ${formatMoney(t.inflowMinor, currency)}, spent ${formatMoney(t.outflowMinor, currency)}`,
  }));
  const highlighted = selected ?? trend.findIndex((t) => t.month === selectedMonth);
  const sel = selected === null ? null : trend[selected];

  return (
    <View style={{ gap: 6 }}>
      <BarChart
        groups={groups}
        currency={currency}
        selectedIndex={highlighted >= 0 ? highlighted : null}
        onSelect={(i) => {
          setSelected(i);
          onPickMonth(trend[i].month);
        }}
      />
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Legend color={colors.income} label="Came in" />
        <Legend color={colors.ink} label="Spent" />
      </View>
      <AppText variant="caption">
        {sel ? (
          <>
            <AppText variant="caption" style={{ fontWeight: '700', color: colors.ink }}>
              {monthLabel(sel.month)}
            </AppText>
            {` · in ${formatMoney(sel.inflowMinor, currency)} · spent ${formatMoney(sel.outflowMinor, currency)} · saved ${formatMoney(sel.inflowMinor - sel.outflowMinor, currency)}`}
          </>
        ) : (
          'Tap a month to open it.'
        )}
      </AppText>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

// Which days of the week you spend the most on.
export function WeekdayChart({ stats, currency }: { stats: Stats; currency: CurrencyCode }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const values = order.map((i) => stats.weekdayOutflow[i]);
  const total = values.reduce((a, b) => a + b, 0);
  const top = Math.max(...values);

  const groups: BarGroup[] = order.map((d, i) => ({
    key: names[d],
    label: names[d],
    bars: [{ value: values[i], color: values[i] === top ? colors.accent : colors.line }],
    accessibilityLabel: `${names[d]}: ${formatMoney(values[i], currency)}`,
  }));

  return (
    <View style={{ gap: 6 }}>
      <BarChart groups={groups} currency={currency} selectedIndex={selected} onSelect={setSelected} height={110} />
      <AppText variant="caption">
        {selected === null
          ? 'Tap a bar to see that weekday.'
          : `${names[order[selected]]} · ${formatMoney(values[selected], currency)} (${Math.round((values[selected] / Math.max(total, 1)) * 100)}% of spending)`}
      </AppText>
    </View>
  );
}
