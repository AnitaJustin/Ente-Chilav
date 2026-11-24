import type { SQLiteDatabase } from 'expo-sqlite';

// "Swiggy ", "SWIGGY" and "swiggy!" are all the same merchant, so rules are stored under a plain key.
export function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// A remembered choice: payments to this merchant go in this category.
export type Rule = { merchantKey: string; categoryId: number; categoryName: string };

export async function listRules(db: SQLiteDatabase): Promise<Rule[]> {
  const rows = await db.getAllAsync<{ merchant_key: string; category_id: number; name: string }>(
    `SELECT r.merchant_key, r.category_id, c.name
       FROM rules r JOIN categories c ON c.id = r.category_id
      ORDER BY r.merchant_key`,
  );
  return rows.map((r) => ({ merchantKey: r.merchant_key, categoryId: r.category_id, categoryName: r.name }));
}

export async function countRules(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM rules');
  return row?.n ?? 0;
}

function checkedKey(name: string): string {
  const key = merchantKey(name);
  if (!/[a-z]/.test(key)) throw new Error('A merchant name needs at least one letter.');
  if (key.length > 80) throw new Error('That name is too long to remember.');
  return key;
}

// Remembers (or changes) the category for some merchants. This doesn't open its own transaction, so it can
// be used as part of a bigger all-or-nothing save.
export async function upsertRules(db: SQLiteDatabase, entries: { name: string; categoryId: number }[]): Promise<void> {
  const prepared = entries.map((e) => ({ key: checkedKey(e.name), categoryId: e.categoryId }));
  for (const e of prepared) {
    await db.runAsync(
      `INSERT INTO rules (merchant_key, category_id) VALUES (?, ?)
       ON CONFLICT(merchant_key) DO UPDATE SET category_id = excluded.category_id`,
      [e.key, e.categoryId],
    );
  }
}

// The same, as a complete step of its own.
export async function setRules(db: SQLiteDatabase, entries: { name: string; categoryId: number }[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await upsertRules(db, entries);
  });
}

export async function deleteRule(db: SQLiteDatabase, key: string): Promise<void> {
  await db.runAsync('DELETE FROM rules WHERE merchant_key = ?', [key]);
}
