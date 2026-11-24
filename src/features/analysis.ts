// All the maths behind the Overview tab, kept separate from the screen so it can be tested.
// Every amount is in whole paise/cents (integers), so totals are always exact.

import { daysInMonth, monthLabel } from '../db/dates';
import { formatMoney, type CurrencyCode } from '../db/money';
import type { TransactionRow } from '../db/types';

export type CategoryStat = {
  categoryId: number;
  name: string;
  color: string;
  amountMinor: number;
  count: number;
};

export type MerchantStat = { name: string; amountMinor: number; count: number };

export type Stats = {
  inflowMinor: number;
  outflowMinor: number;
  savedMinor: number; // money in minus money out (can be negative)
  count: number; // transactions that count (ignored categories excluded)
  expenseByCategory: CategoryStat[]; // biggest first
  incomeByCategory: CategoryStat[]; // biggest first
  outflowByDay: Record<string, number>; // 'YYYY-MM-DD' -> spent that day
  merchants: MerchantStat[]; // biggest first
  weekdayOutflow: number[]; // index 0 = Sunday ... 6 = Saturday
  biggest: TransactionRow | null; // the single largest payment
  largestPayments: TransactionRow[]; // the five largest single payments, biggest first
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function bump(map: Map<number, CategoryStat>, row: TransactionRow) {
  const entry = map.get(row.categoryId);
  if (entry) {
    entry.amountMinor += row.amountMinor;
    entry.count += 1;
  } else {
    map.set(row.categoryId, {
      categoryId: row.categoryId,
      name: row.categoryName,
      color: row.categoryColor,
      amountMinor: row.amountMinor,
      count: 1,
    });
  }
}

// When the same merchant is typed differently ("Swiggy", "swiggy!"), show the most common
// spelling. On a tie, the older one wins (rows arrive newest first, so later entries are older).
function commonest(spellings: Map<string, number>): string {
  let best = '';
  let bestCount = 0;
  for (const [name, n] of spellings) {
    if (n >= bestCount) {
      best = name;
      bestCount = n;
    }
  }
  return best;
}

const byAmountDesc = <T extends { amountMinor: number }>(a: T, b: T) => b.amountMinor - a.amountMinor;

// Turns a list of transactions into totals and breakdowns.
// Transactions in "ignore" categories (like moving money between your own accounts) are skipped.
export function computeStats(rows: TransactionRow[]): Stats {
  let inflow = 0;
  let outflow = 0;
  let count = 0;
  const expense = new Map<number, CategoryStat>();
  const income = new Map<number, CategoryStat>();
  const outflowByDay: Record<string, number> = {};
  const merchants = new Map<string, MerchantStat & { spellings: Map<string, number> }>();
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  let biggest: TransactionRow | null = null;
  const payments: TransactionRow[] = [];

  for (const row of rows) {
    if (row.categoryKind === 'ignore') continue;
    count++;
    if (row.type === 'credit') {
      inflow += row.amountMinor;
      bump(income, row);
      continue;
    }
    outflow += row.amountMinor;
    bump(expense, row);
    outflowByDay[row.date] = (outflowByDay[row.date] ?? 0) + row.amountMinor;
    weekday[weekdayOf(row.date)] += row.amountMinor;
    const key = normalize(row.description) || 'unknown';
    const m = merchants.get(key);
    if (m) {
      m.amountMinor += row.amountMinor;
      m.count += 1;
      m.spellings.set(row.description, (m.spellings.get(row.description) ?? 0) + 1);
    } else {
      merchants.set(key, {
        name: row.description,
        amountMinor: row.amountMinor,
        count: 1,
        spellings: new Map([[row.description, 1]]),
      });
    }
    payments.push(row);
    if (!biggest || row.amountMinor > biggest.amountMinor) biggest = row;
  }

  return {
    inflowMinor: inflow,
    outflowMinor: outflow,
    savedMinor: inflow - outflow,
    count,
    expenseByCategory: [...expense.values()].sort(byAmountDesc),
    incomeByCategory: [...income.values()].sort(byAmountDesc),
    outflowByDay,
    merchants: [...merchants.values()]
      .map((m) => ({ name: commonest(m.spellings), amountMinor: m.amountMinor, count: m.count }))
      .sort(byAmountDesc),
    weekdayOutflow: weekday,
    biggest,
    largestPayments: payments.sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 5),
  };
}

// Change from previous to current as a fraction (0.25 = 25% higher). Null if there is no
// previous amount to compare with.
export function changeFraction(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

export function percentText(fraction: number): string {
  return Math.round(fraction * 100) + '%';
}

// Round an amount to whole rupees/dollars, so averages don't show odd paise.
export function roundToWhole(minor: number): number {
  return Math.round(minor / 100) * 100;
}

// ---- "What stands out" notes -------------------------------------------------------

export type Segment = { text: string; bold?: boolean };
export type Insight = Segment[];

export type InsightInput = {
  stats: Stats;
  prev: Stats | null; // the previous month (same days, if this month isn't over), or null
  month: string; // 'YYYY-MM' or 'all'
  prevMonth: string | null;
  partial: boolean; // is this the current, unfinished month?
  dayNum: number | null; // days elapsed (current month) or days in the month
  currency: CurrencyCode;
};

const t = (text: string): Segment => ({ text });
const b = (text: string): Segment => ({ text, bold: true });

export function buildInsights(input: InsightInput): Insight[] {
  const { stats, prev, month, prevMonth, partial, dayNum, currency } = input;
  const money = (minor: number) => formatMoney(minor, currency);
  const isAll = month === 'all';
  const out: Insight[] = [];
  const top = stats.expenseByCategory[0];

  if (top && stats.outflowMinor > 0) {
    out.push([
      b(top.name),
      t(` takes the biggest bite: ${percentText(top.amountMinor / stats.outflowMinor)} of everything you spent (${money(top.amountMinor)}).`),
    ]);
  }

  if (prev && prevMonth && prev.outflowMinor > 0) {
    const change = (stats.outflowMinor - prev.outflowMinor) / prev.outflowMinor;
    const diff = Math.abs(stats.outflowMinor - prev.outflowMinor);
    out.push([
      t('Spending is '),
      b(`${percentText(Math.abs(change))} ${change > 0 ? 'higher' : 'lower'}`),
      t(` than ${partial ? 'the same days of ' : ''}${monthLabel(prevMonth)} (${money(diff)} ${change > 0 ? 'more' : 'less'}).`),
    ]);

    // The category that moved the most, including ones that disappeared.
    const prevByCat = new Map(prev.expenseByCategory.map((c) => [c.categoryId, c]));
    const seen = new Set<number>();
    let swing: { name: string; delta: number } | null = null;
    for (const c of stats.expenseByCategory) {
      seen.add(c.categoryId);
      const delta = c.amountMinor - (prevByCat.get(c.categoryId)?.amountMinor ?? 0);
      if (!swing || Math.abs(delta) > Math.abs(swing.delta)) swing = { name: c.name, delta };
    }
    for (const c of prev.expenseByCategory) {
      if (seen.has(c.categoryId)) continue;
      if (!swing || c.amountMinor > Math.abs(swing.delta)) swing = { name: c.name, delta: -c.amountMinor };
    }
    if (swing && swing.delta !== 0) {
      out.push([t('Biggest swing: '), b(swing.name), t(` is ${swing.delta > 0 ? 'up' : 'down'} ${money(Math.abs(swing.delta))}.`)]);
    }
  }

  if (stats.inflowMinor > 0) {
    const rate = stats.savedMinor / stats.inflowMinor;
    if (rate >= 0.2) out.push([t('You’re saving '), b(percentText(rate)), t(' of your income, a healthy cushion.')]);
    else if (rate >= 0) {
      out.push([t('You’re saving '), b(percentText(rate)), t(` of your income. Trimming ${top ? top.name : 'your top category'} is the quickest lever.`)]);
    } else out.push([t('You’re spending '), b(percentText(-rate)), t(' more than you earn in this period.')]);
  }

  if (partial && dayNum !== null && dayNum > 3 && stats.outflowMinor > 0) {
    const projected = roundToWhole((stats.outflowMinor * daysInMonth(month)) / dayNum);
    out.push([
      t('At this pace you’ll spend about '),
      b(money(projected)),
      t(' by month end' + (stats.inflowMinor > 0 && projected > stats.inflowMinor ? ', more than has come in so far.' : '.')),
    ]);
  }

  // Weekend vs weekday spending per day
  const weekend = stats.weekdayOutflow[0] + stats.weekdayOutflow[6];
  const weekdays = stats.weekdayOutflow.slice(1, 6).reduce((x, y) => x + y, 0);
  if (!isAll && dayNum !== null && weekend > 0 && weekdays > 0) {
    const [y, m] = month.split('-').map(Number);
    let weekendDays = 0;
    let weekdayDays = 0;
    for (let d = 1; d <= dayNum; d++) {
      const wd = new Date(y, m - 1, d).getDay();
      if (wd === 0 || wd === 6) weekendDays++;
      else weekdayDays++;
    }
    if (weekendDays > 0 && weekdayDays > 0) {
      const perWeekend = weekend / weekendDays;
      const perWeekday = weekdays / weekdayDays;
      if (perWeekend > perWeekday * 1.25) {
        out.push([t('Weekends cost more: '), b(`${money(roundToWhole(perWeekend))} a day`), t(` vs ${money(roundToWhole(perWeekday))} on weekdays.`)]);
      } else if (perWeekday > perWeekend * 1.25) {
        out.push([t('Weekdays cost more: '), b(`${money(roundToWhole(perWeekday))} a day`), t(` vs ${money(roundToWhole(perWeekend))} on weekends.`)]);
      }
    }
  }

  if (stats.biggest) {
    out.push([t('Largest single payment: '), b(money(stats.biggest.amountMinor)), t(` to ${stats.biggest.description}.`)]);
  }

  return out.slice(0, 6);
}
