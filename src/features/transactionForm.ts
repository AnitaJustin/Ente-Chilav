// The logic behind the add/edit form, kept separate from the screen so it can be tested.

import { isValidYmd } from '../db/dates';
import { parseAmount } from '../db/money';
import type { Category, TransactionInput, TxType } from '../db/types';

export type FormValues = {
  type: TxType;
  amountText: string;
  description: string;
  date: string;
  categoryId: number | null;
  note: string;
};

export type BuildResult = { ok: true; input: TransactionInput } | { ok: false; error: string };

// Checks the form and turns it into something the database accepts.
export function buildInput(v: FormValues): BuildResult {
  const minor = parseAmount(v.amountText);
  if (minor === null) return { ok: false, error: 'Enter an amount like 250 or 250.50.' };
  if (minor <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  if (!v.description.trim()) return { ok: false, error: 'Add a merchant or person.' };
  if (!isValidYmd(v.date)) return { ok: false, error: 'Pick a valid date.' };
  if (v.categoryId == null) return { ok: false, error: 'Choose a category.' };
  return {
    ok: true,
    input: {
      date: v.date,
      description: v.description.trim(),
      amountMinor: minor,
      type: v.type,
      categoryId: v.categoryId,
      note: v.note.trim(),
    },
  };
}

// Keeps only digits and one decimal point, with at most two decimal places.
export function sanitizeAmountText(text: string): string {
  let s = text.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return s.slice(0, 12);
}

// 25050 -> "250.50", 25000 -> "250". Used to fill the amount box when editing.
export function minorToInputText(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = minor % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

// Money out can use spending categories; money in can use income categories.
// "Self transfer" (ignored in totals) is available for both.
export function categoriesForType(categories: Category[], type: TxType): Category[] {
  const wanted = type === 'debit' ? 'expense' : 'income';
  return categories.filter((c) => c.kind === wanted || c.kind === 'ignore');
}

export function defaultCategoryFor(categories: Category[], type: TxType): number | null {
  const name = type === 'debit' ? 'Other expense' : 'Other income';
  return categories.find((c) => c.name === name)?.id ?? null;
}
