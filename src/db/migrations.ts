import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_CATEGORIES } from './defaultCategories';

// Bump this number whenever the database layout changes, and add a new
// "if (version < N)" block below. Existing phones then upgrade automatically
// without losing any data.
const LATEST_VERSION = 5;

export async function migrate(db: SQLiteDatabase) {
  // This setting is per-connection, so it must run every time the app opens.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= LATEST_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE categories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color       TEXT NOT NULL,
        kind        TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'ignore')),
        is_default  INTEGER NOT NULL DEFAULT 0,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        date          TEXT NOT NULL
                      CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        description   TEXT NOT NULL,
        amount_minor  INTEGER NOT NULL CHECK (amount_minor > 0),
        type          TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
        category_id   INTEGER NOT NULL REFERENCES categories(id),
        note          TEXT NOT NULL DEFAULT '',
        source        TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'screenshot', 'sample')),
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX idx_transactions_date ON transactions(date);
      CREATE INDEX idx_transactions_category ON transactions(category_id);

      CREATE TABLE budgets (
        category_id   INTEGER PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
        amount_minor  INTEGER NOT NULL CHECK (amount_minor > 0)
      );

      CREATE TABLE rules (
        merchant_key  TEXT PRIMARY KEY,
        category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
      );

      CREATE TABLE settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );
    `);

    await db.withTransactionAsync(async () => {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        const c = DEFAULT_CATEGORIES[i];
        await db.runAsync(
          'INSERT INTO categories (name, color, kind, is_default, sort_order) VALUES (?, ?, ?, 1, ?)',
          [c.name, c.color, c.kind, i],
        );
      }
      await db.runAsync("INSERT INTO settings (key, value) VALUES ('currency', 'INR')");
    });

    version = 1;
  }

  if (version < 2) {
    // Lets you hide categories you never use, without losing any past transactions.
    await db.execAsync('ALTER TABLE categories ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;');
    version = 2;
  }

  if (version < 3) {
    // The sample-data feature has been removed, so clear out any made-up transactions that
    // were left over from testing. Your own entries are never touched.
    await db.execAsync("DELETE FROM transactions WHERE source = 'sample';");
    version = 3;
  }

  if (version < 4) {
    // Accounts (bank accounts and cash), transfers between them, and balance checks.
    await db.execAsync(`
      CREATE TABLE accounts (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        name                   TEXT NOT NULL UNIQUE COLLATE NOCASE,
        kind                   TEXT NOT NULL CHECK (kind IN ('bank', 'cash')),
        color                  TEXT NOT NULL,
        opening_balance_minor  INTEGER,
        opening_date           TEXT CHECK (opening_date IS NULL
                               OR opening_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        sort_order             INTEGER NOT NULL DEFAULT 0
      );

      ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id);
      ALTER TABLE transactions ADD COLUMN transfer_id INTEGER;
      CREATE INDEX idx_transactions_account ON transactions(account_id);

      CREATE TABLE balance_checks (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        date          TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        actual_minor  INTEGER NOT NULL,
        created_at    INTEGER NOT NULL
      );
    `);
    // Everything you've entered so far goes into one starter account, which you can rename.
    await db.withTransactionAsync(async () => {
      const first = await db.runAsync(
        "INSERT INTO accounts (name, kind, color, sort_order) VALUES ('Main account', 'bank', '#3D8FD9', 0)",
      );
      await db.runAsync('UPDATE transactions SET account_id = ?', [first.lastInsertRowId]);
    });
    version = 4;
  }

  if (version < 5) {
    // Savings accounts (RD, FD, PPF...): money moved into them counts as saved in the Overview.
    await db.execAsync('ALTER TABLE accounts ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0;');
    version = 5;
  }

  // Future changes go here, for example:
  // if (version < 6) { await db.execAsync('ALTER TABLE ...'); version = 4; }

  await db.execAsync(`PRAGMA user_version = ${LATEST_VERSION}`);
}
