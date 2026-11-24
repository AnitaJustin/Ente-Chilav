// Gathers everything the Overview tab needs from the database in one go.

import type { SQLiteDatabase } from 'expo-sqlite';

import { countSavingsAccounts, getSavingsMovement, type SavingsMovement } from '../db/accounts';
import { listBudgets, type BudgetRow } from '../db/budgets';
import { daysInMonth, monthKey, shiftMonth, todayYmd } from '../db/dates';
import type { CurrencyCode } from '../db/money';
import { getCurrency } from '../db/settings';
import { countTransactions, getMonthlyTotals, listMonths, listTransactions } from '../db/transactions';
import type { MonthTotals } from '../db/types';
import { computeStats, type Stats } from './analysis';

export type OverviewData = {
  months: string[]; // every month you can step through, oldest first
  month: string; // the month shown ('YYYY-MM') or 'all'
  currency: CurrencyCode;
  today: string;
  stats: Stats;
  prev: Stats | null; // the month before (same days, if this month isn't over)
  prevMonth: string | null;
  hasPrev: boolean;
  partial: boolean; // is this the current, unfinished month?
  dayNum: number | null; // days elapsed so far (current month) or days in the month; null for all time
  trend: MonthTotals[]; // money in/out for the last few months
  totalCount: number; // all transactions in the database, any month
  budgets: BudgetRow[]; // your monthly budgets
  savings: SavingsMovement | null; // moves into and out of savings accounts; null when you have no savings accounts
};

export async function loadOverview(
  db: SQLiteDatabase,
  requestedMonth: string,
  today: string = todayYmd(),
): Promise<OverviewData> {
  const [months, currency, totalCount, budgets, savingsAccounts] = await Promise.all([
    listMonths(db, today),
    getCurrency(db),
    countTransactions(db),
    listBudgets(db),
    countSavingsAccounts(db),
  ]);
  const month =
    requestedMonth === 'all' || months.includes(requestedMonth) ? requestedMonth : months[months.length - 1];
  const isAll = month === 'all';

  const rows = await listTransactions(db, isAll ? {} : { month });
  const stats = computeStats(rows);

  const partial = !isAll && month === monthKey(today);
  const dayNum = isAll ? null : partial ? Number(today.slice(8)) : daysInMonth(month);

  let prev: Stats | null = null;
  let prevMonth: string | null = null;
  let hasPrev = false;
  if (!isAll) {
    prevMonth = shiftMonth(month, -1);
    let prevRows = await listTransactions(db, { month: prevMonth });
    // Compare like with like: if this month isn't over, only count the same days last month.
    if (partial && dayNum !== null) prevRows = prevRows.filter((r) => Number(r.date.slice(8)) <= dayNum);
    prev = computeStats(prevRows);
    hasPrev = prev.count > 0;
  }

  const count = isAll ? Math.min(12, months.length) : 6;
  const end = isAll ? months[months.length - 1] : month;
  const trendMonths: string[] = [];
  for (let i = count - 1; i >= 0; i--) trendMonths.push(shiftMonth(end, -i));
  const trend = await getMonthlyTotals(db, trendMonths);

  const savings =
    savingsAccounts > 0 ? await getSavingsMovement(db, isAll ? '0000-01-01' : `${month}-01`, isAll ? '9999-12-31' : `${month}-31`) : null;

  return { months, month, currency, today, stats, prev, prevMonth, hasPrev, partial, dayNum, trend, totalCount, budgets, savings };
}
