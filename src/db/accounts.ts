import type { SQLiteDatabase } from 'expo-sqlite';

import { addDays, isValidYmd, todayYmd } from './dates';
import type { Account, AccountKind } from './types';

type AccountRow = {
  id: number;
  name: string;
  kind: AccountKind;
  color: string;
  opening_balance_minor: number | null;
  opening_date: string | null;
  is_savings: number;
  sort_order: number;
};

const COLUMNS = 'id, name, kind, color, opening_balance_minor, opening_date, is_savings, sort_order';
export const MAX_ACCOUNT_NAME = 30;
const isValidColor = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    color: r.color,
    openingBalanceMinor: r.opening_balance_minor,
    openingDate: r.opening_date,
    isSavings: r.is_savings === 1,
    sortOrder: r.sort_order,
  };
}

// Is this account's balance being tracked (does it have an opening balance)?
export function isTracked(a: Account): a is Account & { openingBalanceMinor: number; openingDate: string } {
  return a.openingBalanceMinor !== null && a.openingDate !== null;
}

export async function listAccounts(db: SQLiteDatabase): Promise<Account[]> {
  const rows = await db.getAllAsync<AccountRow>(`SELECT ${COLUMNS} FROM accounts ORDER BY sort_order, id`);
  return rows.map(toAccount);
}

export async function getAccount(db: SQLiteDatabase, id: number): Promise<Account | null> {
  const row = await db.getFirstAsync<AccountRow>(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`, [id]);
  return row ? toAccount(row) : null;
}

export async function getAccountByName(db: SQLiteDatabase, name: string): Promise<Account | null> {
  const row = await db.getFirstAsync<AccountRow>(`SELECT ${COLUMNS} FROM accounts WHERE name = ?`, [name]);
  return row ? toAccount(row) : null;
}

// Your first account, used when a transaction doesn't say which account it belongs to.
export async function getDefaultAccountId(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM accounts ORDER BY sort_order, id LIMIT 1');
  if (!row) throw new Error('There are no accounts. Add one first.');
  return row.id;
}

export async function countTransactionsInAccount(db: SQLiteDatabase, id: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?', [id]);
  return row?.n ?? 0;
}

// Both an opening balance and its date, or neither (meaning "don't track the balance").
function checkOpening(balance: number | null, date: string | null) {
  if (balance === null && date === null) return;
  if (balance === null || date === null) throw new Error('Enter both the opening balance and the date it applies from.');
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('The opening balance can’t be negative.');
  if (!isValidYmd(date)) throw new Error('Pick a valid date for the opening balance.');
}

function checkBasics(name: string, kind: AccountKind, color: string) {
  if (!name) throw new Error('Give the account a name.');
  if (name.length > MAX_ACCOUNT_NAME) throw new Error(`Keep the name under ${MAX_ACCOUNT_NAME + 1} characters.`);
  if (kind !== 'bank' && kind !== 'cash') throw new Error('Choose bank or cash.');
  if (!isValidColor(color)) throw new Error('Pick a colour.');
}

export async function addAccount(
  db: SQLiteDatabase,
  input: { name: string; kind: AccountKind; color: string; openingBalanceMinor?: number | null; openingDate?: string | null; isSavings?: boolean },
): Promise<number> {
  const name = input.name.trim();
  const balance = input.openingBalanceMinor ?? null;
  const date = input.openingDate ?? null;
  checkBasics(name, input.kind, input.color);
  checkOpening(balance, date);
  if (await getAccountByName(db, name)) throw new Error('You already have an account with that name.');
  const row = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM accounts');
  const result = await db.runAsync(
    'INSERT INTO accounts (name, kind, color, opening_balance_minor, opening_date, is_savings, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, input.kind, input.color, balance, date, input.isSavings && input.kind === 'bank' ? 1 : 0, (row?.m ?? -1) + 1],
  );
  return result.lastInsertRowId;
}

// Pass openingBalanceMinor and openingDate as null to stop tracking the balance.
export async function updateAccount(
  db: SQLiteDatabase,
  id: number,
  patch: { name?: string; kind?: AccountKind; color?: string; openingBalanceMinor?: number | null; openingDate?: string | null; isSavings?: boolean },
): Promise<void> {
  const account = await getAccount(db, id);
  if (!account) throw new Error('That account no longer exists.');
  const name = patch.name !== undefined ? patch.name.trim() : account.name;
  const kind = patch.kind ?? account.kind;
  const color = patch.color ?? account.color;
  const balance = patch.openingBalanceMinor !== undefined ? patch.openingBalanceMinor : account.openingBalanceMinor;
  const date = patch.openingDate !== undefined ? patch.openingDate : account.openingDate;
  const savings = kind === 'bank' && (patch.isSavings !== undefined ? patch.isSavings : account.isSavings); // cash is never a savings account
  checkBasics(name, kind, color);
  checkOpening(balance, date);
  const clash = await getAccountByName(db, name);
  if (clash && clash.id !== id) throw new Error('You already have an account with that name.');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE accounts SET name = ?, kind = ?, color = ?, opening_balance_minor = ?, opening_date = ?, is_savings = ? WHERE id = ?',
      [name, kind, color, balance, date, savings ? 1 : 0, id],
    );
    // Balance checks only make sense while the balance is tracked.
    if (balance === null) await db.runAsync('DELETE FROM balance_checks WHERE account_id = ?', [id]);
  });
}

// Deletes an account. You must always keep at least one. If it has transactions, they move to
// another account of your choice. Returns how many transactions were moved.
export async function deleteAccount(db: SQLiteDatabase, id: number, moveToAccountId?: number): Promise<number> {
  const account = await getAccount(db, id);
  if (!account) throw new Error('That account no longer exists.');
  const all = await listAccounts(db);
  if (all.length <= 1) throw new Error('You need at least one account, so this one can’t be deleted.');
  const count = await countTransactionsInAccount(db, id);
  if (count > 0) {
    if (moveToAccountId === undefined || moveToAccountId === id || !all.some((a) => a.id === moveToAccountId)) {
      throw new Error('Choose another account to move its transactions to.');
    }
  }
  await db.withTransactionAsync(async () => {
    if (count > 0) await db.runAsync('UPDATE transactions SET account_id = ? WHERE account_id = ?', [moveToAccountId as number, id]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]); // balance checks go with it
  });
  return count;
}

// ---- Balances ----------------------------------------------------------------------

type Flows = { cameInMinor: number; spentMinor: number; movedMinor: number; netMinor: number };

const ZERO: Flows = { cameInMinor: 0, spentMinor: 0, movedMinor: 0, netMinor: 0 };

// What happened in an account between two dates (both included).
//   cameIn / spent: ordinary income and spending
//   moved: money moved between accounts (or otherwise "not counted"), which changes a balance
//          without being spending or income
//   net: the total change to the balance
async function flowsBetween(db: SQLiteDatabase, accountId: number, from: string, to: string): Promise<Flows> {
  if (from > to) return ZERO;
  const row = await db.getFirstAsync<{ came_in: number; spent: number; moved: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN c.kind != 'ignore' AND t.type = 'credit' THEN t.amount_minor END), 0) AS came_in,
       COALESCE(SUM(CASE WHEN c.kind != 'ignore' AND t.type = 'debit'  THEN t.amount_minor END), 0) AS spent,
       COALESCE(SUM(CASE WHEN c.kind = 'ignore'
                         THEN (CASE WHEN t.type = 'credit' THEN t.amount_minor ELSE -t.amount_minor END) END), 0) AS moved
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.account_id = ? AND t.date >= ? AND t.date <= ?`,
    [accountId, from, to],
  );
  const cameIn = row?.came_in ?? 0;
  const spent = row?.spent ?? 0;
  const moved = row?.moved ?? 0;
  return { cameInMinor: cameIn, spentMinor: spent, movedMinor: moved, netMinor: cameIn - spent + moved };
}

// The balance the app expects at the end of a day, or null if the account's balance isn't
// tracked, or the day is before tracking began.
export async function getBalanceAt(db: SQLiteDatabase, account: Account, date: string): Promise<number | null> {
  if (!isTracked(account) || date < account.openingDate) return null;
  const f = await flowsBetween(db, account.id, account.openingDate, date);
  return account.openingBalanceMinor + f.netMinor;
}

export type AccountPeriod = {
  status: 'untracked' | 'not-started' | 'tracked';
  openingMinor: number | null; // balance at the start of the period, if tracking had already begun
  startedMinor: number; // opening balance introduced during the period (tracking began mid-period)
  cameInMinor: number;
  spentMinor: number;
  movedMinor: number;
  closingMinor: number | null; // balance at the end of the period
};

// Opening balance, what happened, and closing balance for one account over a period.
export async function getAccountPeriod(
  db: SQLiteDatabase,
  account: Account,
  start: string,
  end: string,
): Promise<AccountPeriod> {
  const empty = { openingMinor: null, startedMinor: 0, cameInMinor: 0, spentMinor: 0, movedMinor: 0, closingMinor: null };
  if (!isTracked(account)) return { status: 'untracked', ...empty };
  if (account.openingDate > end) return { status: 'not-started', ...empty };

  let openingMinor: number | null = null;
  let startedMinor = 0;
  let flows: Flows;
  if (account.openingDate <= start) {
    const before = await flowsBetween(db, account.id, account.openingDate, addDays(start, -1));
    openingMinor = account.openingBalanceMinor + before.netMinor;
    flows = await flowsBetween(db, account.id, start, end);
  } else {
    startedMinor = account.openingBalanceMinor; // tracking begins part-way through the period
    flows = await flowsBetween(db, account.id, account.openingDate, end);
  }
  return {
    status: 'tracked',
    openingMinor,
    startedMinor,
    cameInMinor: flows.cameInMinor,
    spentMinor: flows.spentMinor,
    movedMinor: flows.movedMinor,
    closingMinor: (openingMinor ?? 0) + startedMinor + flows.netMinor,
  };
}

// ---- Balance checks ----------------------------------------------------------------

export type BalanceCheck = { id: number; accountId: number; date: string; actualMinor: number; createdAt: number };
export type CheckResult = BalanceCheck & {
  expectedMinor: number; // what your records say the balance should be on that date
  differenceMinor: number; // actual minus expected. Negative means money went out that isn't recorded
};

type CheckRow = { id: number; account_id: number; date: string; actual_minor: number; created_at: number };

async function toResult(db: SQLiteDatabase, account: Account, r: CheckRow): Promise<CheckResult> {
  const expected = (await getBalanceAt(db, account, r.date)) ?? 0;
  return {
    id: r.id,
    accountId: r.account_id,
    date: r.date,
    actualMinor: r.actual_minor,
    createdAt: r.created_at,
    expectedMinor: expected,
    differenceMinor: r.actual_minor - expected,
  };
}

// Records what your bank (or wallet) really shows, and compares it with what the app expects.
export async function addBalanceCheck(
  db: SQLiteDatabase,
  input: { accountId: number; date: string; actualMinor: number },
  today: string = todayYmd(),
): Promise<CheckResult> {
  const account = await getAccount(db, input.accountId);
  if (!account) throw new Error('That account no longer exists.');
  if (!isTracked(account)) throw new Error('Set an opening balance for this account first.');
  if (!isValidYmd(input.date)) throw new Error('Pick a valid date.');
  if (input.date > today) throw new Error('You can’t check a balance on a future date.');
  if (input.date < account.openingDate) throw new Error('That date is before this account’s opening balance.');
  if (!Number.isSafeInteger(input.actualMinor) || input.actualMinor < 0) throw new Error('Enter the balance as shown by your bank.');
  const result = await db.runAsync(
    'INSERT INTO balance_checks (account_id, date, actual_minor, created_at) VALUES (?, ?, ?, ?)',
    [input.accountId, input.date, input.actualMinor, Date.now()],
  );
  return toResult(db, account, {
    id: result.lastInsertRowId,
    account_id: input.accountId,
    date: input.date,
    actual_minor: input.actualMinor,
    created_at: Date.now(),
  });
}

// The most recent check on or before a date, compared with what the app expects now.
export async function getLatestCheck(db: SQLiteDatabase, account: Account, onOrBefore: string): Promise<CheckResult | null> {
  const row = await db.getFirstAsync<CheckRow>(
    'SELECT id, account_id, date, actual_minor, created_at FROM balance_checks WHERE account_id = ? AND date <= ? ORDER BY date DESC, id DESC LIMIT 1',
    [account.id, onOrBefore],
  );
  return row ? toResult(db, account, row) : null;
}

export type CheckAllResult = {
  date: string;
  results: (CheckResult & { name: string })[];
  expectedTotalMinor: number;
  actualTotalMinor: number;
  differenceMinor: number; // actual total minus expected total
};

// Checks several accounts on the same day in one go, and compares the totals as well.
// Everything is checked before anything is saved, so a mistake in one box saves nothing.
export async function addBalanceChecks(
  db: SQLiteDatabase,
  input: { date: string; entries: { accountId: number; actualMinor: number }[] },
  today: string = todayYmd(),
): Promise<CheckAllResult> {
  if (input.entries.length === 0) throw new Error('Enter at least one balance.');
  if (!isValidYmd(input.date)) throw new Error('Pick a valid date.');
  if (input.date > today) throw new Error('You can’t check a balance on a future date.');
  const accounts = new Map<number, Account>();
  for (const e of input.entries) {
    const account = await getAccount(db, e.accountId);
    if (!account) throw new Error('An account no longer exists.');
    if (!isTracked(account)) throw new Error(`Set an opening balance for ${account.name} first.`);
    if (input.date < account.openingDate) throw new Error(`${account.name}: that date is before its opening balance.`);
    if (!Number.isSafeInteger(e.actualMinor) || e.actualMinor < 0) throw new Error(`Check the balance you entered for ${account.name}.`);
    if (accounts.has(e.accountId)) throw new Error('Each account can only be checked once at a time.');
    accounts.set(e.accountId, account);
  }
  const results: CheckAllResult['results'] = [];
  await db.withTransactionAsync(async () => {
    for (const e of input.entries) {
      const account = accounts.get(e.accountId) as Account;
      const now = Date.now();
      const inserted = await db.runAsync(
        'INSERT INTO balance_checks (account_id, date, actual_minor, created_at) VALUES (?, ?, ?, ?)',
        [e.accountId, input.date, e.actualMinor, now],
      );
      const r = await toResult(db, account, { id: inserted.lastInsertRowId, account_id: e.accountId, date: input.date, actual_minor: e.actualMinor, created_at: now });
      results.push({ ...r, name: account.name });
    }
  });
  const expected = results.reduce((a, r) => a + r.expectedMinor, 0);
  const actual = results.reduce((a, r) => a + r.actualMinor, 0);
  return { date: input.date, results, expectedTotalMinor: expected, actualTotalMinor: actual, differenceMinor: actual - expected };
}

// ---- Savings ------------------------------------------------------------------------

export type SavingsMovement = {
  intoMinor: number; // moved from everyday accounts into savings accounts
  outOfMinor: number; // moved back out of savings accounts into everyday accounts
  netMinor: number; // into minus out of
};

export async function countSavingsAccounts(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM accounts WHERE is_savings = 1');
  return row?.n ?? 0;
}

// How much was moved into (and out of) savings accounts between two dates, both included.
// Only moves between a savings account and an everyday account count: moving money from one RD to an
// FD, or between two bank accounts, doesn't change how much you have in savings.
export async function getSavingsMovement(db: SQLiteDatabase, from: string, to: string): Promise<SavingsMovement> {
  const row = await db.getFirstAsync<{ into_savings: number; out_of_savings: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN fa.is_savings = 0 AND ta.is_savings = 1 THEN d.amount_minor END), 0) AS into_savings,
       COALESCE(SUM(CASE WHEN fa.is_savings = 1 AND ta.is_savings = 0 THEN d.amount_minor END), 0) AS out_of_savings
     FROM transactions d
     JOIN transactions c ON c.transfer_id = d.transfer_id AND c.type = 'credit'
     JOIN accounts fa ON fa.id = d.account_id
     JOIN accounts ta ON ta.id = c.account_id
     WHERE d.type = 'debit' AND d.transfer_id IS NOT NULL AND d.date >= ? AND d.date <= ?`,
    [from, to],
  );
  const into = row?.into_savings ?? 0;
  const out = row?.out_of_savings ?? 0;
  return { intoMinor: into, outOfMinor: out, netMinor: into - out };
}
