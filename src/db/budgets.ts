import type { SQLiteDatabase } from 'expo-sqlite';

import { monthKey, shiftMonth, todayYmd } from './dates';

export type BudgetRow = {
  categoryId: number;
  name: string;
  color: string;
  amountMinor: number; // the monthly limit
};

// Every budget you've set, for categories that are visible.
export async function listBudgets(db: SQLiteDatabase): Promise<BudgetRow[]> {
  const rows = await db.getAllAsync<{ category_id: number; name: string; color: string; amount_minor: number }>(
    `SELECT b.category_id, c.name, c.color, b.amount_minor
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE c.is_hidden = 0 AND c.kind = 'expense'
      ORDER BY c.sort_order, c.id`,
  );
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    color: r.color,
    amountMinor: r.amount_minor,
  }));
}

// Saves several budgets at once. An amount of null removes that category's budget.
export async function setBudgets(
  db: SQLiteDatabase,
  entries: { categoryId: number; amountMinor: number | null }[],
): Promise<void> {
  // Check everything first, so a mistake in one row doesn't leave the others half-saved.
  for (const e of entries) {
    if (e.amountMinor !== null && (!Number.isSafeInteger(e.amountMinor) || e.amountMinor <= 0)) {
      throw new Error('Budgets must be above zero.');
    }
    const cat = await db.getFirstAsync<{ kind: string }>('SELECT kind FROM categories WHERE id = ?', [e.categoryId]);
    if (!cat) throw new Error('A category no longer exists.');
    if (cat.kind !== 'expense') throw new Error('Budgets can only be set for spending categories.');
  }
  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      if (e.amountMinor === null) {
        await db.runAsync('DELETE FROM budgets WHERE category_id = ?', [e.categoryId]);
      } else {
        await db.runAsync(
          `INSERT INTO budgets (category_id, amount_minor) VALUES (?, ?)
           ON CONFLICT(category_id) DO UPDATE SET amount_minor = excluded.amount_minor`,
          [e.categoryId, e.amountMinor],
        );
      }
    }
  });
}

// Average monthly spending per category over the last three full months, as
// { categoryId: paise }. Months with no transactions at all are left out of the average,
// so a new user with one month of data isn't shown numbers that are too low.
export async function getRecentAverages(
  db: SQLiteDatabase,
  today: string = todayYmd(),
): Promise<Record<number, number>> {
  const current = monthKey(today);
  const lo = shiftMonth(current, -3) + '-01';
  const hi = shiftMonth(current, -1) + '-31';

  const monthsRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT substr(t.date, 1, 7)) AS n
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE c.kind != 'ignore' AND t.date >= ? AND t.date <= ?`,
    [lo, hi],
  );
  const months = monthsRow?.n ?? 0;
  if (months === 0) return {};

  const rows = await db.getAllAsync<{ category_id: number; total: number }>(
    `SELECT t.category_id, SUM(t.amount_minor) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE c.kind = 'expense' AND t.type = 'debit' AND t.date >= ? AND t.date <= ?
      GROUP BY t.category_id`,
    [lo, hi],
  );
  const out: Record<number, number> = {};
  for (const r of rows) out[r.category_id] = Math.round(r.total / months);
  return out;
}
