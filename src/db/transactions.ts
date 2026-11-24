import type { SQLiteDatabase } from 'expo-sqlite';

import { getAccount, getDefaultAccountId } from './accounts';
import { getCategoryByName } from './categories';
import { isValidYmd, monthKey, monthsBetween, todayYmd } from './dates';
import type {
  CategoryKind,
  Totals,
  MonthTotals,
  TransactionFilter,
  TransactionInput,
  TransactionRow,
  TransferRow,
  TxSource,
  TxType,
} from './types';

type Row = {
  id: number;
  date: string;
  description: string;
  amount_minor: number;
  type: TxType;
  category_id: number;
  category_name: string;
  category_color: string;
  category_kind: CategoryKind;
  account_id: number | null;
  account_name: string;
  account_color: string;
  transfer_id: number | null;
  note: string;
  source: TxSource;
  created_at: number;
};

const SELECT_ROW = `
  SELECT t.id, t.date, t.description, t.amount_minor, t.type, t.category_id,
         c.name AS category_name, c.color AS category_color, c.kind AS category_kind,
         t.account_id, COALESCE(a.name, '') AS account_name, COALESCE(a.color, '#98A2B3') AS account_color,
         t.transfer_id, t.note, t.source, t.created_at
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
`;

function toRow(r: Row): TransactionRow {
  return {
    id: r.id,
    date: r.date,
    description: r.description,
    amountMinor: r.amount_minor,
    type: r.type,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    categoryKind: r.category_kind,
    accountId: r.account_id ?? 0,
    accountName: r.account_name,
    accountColor: r.account_color,
    transferId: r.transfer_id,
    note: r.note,
    source: r.source,
    createdAt: r.created_at,
  };
}

// Throws an Error with a friendly message if something is wrong.
function validate(input: TransactionInput) {
  if (!isValidYmd(input.date)) throw new Error('Pick a valid date.');
  if (!input.description.trim()) throw new Error('Add a merchant or person.');
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Enter an amount above zero.');
  }
  if (input.type !== 'debit' && input.type !== 'credit') throw new Error('Choose money in or out.');
}

export async function addTransaction(db: SQLiteDatabase, input: TransactionInput): Promise<number> {
  validate(input);
  const accountId = input.accountId ?? (await getDefaultAccountId(db));
  const result = await db.runAsync(
    `INSERT INTO transactions
       (date, description, amount_minor, type, category_id, account_id, note, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.date,
      input.description.trim().slice(0, 80),
      input.amountMinor,
      input.type,
      input.categoryId,
      accountId,
      (input.note ?? '').trim().slice(0, 120),
      input.source ?? 'manual',
      Date.now(),
    ],
  );
  return result.lastInsertRowId;
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: number,
  input: TransactionInput,
): Promise<void> {
  validate(input);
  const existing = await db.getFirstAsync<{ transfer_id: number | null }>(
    'SELECT transfer_id FROM transactions WHERE id = ?',
    [id],
  );
  if (existing && existing.transfer_id !== null) {
    throw new Error('This is part of a transfer between accounts, so it can’t be edited. Delete the transfer and add it again.');
  }
  await db.runAsync(
    `UPDATE transactions
        SET date = ?, description = ?, amount_minor = ?, type = ?, category_id = ?,
            account_id = COALESCE(?, account_id), note = ?
      WHERE id = ?`,
    [
      input.date,
      input.description.trim().slice(0, 80),
      input.amountMinor,
      input.type,
      input.categoryId,
      input.accountId ?? null,
      (input.note ?? '').trim().slice(0, 120),
      id,
    ],
  );
}

// Deletes a transaction. If it is one half of a transfer between accounts, the other half
// goes too, so the two accounts never get out of step.
export async function deleteTransaction(db: SQLiteDatabase, id: number): Promise<void> {
  const row = await db.getFirstAsync<{ transfer_id: number | null }>(
    'SELECT transfer_id FROM transactions WHERE id = ?',
    [id],
  );
  if (row && row.transfer_id !== null) {
    await db.runAsync('DELETE FROM transactions WHERE transfer_id = ?', [row.transfer_id]);
  } else {
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  }
}

// Moves money from one account to another, for example withdrawing cash from the bank.
// It's saved as two linked transactions in the built-in "Self transfer" category: money out of
// one account and money into the other. It changes both balances but isn't counted as
// spending or income. Returns the transfer's number.
export async function addTransfer(
  db: SQLiteDatabase,
  input: { fromAccountId: number; toAccountId: number; amountMinor: number; date: string; note?: string },
): Promise<number> {
  if (input.fromAccountId === input.toAccountId) throw new Error('Choose two different accounts.');
  const [from, to, category] = await Promise.all([
    getAccount(db, input.fromAccountId),
    getAccount(db, input.toAccountId),
    getCategoryByName(db, 'Self transfer'),
  ]);
  if (!from || !to) throw new Error('One of those accounts no longer exists.');
  if (!category) throw new Error('The “Self transfer” category is missing.');
  if (!isValidYmd(input.date)) throw new Error('Pick a valid date.');
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Enter an amount above zero.');

  const note = (input.note ?? '').trim().slice(0, 120);
  let transferId = 0;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(transfer_id) AS m FROM transactions');
    transferId = (row?.m ?? 0) + 1;
    const sql = `INSERT INTO transactions
      (date, description, amount_minor, type, category_id, account_id, transfer_id, note, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`;
    const now = Date.now();
    await db.runAsync(sql, [input.date, `Transfer to ${to.name}`.slice(0, 80), input.amountMinor, 'debit', category.id, from.id, transferId, note, now]);
    await db.runAsync(sql, [input.date, `Transfer from ${from.name}`.slice(0, 80), input.amountMinor, 'credit', category.id, to.id, transferId, note, now]);
  });
  return transferId;
}

// Removes every transaction with a given source (used to clear test or sample data).
// Returns how many were removed.
export async function deleteTransactionsBySource(
  db: SQLiteDatabase,
  source: TxSource,
): Promise<number> {
  const result = await db.runAsync('DELETE FROM transactions WHERE source = ?', [source]);
  return result.changes;
}

export async function getTransaction(
  db: SQLiteDatabase,
  id: number,
): Promise<TransactionRow | null> {
  const row = await db.getFirstAsync<Row>(`${SELECT_ROW} WHERE t.id = ?`, [id]);
  return row ? toRow(row) : null;
}

// Escape % and _ so a search for "50%" matches the text "50%", not "50 anything".
function likePattern(text: string): string {
  return '%' + text.trim().toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m) + '%';
}

// Newest first. Filter by month, category, direction, or search text.
export async function listTransactions(
  db: SQLiteDatabase,
  filter: TransactionFilter = {},
): Promise<TransactionRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.month) {
    where.push('t.date >= ? AND t.date <= ?');
    params.push(filter.month + '-01', filter.month + '-31');
  }
  if (filter.categoryId != null) {
    where.push('t.category_id = ?');
    params.push(filter.categoryId);
  }
  // Moves of money between your own accounts are not spending or income, so they are not
  // listed as transactions. (They live on the Accounts tab.)
  if (!filter.includeTransfers) where.push('t.transfer_id IS NULL');
  if (filter.accountId != null) {
    where.push('t.account_id = ?');
    params.push(filter.accountId);
  }
  if (filter.type) {
    where.push('t.type = ?');
    params.push(filter.type);
  }
  if (filter.search && filter.search.trim()) {
    const p = likePattern(filter.search);
    where.push(
      "(lower(t.description) LIKE ? ESCAPE '\\' OR lower(t.note) LIKE ? ESCAPE '\\' OR lower(c.name) LIKE ? ESCAPE '\\' OR lower(a.name) LIKE ? ESCAPE '\\')",
    );
    params.push(p, p, p, p);
  }

  let sql = SELECT_ROW;
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY t.date DESC, t.id DESC';
  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  const rows = await db.getAllAsync<Row>(sql, params);
  return rows.map(toRow);
}

// How many transactions you have. Moves between your own accounts don't count as transactions.
export async function countTransactions(db: SQLiteDatabase, options: { includeTransfers?: boolean } = {}): Promise<number> {
  const where = options.includeTransfers ? '' : ' WHERE transfer_id IS NULL';
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions${where}`);
  return row?.n ?? 0;
}

// Moves of money between your accounts, newest first, one row per move.
// Optionally limited to one month ('YYYY-MM').
export async function listTransfers(db: SQLiteDatabase, options: { month?: string } = {}): Promise<TransferRow[]> {
  const params: string[] = [];
  let range = '';
  if (options.month) {
    range = ' AND d.date >= ? AND d.date <= ?';
    params.push(options.month + '-01', options.month + '-31');
  }
  const rows = await db.getAllAsync<{
    transfer_id: number;
    date: string;
    amount_minor: number;
    from_id: number;
    from_name: string;
    to_id: number;
    to_name: string;
    note: string;
  }>(
    `SELECT d.transfer_id, d.date, d.amount_minor,
            d.account_id AS from_id, fa.name AS from_name,
            c.account_id AS to_id, ta.name AS to_name, d.note
       FROM transactions d
       JOIN transactions c ON c.transfer_id = d.transfer_id AND c.type = 'credit'
       JOIN accounts fa ON fa.id = d.account_id
       JOIN accounts ta ON ta.id = c.account_id
      WHERE d.type = 'debit' AND d.transfer_id IS NOT NULL${range}
      ORDER BY d.date DESC, d.transfer_id DESC`,
    params,
  );
  return rows.map((r) => ({
    transferId: r.transfer_id,
    date: r.date,
    amountMinor: r.amount_minor,
    fromAccountId: r.from_id,
    fromName: r.from_name,
    toAccountId: r.to_id,
    toName: r.to_name,
    note: r.note,
  }));
}

// Removes a move of money, both sides of it, so the two accounts stay in step.
export async function deleteTransfer(db: SQLiteDatabase, transferId: number): Promise<void> {
  await db.runAsync('DELETE FROM transactions WHERE transfer_id = ?', [transferId]);
}

// Money in and money out for a month ('YYYY-MM'), or all time if omitted.
// Categories marked "ignore" (like moving money between your own accounts) don't count.
export async function getTotals(db: SQLiteDatabase, month?: string): Promise<Totals> {
  const params: string[] = [];
  let sql = `
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_minor END), 0) AS inflow,
      COALESCE(SUM(CASE WHEN t.type = 'debit'  THEN t.amount_minor END), 0) AS outflow,
      COUNT(*) AS n
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE c.kind != 'ignore'`;
  if (month) {
    sql += ' AND t.date >= ? AND t.date <= ?';
    params.push(month + '-01', month + '-31');
  }
  const row = await db.getFirstAsync<{ inflow: number; outflow: number; n: number }>(sql, params);
  return { inflowMinor: row?.inflow ?? 0, outflowMinor: row?.outflow ?? 0, count: row?.n ?? 0 };
}

// Every month from your first transaction up to the latest one (or this month,
// whichever is later), with no gaps. Used by the month stepper.
export async function listMonths(db: SQLiteDatabase, today: string = todayYmd()): Promise<string[]> {
  const row = await db.getFirstAsync<{ lo: string | null; hi: string | null }>(
    'SELECT MIN(date) AS lo, MAX(date) AS hi FROM transactions',
  );
  const current = monthKey(today);
  const lo = row?.lo ? monthKey(row.lo) : current;
  let hi = row?.hi ? monthKey(row.hi) : current;
  if (hi < current) hi = current;
  return monthsBetween(lo <= hi ? lo : hi, hi);
}

// Money in and out for each of the given months, in the same order, with zeros
// for months that have no data. Categories marked "ignore" don't count.
export async function getMonthlyTotals(db: SQLiteDatabase, months: string[]): Promise<MonthTotals[]> {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const rows = await db.getAllAsync<{ month: string; inflow: number; outflow: number }>(
    `SELECT substr(t.date, 1, 7) AS month,
            COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_minor END), 0) AS inflow,
            COALESCE(SUM(CASE WHEN t.type = 'debit'  THEN t.amount_minor END), 0) AS outflow
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE c.kind != 'ignore' AND t.date >= ? AND t.date <= ?
      GROUP BY substr(t.date, 1, 7)`,
    [sorted[0] + '-01', sorted[sorted.length - 1] + '-31'],
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((month) => {
    const r = byMonth.get(month);
    return { month, inflowMinor: r?.inflow ?? 0, outflowMinor: r?.outflow ?? 0 };
  });
}

// How many transactions came from each source: your own entries vs sample data.
export async function countBySource(db: SQLiteDatabase): Promise<Record<TxSource, number>> {
  const rows = await db.getAllAsync<{ source: TxSource; n: number }>(
    'SELECT source, COUNT(*) AS n FROM transactions GROUP BY source',
  );
  const out: Record<TxSource, number> = { manual: 0, screenshot: 0, sample: 0 };
  for (const r of rows) out[r.source] = r.n;
  return out;
}
