import type { SQLiteDatabase } from 'expo-sqlite';

import { isCurrencyCode, type CurrencyCode } from './money';

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key],
  );
  return row ? row.value : null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function getCurrency(db: SQLiteDatabase): Promise<CurrencyCode> {
  const value = await getSetting(db, 'currency');
  return value && isCurrencyCode(value) ? value : 'INR';
}

export async function setCurrency(db: SQLiteDatabase, currency: CurrencyCode): Promise<void> {
  await setSetting(db, 'currency', currency);
}
