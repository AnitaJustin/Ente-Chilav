import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { MonthStepper } from '@/components/MonthStepper';
import { CategoryBreakdown } from '@/components/overview/CategoryBreakdown';
import { DailyChart, TrendChart, WeekdayChart } from '@/components/overview/Charts';
import { FlowBar } from '@/components/overview/FlowBar';
import { SavingsCard } from '@/components/overview/SavingsCard';
import { MiniList, type MiniItem } from '@/components/overview/MiniList';
import { Screen } from '@/components/Screen';
import { daysInMonth, formatMoney, monthLabel } from '@/db';
import {
  buildInsights,
  changeFraction,
  roundToWhole,
  type Insight,
} from '@/features/analysis';
import { buildCategoryLines, summaryText } from '@/features/budgets';
import { loadOverview, type OverviewData } from '@/features/overview';
import { useMonth } from '@/state/MonthContext';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function OverviewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { month, setMonth } = useMonth();
  const [data, setData] = useState<OverviewData | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    const d = await loadOverview(db, month);
    if (mine !== latest.current) return; // a newer request has already started
    setData(d);
    if (d.month !== month) setMonth(d.month);
  }, [db, month, setMonth]);

  // Reload when the month changes and whenever this tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addButton = <Fab label="Add transaction" onPress={() => router.push('/transaction')} />;

  if (!data) {
    return (
      <Screen title="Ente Chilavu" subtitle="Your money, month by month">
        <Card>
          <AppText variant="caption">Loading…</AppText>
        </Card>
      </Screen>
    );
  }

  if (data.totalCount === 0) {
    return (
      <Screen title="Ente Chilavu" subtitle="Your money, month by month" overlay={addButton}>
        <Card>
          <AppText variant="heading">Start with your first transaction</AppText>
          <AppText>
            Add what you’ve spent or received and this page fills with your savings, categories and
            charts.
          </AppText>
          <Button label="Add a transaction" onPress={() => router.push('/transaction')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Ente Chilavu" subtitle="Your money, month by month" overlay={addButton}>
      <OverviewBody
        data={data}
        onMonthChange={setMonth}
        onPressCategory={(categoryId) =>
          router.navigate({
            pathname: '/transactions',
            params: { categoryId: String(categoryId), nonce: String(Date.now()) },
          })
        }
      />
    </Screen>
  );
}

function OverviewBody({
  data,
  onMonthChange,
  onPressCategory,
}: {
  data: OverviewData;
  onMonthChange: (month: string) => void;
  onPressCategory: (categoryId: number) => void;
}) {
  const { colors } = useTheme();
  const { stats, prev, prevMonth, hasPrev, partial, dayNum, currency, month } = data;
  const isAll = month === 'all';
  const money = (minor: number) => formatMoney(minor, currency);
  const period = isAll ? 'All time' : monthLabel(month);
  const comparison = partial ? 'vs same days last month' : 'vs last month';

  // Spending rows, plus budgeted categories you haven't spent in yet. In "All time" a monthly
  // budget is multiplied by the number of months.
  const { lines, summary } = buildCategoryLines(stats, data.budgets, isAll ? data.months.length : 1);

  const insights: Insight[] = buildInsights({ stats, prev: hasPrev ? prev : null, month, prevMonth, partial, dayNum, currency });

  // Per-day average and where the month is heading
  const avgPerDay = dayNum ? roundToWhole(Math.round(stats.outflowMinor / dayNum)) : null;
  const projected =
    partial && dayNum && stats.outflowMinor > 0
      ? roundToWhole(Math.round((stats.outflowMinor * daysInMonth(month)) / dayNum))
      : null;

  const merchants: MiniItem[] = stats.merchants.slice(0, 5).map((m) => ({
    key: m.name,
    title: m.name || 'Unknown',
    subtitle: `${m.count} ${m.count === 1 ? 'payment' : 'payments'}`,
    value: money(m.amountMinor),
  }));
  const largest: MiniItem[] = stats.largestPayments.map((t) => ({
    key: String(t.id),
    title: t.description,
    subtitle: `${t.date} · ${t.categoryName}`,
    value: money(t.amountMinor),
  }));
  const income: MiniItem[] = stats.incomeByCategory.map((c) => ({
    key: String(c.categoryId),
    title: c.name,
    dotColor: c.color,
    value: money(c.amountMinor),
    valueColor: colors.income,
  }));

  const noData = stats.count === 0;

  return (
    <>
      <MonthStepper months={data.months} value={month} onChange={onMonthChange} />

      {/* Headline and where the income went */}
      <Card style={styles.hero}>
        <AppText variant="caption">{period}</AppText>
        <Headline data={data} />
        {!noData ? (
          <FlowBar
            categories={stats.expenseByCategory}
            inflowMinor={stats.inflowMinor}
            outflowMinor={stats.outflowMinor}
            currency={currency}
            movedToSavingsMinor={data.savings ? Math.max(0, data.savings.netMinor) : undefined}
          />
        ) : null}
        <View style={styles.kpis}>
          <Kpi
            label="Came in"
            value={money(stats.inflowMinor)}
            delta={!isAll && hasPrev && prev ? changeFraction(stats.inflowMinor, prev.inflowMinor) : null}
            goodWhenUp
            comparison={comparison}
          />
          <Kpi
            label="Spent"
            value={money(stats.outflowMinor)}
            delta={!isAll && hasPrev && prev ? changeFraction(stats.outflowMinor, prev.outflowMinor) : null}
            goodWhenUp={false}
            comparison={comparison}
          />
          <Kpi
            label="Saved"
            value={money(stats.savedMinor)}
            note={stats.inflowMinor > 0 ? `Savings rate ${Math.round((stats.savedMinor / stats.inflowMinor) * 100)}%` : undefined}
          />
          {avgPerDay !== null ? (
            <Kpi label="Per day" value={money(avgPerDay)} note={partial ? 'So far this month' : 'Month average'} />
          ) : null}
          {projected !== null ? <Kpi label="On pace for" value={money(projected)} note="Spending by month end" /> : null}
        </View>
      </Card>

      {data.savings && !noData ? <SavingsCard keptMinor={stats.savedMinor} savings={data.savings} currency={currency} /> : null}

      {noData ? (
        <Card>
          <AppText variant="heading">Nothing to show here yet</AppText>
          <AppText>There are no transactions for {period}. Add one with the + button, or step to another month.</AppText>
        </Card>
      ) : null}

      {lines.length > 0 ? (
        <Card>
          <AppText variant="heading">Where it went</AppText>
          <AppText variant="caption">Tap a category to see its transactions.</AppText>
          {summary ? <AppText variant="bodyBold">Budgets: {summaryText(summary)}</AppText> : null}
          <CategoryBreakdown
            lines={lines}
            outflowMinor={stats.outflowMinor}
            previous={!isAll && hasPrev && prev ? prev.expenseByCategory : null}
            currency={currency}
            onPressCategory={onPressCategory}
          />
        </Card>
      ) : null}

      {insights.length > 0 ? (
        <Card>
          <AppText variant="heading">What stands out</AppText>
          <AppText variant="caption">
            {isAll ? 'Across everything recorded' : partial ? 'Compared with the same days last month' : 'Compared with the month before'}
          </AppText>
          <View style={styles.insights}>
            {insights.map((parts, i) => (
              <View key={i} style={styles.insightRow}>
                <View style={[styles.bullet, { backgroundColor: colors.accent }]} />
                <AppText style={styles.insightText}>
                  {parts.map((p, j) =>
                    p.bold ? (
                      <AppText key={j} variant="bodyBold">
                        {p.text}
                      </AppText>
                    ) : (
                      p.text
                    ),
                  )}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {!isAll ? (
        <Card>
          <AppText variant="heading">Day by day</AppText>
          <AppText variant="caption">Spending on each day of {monthLabel(month)}</AppText>
          <DailyChart month={month} stats={stats} today={data.today} currency={currency} />
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">{isAll ? 'Month by month' : 'Last six months'}</AppText>
        <AppText variant="caption">Came in vs. spent</AppText>
        <TrendChart trend={data.trend} selectedMonth={month} currency={currency} onPickMonth={onMonthChange} />
      </Card>

      {stats.weekdayOutflow.some((v) => v > 0) ? (
        <Card>
          <AppText variant="heading">Which days you spend</AppText>
          <AppText variant="caption">Total spending by day of the week</AppText>
          <WeekdayChart stats={stats} currency={currency} />
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">Top merchants</AppText>
        <AppText variant="caption">Where your money goes most</AppText>
        <MiniList items={merchants} emptyText="Nothing yet." />
      </Card>

      <Card>
        <AppText variant="heading">Biggest expenses</AppText>
        <AppText variant="caption">Single payments, largest first</AppText>
        <MiniList items={largest} emptyText="Nothing yet." />
      </Card>

      <Card>
        <AppText variant="heading">Money in</AppText>
        <AppText variant="caption">By source</AppText>
        <MiniList items={income} emptyText="No income recorded." />
      </Card>
    </>
  );
}

// "You kept ₹30,930 of the ₹1,03,593 that came in."
function Headline({ data }: { data: OverviewData }) {
  const { colors } = useTheme();
  const { stats, currency, month } = data;
  const money = (minor: number) => formatMoney(minor, currency);
  const good = { color: colors.income };
  const bad = { color: colors.expense };

  if (stats.inflowMinor === 0 && stats.outflowMinor === 0) {
    return <AppText variant="headline">Nothing recorded for {month === 'all' ? 'any period' : monthLabel(month)} yet.</AppText>;
  }
  if (stats.inflowMinor === 0) {
    return (
      <AppText variant="headline">
        You spent <AppText variant="headline" style={bad}>{money(stats.outflowMinor)}</AppText> and nothing came in.
      </AppText>
    );
  }
  if (stats.savedMinor >= 0) {
    return (
      <AppText variant="headline">
        You kept <AppText variant="headline" style={good}>{money(stats.savedMinor)}</AppText> of the {money(stats.inflowMinor)} that came in.
      </AppText>
    );
  }
  return (
    <AppText variant="headline">
      You spent <AppText variant="headline" style={bad}>{money(-stats.savedMinor)}</AppText> more than came in.
    </AppText>
  );
}

function Kpi({
  label,
  value,
  note,
  delta,
  goodWhenUp,
  comparison,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: number | null;
  goodWhenUp?: boolean;
  comparison?: string;
}) {
  const { colors } = useTheme();
  let footer: React.ReactNode = note ? <AppText variant="caption">{note}</AppText> : null;
  if (delta !== null && delta !== undefined) {
    const up = delta > 0;
    const flat = Math.abs(delta) < 0.005;
    const good = goodWhenUp ? up : !up;
    footer = (
      <AppText variant="caption" style={flat ? undefined : { color: good ? colors.income : colors.expense }}>
        {(up ? '▲ ' : '▼ ') + Math.abs(Math.round(delta * 100)) + '% ' + comparison}
      </AppText>
    );
  }
  return (
    <View style={styles.kpi}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="number">{value}</AppText>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md - 2, padding: spacing.md + 4 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md - 2, marginTop: spacing.xs },
  kpi: { width: '50%', paddingRight: spacing.sm, gap: 1 },
  insights: { gap: spacing.md - 4, marginTop: spacing.xs },
  insightRow: { flexDirection: 'row', gap: spacing.md - 4, alignItems: 'flex-start' },
  bullet: { width: 7, height: 7, borderRadius: 4, marginTop: 8 },
  insightText: { flex: 1 },
});
