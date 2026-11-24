import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category, CategoryKind } from './types';

type CategoryRow = {
  id: number;
  name: string;
  color: string;
  kind: CategoryKind;
  is_default: number;
  is_hidden: number;
};

const COLUMNS = 'id, name, color, kind, is_default, is_hidden';

function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    kind: r.kind,
    isDefault: r.is_default === 1,
    isHidden: r.is_hidden === 1,
  };
}

// These two catch-all categories are used when something has nowhere else to go
// (for example when you delete a category), so they can't be hidden.
const FALLBACK_NAMES = ['Other expense', 'Other income'];

const KINDS: CategoryKind[] = ['expense', 'income', 'ignore'];
export const MAX_CATEGORY_NAME = 30;

const isValidColor = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

// Visible categories only, unless includeHidden is set.
export async function listCategories(
  db: SQLiteDatabase,
  options: { includeHidden?: boolean } = {},
): Promise<Category[]> {
  const where = options.includeHidden ? '' : 'WHERE is_hidden = 0';
  const rows = await db.getAllAsync<CategoryRow>(
    `SELECT ${COLUMNS} FROM categories ${where} ORDER BY sort_order, id`,
  );
  return rows.map(toCategory);
}

export async function getCategoryByName(db: SQLiteDatabase, name: string): Promise<Category | null> {
  const row = await db.getFirstAsync<CategoryRow>(
    `SELECT ${COLUMNS} FROM categories WHERE name = ?`,
    [name],
  );
  return row ? toCategory(row) : null;
}

export async function getCategory(db: SQLiteDatabase, id: number): Promise<Category | null> {
  const row = await db.getFirstAsync<CategoryRow>(`SELECT ${COLUMNS} FROM categories WHERE id = ?`, [id]);
  return row ? toCategory(row) : null;
}

export async function countTransactionsInCategory(db: SQLiteDatabase, id: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?',
    [id],
  );
  return row?.n ?? 0;
}

// How many transactions each category has, as { categoryId: count }.
export async function countTransactionsByCategory(db: SQLiteDatabase): Promise<Record<number, number>> {
  const rows = await db.getAllAsync<{ category_id: number; n: number }>(
    'SELECT category_id, COUNT(*) AS n FROM transactions GROUP BY category_id',
  );
  const out: Record<number, number> = {};
  for (const r of rows) out[r.category_id] = r.n;
  return out;
}

function checkFields(name: string, color: string, kind: CategoryKind) {
  if (!name) throw new Error('Give the category a name.');
  if (name.length > MAX_CATEGORY_NAME) throw new Error(`Keep the name under ${MAX_CATEGORY_NAME + 1} characters.`);
  if (!isValidColor(color)) throw new Error('Pick a colour.');
  if (!KINDS.includes(kind)) throw new Error('Choose spending, income or ignored.');
}

export async function addCategory(
  db: SQLiteDatabase,
  input: { name: string; color: string; kind: CategoryKind },
): Promise<number> {
  const name = input.name.trim();
  checkFields(name, input.color, input.kind);
  if (await getCategoryByName(db, name)) throw new Error('You already have a category with that name.');
  const row = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM categories');
  const result = await db.runAsync(
    'INSERT INTO categories (name, color, kind, is_default, sort_order) VALUES (?, ?, ?, 0, ?)',
    [name, input.color, input.kind, (row?.m ?? -1) + 1],
  );
  return result.lastInsertRowId;
}

// Built-in categories can only change colour. Your own can change name, colour and type,
// but the type is locked once the category has transactions, because switching it would
// quietly change how those past transactions are counted.
export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  patch: { name?: string; color?: string; kind?: CategoryKind },
): Promise<void> {
  const cat = await getCategory(db, id);
  if (!cat) throw new Error('That category no longer exists.');
  const name = patch.name !== undefined ? patch.name.trim() : cat.name;
  const color = patch.color ?? cat.color;
  const kind = patch.kind ?? cat.kind;
  if (cat.isDefault && (name !== cat.name || kind !== cat.kind)) {
    throw new Error('Built-in categories can only change colour.');
  }
  checkFields(name, color, kind);
  if (name.toLowerCase() !== cat.name.toLowerCase()) {
    const clash = await getCategoryByName(db, name);
    if (clash && clash.id !== id) throw new Error('You already have a category with that name.');
  }
  if (kind !== cat.kind && (await countTransactionsInCategory(db, id)) > 0) {
    throw new Error('This category already has transactions, so its type can’t be changed.');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE categories SET name = ?, color = ?, kind = ? WHERE id = ?', [name, color, kind, id]);
    if (kind !== 'expense') await db.runAsync('DELETE FROM budgets WHERE category_id = ?', [id]);
  });
}

export async function setCategoryHidden(db: SQLiteDatabase, id: number, hidden: boolean): Promise<void> {
  const cat = await getCategory(db, id);
  if (!cat) throw new Error('That category no longer exists.');
  if (hidden && cat.isDefault && FALLBACK_NAMES.includes(cat.name)) {
    throw new Error(`“${cat.name}” is the catch-all category, so it can’t be hidden.`);
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE categories SET is_hidden = ? WHERE id = ?', [hidden ? 1 : 0, id]);
    if (hidden) await db.runAsync('DELETE FROM budgets WHERE category_id = ?', [id]); // a hidden category has no budget
  });
}

// Deletes one of your own categories. Its transactions move to "Other expense" (money out) or
// "Other income" (money in). Returns how many transactions were moved.
export async function deleteCategory(db: SQLiteDatabase, id: number): Promise<number> {
  const cat = await getCategory(db, id);
  if (!cat) throw new Error('That category no longer exists.');
  if (cat.isDefault) throw new Error('Built-in categories can’t be deleted. You can hide them instead.');
  const fallbackOut = await getCategoryByName(db, 'Other expense');
  const fallbackIn = await getCategoryByName(db, 'Other income');
  if (!fallbackOut || !fallbackIn) throw new Error('The catch-all categories are missing.');

  let moved = 0;
  await db.withTransactionAsync(async () => {
    const a = await db.runAsync(
      "UPDATE transactions SET category_id = ? WHERE category_id = ? AND type = 'debit'",
      [fallbackOut.id, id],
    );
    const b = await db.runAsync(
      "UPDATE transactions SET category_id = ? WHERE category_id = ? AND type = 'credit'",
      [fallbackIn.id, id],
    );
    moved = a.changes + b.changes;
    await db.runAsync('DELETE FROM categories WHERE id = ?', [id]); // budgets and rules go with it
  });
  return moved;
}
