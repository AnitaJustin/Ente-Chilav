import type { SQLiteDatabase } from 'expo-sqlite';

import { isValidYmd } from './dates';
import { isCurrencyCode, type CurrencyCode } from './money';
import { getCurrency } from './settings';
import type { AccountKind, CategoryKind, TxSource, TxType } from './types';

// An internal tag inside every backup file. It keeps its original spelling on purpose: changing it
// would stop backups you've already made from restoring. (The app's visible name is "Ente Chilavu".)
export const BACKUP_FORMAT = 'ente-chilav-backup';
// Version 1 backups (before accounts existed) can still be restored.
export const BACKUP_VERSION = 2;
const MAX_BACKUP_CHARS = 25_000_000;
const FALLBACK_NAMES = ['other expense', 'other income']; // these can never be hidden

// What an old (version 1) backup is given, since it knew nothing about accounts.
const STARTER_ACCOUNT: BackupAccount = {
  name: 'Main account',
  kind: 'bank',
  color: '#3D8FD9',
  openingBalanceMinor: null,
  openingDate: null,
  isSavings: false,
  sortOrder: 0,
};

export type BackupCategory = {
  name: string;
  color: string;
  kind: CategoryKind;
  isDefault: boolean;
  isHidden: boolean;
  sortOrder: number;
};
export type BackupAccount = {
  name: string;
  kind: AccountKind;
  color: string;
  openingBalanceMinor: number | null;
  openingDate: string | null;
  isSavings: boolean;
  sortOrder: number;
};
export type BackupTransaction = {
  date: string;
  description: string;
  amountMinor: number;
  type: TxType;
  category: string; // by name, so a backup doesn't depend on internal ids
  account: string; // by name too
  transferId: number | null; // the two halves of a transfer share a number
  note: string;
  source: TxSource;
  createdAt: number;
};
export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  createdAt: string; // ISO date-time
  settings: { currency: CurrencyCode };
  categories: BackupCategory[];
  accounts: BackupAccount[];
  transactions: BackupTransaction[];
  budgets: { category: string; amountMinor: number }[];
  rules: { merchantKey: string; category: string }[];
  balanceChecks: { account: string; date: string; actualMinor: number; createdAt: number }[];
};

export type BackupSummary = {
  transactions: number; // the transactions that will be (or were) restored, not counting transfers
  transfers: number; // moves of money between your accounts that will be (or were) restored
  categories: number;
  customCategories: number;
  accounts: number;
  budgets: number;
  skippedSample: number; // made-up sample transactions in the file, which are left out
  firstDate: string | null;
  lastDate: string | null;
  createdAt: string;
};

// ---- Making a backup ---------------------------------------------------------------

export async function buildBackup(db: SQLiteDatabase, now: Date = new Date()): Promise<BackupFile> {
  const [cats, accounts, txs, budgets, rules, checks, currency] = await Promise.all([
    db.getAllAsync<{ name: string; color: string; kind: CategoryKind; is_default: number; is_hidden: number; sort_order: number }>(
      'SELECT name, color, kind, is_default, is_hidden, sort_order FROM categories ORDER BY sort_order, id',
    ),
    db.getAllAsync<{ name: string; kind: AccountKind; color: string; opening_balance_minor: number | null; opening_date: string | null; is_savings: number; sort_order: number }>(
      'SELECT name, kind, color, opening_balance_minor, opening_date, is_savings, sort_order FROM accounts ORDER BY sort_order, id',
    ),
    db.getAllAsync<{ date: string; description: string; amount_minor: number; type: TxType; category: string; account: string; transfer_id: number | null; note: string; source: TxSource; created_at: number }>(
      `SELECT t.date, t.description, t.amount_minor, t.type, c.name AS category, a.name AS account,
              t.transfer_id, t.note, t.source, t.created_at
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         JOIN accounts a ON a.id = t.account_id
        ORDER BY t.date, t.id`,
    ),
    db.getAllAsync<{ category: string; amount_minor: number }>(
      'SELECT c.name AS category, b.amount_minor FROM budgets b JOIN categories c ON c.id = b.category_id ORDER BY c.sort_order, c.id',
    ),
    db.getAllAsync<{ merchant_key: string; category: string }>(
      'SELECT r.merchant_key, c.name AS category FROM rules r JOIN categories c ON c.id = r.category_id ORDER BY r.merchant_key',
    ),
    db.getAllAsync<{ account: string; date: string; actual_minor: number; created_at: number }>(
      `SELECT a.name AS account, b.date, b.actual_minor, b.created_at
         FROM balance_checks b JOIN accounts a ON a.id = b.account_id ORDER BY b.date, b.id`,
    ),
    getCurrency(db),
  ]);

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    createdAt: now.toISOString(),
    settings: { currency },
    categories: cats.map((c) => ({
      name: c.name,
      color: c.color,
      kind: c.kind,
      isDefault: c.is_default === 1,
      isHidden: c.is_hidden === 1,
      sortOrder: c.sort_order,
    })),
    accounts: accounts.map((a) => ({
      name: a.name,
      kind: a.kind,
      color: a.color,
      openingBalanceMinor: a.opening_balance_minor,
      openingDate: a.opening_date,
      isSavings: a.is_savings === 1,
      sortOrder: a.sort_order,
    })),
    transactions: txs.map((t) => ({
      date: t.date,
      description: t.description,
      amountMinor: t.amount_minor,
      type: t.type,
      category: t.category,
      account: t.account,
      transferId: t.transfer_id,
      note: t.note,
      source: t.source,
      createdAt: t.created_at,
    })),
    budgets: budgets.map((b) => ({ category: b.category, amountMinor: b.amount_minor })),
    rules: rules.map((r) => ({ merchantKey: r.merchant_key, category: r.category })),
    balanceChecks: checks.map((c) => ({ account: c.account, date: c.date, actualMinor: c.actual_minor, createdAt: c.created_at })),
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}

// Made-up sample transactions (from an older version of the app) are never restored.
const isReal = (t: BackupTransaction) => t.source !== 'sample';

export function summarizeBackup(file: BackupFile): BackupSummary {
  const real = file.transactions.filter(isReal);
  const dates = real.map((t) => t.date).sort();
  return {
    transactions: real.filter((t) => t.transferId === null).length,
    transfers: new Set(real.filter((t) => t.transferId !== null).map((t) => t.transferId)).size,
    skippedSample: file.transactions.length - real.length,
    categories: file.categories.length,
    customCategories: file.categories.filter((c) => !c.isDefault).length,
    accounts: file.accounts.length,
    budgets: file.budgets.length,
    firstDate: dates.length ? dates[0] : null,
    lastDate: dates.length ? dates[dates.length - 1] : null,
    createdAt: file.createdAt,
  };
}

// ---- Reading a backup --------------------------------------------------------------

const KINDS: CategoryKind[] = ['expense', 'income', 'ignore'];
const ACCOUNT_KINDS: AccountKind[] = ['bank', 'cash'];
const SOURCES: TxSource[] = ['manual', 'screenshot', 'sample'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

// Checks a backup file thoroughly and returns a clean copy. Throws an Error with a plain-English
// message if anything is wrong, before anything in the app is touched.
export function parseBackup(text: string): BackupFile {
  if (text.length > MAX_BACKUP_CHARS) throw new Error('That file is too large to be a backup.');
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('That file couldn’t be read as a backup. It may be damaged or the wrong kind of file.');
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) throw new Error('That isn’t an Ente Chilavu backup file.');
  if (!isInt(raw.formatVersion) || raw.formatVersion < 1) throw new Error('That backup file is damaged.');
  if (raw.formatVersion > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app. Update the app and try again.');
  }
  if (!Array.isArray(raw.categories) || !Array.isArray(raw.transactions)) throw new Error('That backup file is damaged.');
  const version: number = raw.formatVersion;

  const damaged = (what: string) => new Error(`That backup file is damaged (${what}).`);

  const categories: BackupCategory[] = [];
  const names = new Map<string, BackupCategory>();
  raw.categories.forEach((c, i) => {
    if (!isObject(c) || typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 30) throw damaged(`category ${i + 1}`);
    if (!isColor(c.color)) throw damaged(`colour of “${c.name}”`);
    if (!KINDS.includes(c.kind as CategoryKind)) throw damaged(`type of “${c.name}”`);
    const name = c.name.trim();
    if (names.has(name.toLowerCase())) throw damaged(`category “${name}” appears twice`);
    const cat: BackupCategory = {
      name,
      color: c.color,
      kind: c.kind as CategoryKind,
      isDefault: c.isDefault === true,
      isHidden: c.isHidden === true && !FALLBACK_NAMES.includes(name.toLowerCase()),
      sortOrder: isInt(c.sortOrder) ? c.sortOrder : i,
    };
    categories.push(cat);
    names.set(name.toLowerCase(), cat);
  });

  // Accounts. A backup from before accounts existed gets one starter account for everything.
  const accounts: BackupAccount[] = [];
  const accountNames = new Map<string, BackupAccount>();
  if (version >= 2) {
    if (!Array.isArray(raw.accounts)) throw new Error('That backup file is damaged.');
    raw.accounts.forEach((a, i) => {
      if (!isObject(a) || typeof a.name !== 'string' || !a.name.trim() || a.name.trim().length > 30) throw damaged(`account ${i + 1}`);
      const name = a.name.trim();
      if (!ACCOUNT_KINDS.includes(a.kind as AccountKind)) throw damaged(`type of account “${name}”`);
      if (!isColor(a.color)) throw damaged(`colour of account “${name}”`);
      const balance = a.openingBalanceMinor ?? null;
      const date = a.openingDate ?? null;
      const bothNull = balance === null && date === null;
      const valid = bothNull || (isInt(balance) && balance >= 0 && typeof date === 'string' && isValidYmd(date));
      if (!valid) throw damaged(`opening balance of account “${name}”`);
      if (accountNames.has(name.toLowerCase())) throw damaged(`account “${name}” appears twice`);
      const account: BackupAccount = {
        name,
        kind: a.kind as AccountKind,
        color: a.color,
        openingBalanceMinor: balance as number | null,
        openingDate: date as string | null,
        isSavings: a.isSavings === true && a.kind === 'bank', // older backups don't have this
        sortOrder: isInt(a.sortOrder) ? a.sortOrder : i,
      };
      accounts.push(account);
      accountNames.set(name.toLowerCase(), account);
    });
  }
  if (accounts.length === 0) {
    accounts.push({ ...STARTER_ACCOUNT });
    accountNames.set(STARTER_ACCOUNT.name.toLowerCase(), accounts[0]);
  }

  const transactions: BackupTransaction[] = raw.transactions.map((t, i) => {
    const n = i + 1;
    if (!isObject(t)) throw damaged(`transaction ${n}`);
    if (typeof t.date !== 'string' || !isValidYmd(t.date)) throw damaged(`date of transaction ${n}`);
    if (typeof t.description !== 'string' || !t.description.trim()) throw damaged(`description of transaction ${n}`);
    if (!isInt(t.amountMinor) || t.amountMinor <= 0) throw damaged(`amount of transaction ${n}`);
    if (t.type !== 'debit' && t.type !== 'credit') throw damaged(`direction of transaction ${n}`);
    if (typeof t.category !== 'string' || !names.has(t.category.trim().toLowerCase())) throw damaged(`category of transaction ${n}`);
    let account: BackupAccount;
    if (version >= 2) {
      if (typeof t.account !== 'string' || !accountNames.has(t.account.trim().toLowerCase())) throw damaged(`account of transaction ${n}`);
      account = accountNames.get(t.account.trim().toLowerCase()) as BackupAccount;
    } else {
      account = accounts[0];
    }
    if (t.transferId !== undefined && t.transferId !== null && !(isInt(t.transferId) && t.transferId > 0)) throw damaged(`transfer of transaction ${n}`);
    return {
      date: t.date,
      description: t.description.trim().slice(0, 80),
      amountMinor: t.amountMinor,
      type: t.type,
      category: (names.get(t.category.trim().toLowerCase()) as BackupCategory).name,
      account: account.name,
      transferId: isInt(t.transferId) ? t.transferId : null,
      note: typeof t.note === 'string' ? t.note.trim().slice(0, 120) : '',
      source: SOURCES.includes(t.source as TxSource) ? (t.source as TxSource) : 'manual',
      createdAt: isInt(t.createdAt) ? t.createdAt : 0,
    };
  });

  const budgets = (Array.isArray(raw.budgets) ? raw.budgets : []).map((b, i) => {
    if (!isObject(b) || typeof b.category !== 'string' || !isInt(b.amountMinor) || b.amountMinor <= 0) throw damaged(`budget ${i + 1}`);
    const cat = names.get(b.category.trim().toLowerCase());
    if (!cat || cat.kind !== 'expense') throw damaged(`budget ${i + 1}`);
    return { category: cat.name, amountMinor: b.amountMinor };
  });

  const rules = (Array.isArray(raw.rules) ? raw.rules : []).map((r, i) => {
    if (!isObject(r) || typeof r.merchantKey !== 'string' || !r.merchantKey || typeof r.category !== 'string') throw damaged(`rule ${i + 1}`);
    const cat = names.get(r.category.trim().toLowerCase());
    if (!cat) throw damaged(`rule ${i + 1}`);
    return { merchantKey: r.merchantKey, category: cat.name };
  });

  const balanceChecks = (Array.isArray(raw.balanceChecks) ? raw.balanceChecks : []).map((c, i) => {
    if (!isObject(c) || typeof c.account !== 'string' || !accountNames.has(c.account.trim().toLowerCase())) throw damaged(`balance check ${i + 1}`);
    if (typeof c.date !== 'string' || !isValidYmd(c.date) || !isInt(c.actualMinor) || c.actualMinor < 0) throw damaged(`balance check ${i + 1}`);
    return {
      account: (accountNames.get(c.account.trim().toLowerCase()) as BackupAccount).name,
      date: c.date,
      actualMinor: c.actualMinor,
      createdAt: isInt(c.createdAt) ? c.createdAt : 0,
    };
  });

  const settings = isObject(raw.settings) ? raw.settings : {};
  const currency: CurrencyCode = typeof settings.currency === 'string' && isCurrencyCode(settings.currency) ? settings.currency : 'INR';

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION, // an old file is upgraded to the current layout in memory
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    settings: { currency },
    categories,
    accounts,
    transactions,
    budgets,
    rules,
    balanceChecks,
  };
}

// ---- Restoring ---------------------------------------------------------------------

// Replaces everything in the app with the contents of a backup. It all happens as one
// all-or-nothing step: if anything goes wrong part-way, the app is left exactly as it was.
//
// Built-in categories keep their names and types (the app relies on them), so from a backup
// they only take back their colour, whether they're hidden, and their order. Your own
// categories, and all your accounts, are restored in full.
export async function restoreBackup(db: SQLiteDatabase, file: BackupFile): Promise<BackupSummary> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM balance_checks');
    await db.runAsync('DELETE FROM transactions');
    await db.runAsync('DELETE FROM budgets');
    await db.runAsync('DELETE FROM rules');
    await db.runAsync('DELETE FROM categories WHERE is_default = 0');
    await db.runAsync('DELETE FROM accounts');

    const existing = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM categories');
    const idByName = new Map(existing.map((r) => [r.name.toLowerCase(), r.id]));

    for (const c of file.categories) {
      const id = idByName.get(c.name.toLowerCase());
      if (id !== undefined) {
        await db.runAsync('UPDATE categories SET color = ?, is_hidden = ?, sort_order = ? WHERE id = ?', [
          c.color,
          c.isHidden ? 1 : 0,
          c.sortOrder,
          id,
        ]);
      } else {
        const result = await db.runAsync(
          'INSERT INTO categories (name, color, kind, is_default, is_hidden, sort_order) VALUES (?, ?, ?, 0, ?, ?)',
          [c.name, c.color, c.kind, c.isHidden ? 1 : 0, c.sortOrder],
        );
        idByName.set(c.name.toLowerCase(), result.lastInsertRowId);
      }
    }

    const accountIdByName = new Map<string, number>();
    for (const a of file.accounts) {
      const result = await db.runAsync(
        'INSERT INTO accounts (name, kind, color, opening_balance_minor, opening_date, is_savings, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [a.name, a.kind, a.color, a.openingBalanceMinor, a.openingDate, a.isSavings ? 1 : 0, a.sortOrder],
      );
      accountIdByName.set(a.name.toLowerCase(), result.lastInsertRowId);
    }

    const categoryId = (name: string): number => {
      const id = idByName.get(name.toLowerCase());
      if (id === undefined) throw new Error(`Category “${name}” is missing.`);
      return id;
    };
    const accountId = (name: string): number => {
      const id = accountIdByName.get(name.toLowerCase());
      if (id === undefined) throw new Error(`Account “${name}” is missing.`);
      return id;
    };

    for (const t of file.transactions.filter(isReal)) {
      await db.runAsync(
        `INSERT INTO transactions
           (date, description, amount_minor, type, category_id, account_id, transfer_id, note, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.date, t.description, t.amountMinor, t.type, categoryId(t.category), accountId(t.account), t.transferId, t.note, t.source, t.createdAt],
      );
    }
    for (const b of file.budgets) {
      await db.runAsync('INSERT INTO budgets (category_id, amount_minor) VALUES (?, ?)', [categoryId(b.category), b.amountMinor]);
    }
    for (const r of file.rules) {
      await db.runAsync('INSERT OR REPLACE INTO rules (merchant_key, category_id) VALUES (?, ?)', [r.merchantKey, categoryId(r.category)]);
    }
    for (const c of file.balanceChecks) {
      await db.runAsync('INSERT INTO balance_checks (account_id, date, actual_minor, created_at) VALUES (?, ?, ?, ?)', [accountId(c.account), c.date, c.actualMinor, c.createdAt]);
    }
    await db.runAsync(
      "INSERT INTO settings (key, value) VALUES ('currency', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [file.settings.currency],
    );
  });
  return summarizeBackup(file);
}
