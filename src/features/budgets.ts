// The logic behind budgets, kept separate from the screens so it can be tested.

import type { BudgetRow } from '../db/budgets';
import type { CategoryStat, Stats } from './analysis';

export type BudgetStatus = 'ok' | 'close' | 'over';

// 'over' means you've spent more than the budget. 'close' means you've used 80% or more.
// (Integer maths, so there are no rounding surprises at exactly 80%.)
export function budgetStatus(spentMinor: number, budgetMinor: number): BudgetStatus {
  if (spentMinor > budgetMinor) return 'over';
  if (spentMinor * 10 >= budgetMinor * 8) return 'close';
  return 'ok';
}

// Turns an average like ₹1,831 into a tidy budget suggestion like ₹1,800.
// Below 1,000 it rounds to the nearest 10, above that to the nearest 100. Never less than one step.
export function niceBudget(minor: number): number {
  const units = minor / 100;
  const step = units < 1000 ? 10 : 100;
  return Math.max(step, Math.round(units / step) * step) * 100;
}

export type CategoryLine = CategoryStat & {
  budgetMinor: number | null; // the budget for the period shown, or null if none is set
};

export type BudgetSummary = { ok: number; close: number; over: number };

// Builds the rows for "Where it went": every category you spent in, plus any budgeted
// category you haven't spent in yet (so you can see an untouched budget).
// A monthly budget is multiplied by the number of months when viewing "All time".
export function buildCategoryLines(
  stats: Stats,
  budgets: BudgetRow[],
  monthsInPeriod: number,
): { lines: CategoryLine[]; summary: BudgetSummary | null } {
  const budgetById = new Map(budgets.map((b) => [b.categoryId, b.amountMinor * monthsInPeriod]));

  const lines: CategoryLine[] = stats.expenseByCategory.map((c) => ({
    ...c,
    budgetMinor: budgetById.get(c.categoryId) ?? null,
  }));

  const spentIds = new Set(stats.expenseByCategory.map((c) => c.categoryId));
  const untouched = budgets
    .filter((b) => !spentIds.has(b.categoryId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<CategoryLine>((b) => ({
      categoryId: b.categoryId,
      name: b.name,
      color: b.color,
      amountMinor: 0,
      count: 0,
      budgetMinor: budgetById.get(b.categoryId) ?? null,
    }));
  lines.push(...untouched);

  const budgeted = lines.filter((l) => l.budgetMinor !== null);
  if (budgeted.length === 0) return { lines, summary: null };

  const summary: BudgetSummary = { ok: 0, close: 0, over: 0 };
  for (const l of budgeted) summary[budgetStatus(l.amountMinor, l.budgetMinor as number)]++;
  return { lines, summary };
}

// "2 on track · 1 close · 1 over" (leaves out any part that is zero)
export function summaryText(s: BudgetSummary): string {
  const parts: string[] = [];
  if (s.ok) parts.push(`${s.ok} on track`);
  if (s.close) parts.push(`${s.close} close`);
  if (s.over) parts.push(`${s.over} over`);
  return parts.join(' · ');
}
