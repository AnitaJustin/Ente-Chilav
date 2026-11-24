// The logic behind the "check before saving" screen: building the list, bulk changes, and turning it into
// transactions. Kept separate from the screen so it can be tested thoroughly.

import { merchantKey } from '../../db/rules';
import { parseAmount } from '../../db/money';
import { isValidYmd } from '../../db/dates';
import type { CategoryKind, TransactionInput, TxType } from '../../db/types';
import { minorToInputText } from '../transactionForm';
import { suggestCategory, type RuleLike, type SuggestionSource } from './classify';
import type { ParsedRow } from './types';

export type CategoryLite = { id: number; name: string; kind: CategoryKind };

export type ReviewRow = {
  key: string; // unique across all screenshots
  include: boolean;
  name: string;
  amountText: string; // as it would be typed, e.g. "1250.50"
  type: TxType;
  categoryId: number;
  categorySource: SuggestionSource | 'you';
  remember: boolean; // remember this merchant's category for next time
  date: string; // always set: from the screenshot, or the default date
  dateKnown: boolean; // false when the screenshot didn't show one
  uncertainDirection: boolean;
  pending: boolean;
  repairedFrom: string | null; // the amount as first read, if a stray digit (the ₹ sign misread) was removed
  duplicate: 'existing' | 'batch' | null;
  raw: string;
};

export type ReviewContext = {
  categories: CategoryLite[]; // the categories you can use (hidden ones are left out)
  rules: RuleLike[];
  defaultDate: string;
};

export type ExistingTx = { date: string; amountMinor: number; type: TxType };

// Money out can use spending categories; money in can use income categories; "Not counted" fits both.
const fits = (kind: CategoryKind, type: TxType) => kind === 'ignore' || kind === (type === 'debit' ? 'expense' : 'income');

export function categoriesFor(categories: CategoryLite[], type: TxType): CategoryLite[] {
  return categories.filter((c) => fits(c.kind, type));
}

function pickCategory(ctx: ReviewContext, name: string, type: TxType): { id: number; source: SuggestionSource } {
  const usable = categoriesFor(ctx.categories, type);
  const s = suggestCategory(name, type, ctx.rules);
  const hit = usable.find((c) => c.name === s.categoryName);
  if (hit) return { id: hit.id, source: s.source };
  // The suggestion isn't available (hidden, or the wrong kind for this direction): use the catch-all.
  const fallback = usable.find((c) => c.name === (type === 'debit' ? 'Other expense' : 'Other income')) ?? usable[0];
  return { id: fallback.id, source: 'fallback' };
}

export function buildReviewRows(images: ParsedRow[][], ctx: ReviewContext, existing: ExistingTx[]): ReviewRow[] {
  // How many of each payment are already in the app. Two identical payments on one day (say, two phone
  // recharges) are two payments, so only as many are flagged as there already are.
  const existingCounts = new Map<string, number>();
  for (const e of existing) {
    const k = `${e.date}|${e.amountMinor}|${e.type}`;
    existingCounts.set(k, (existingCounts.get(k) ?? 0) + 1);
  }
  // How many of each payment earlier screenshots in this batch already showed.
  const seenCounts = new Map<string, number>();
  const out: ReviewRow[] = [];
  images.forEach((rows, i) => {
    const inThisImage = new Map<string, number>();
    for (const r of rows) {
      const date = r.date ?? ctx.defaultDate;
      const cat = pickCategory(ctx, r.name, r.type);
      const batchKey = `${date}|${r.amountMinor}|${r.type}|${merchantKey(r.name)}`;
      const looseKey = `${date}|${r.amountMinor}|${r.type}`;
      const nth = inThisImage.get(batchKey) ?? 0; // this is the nth identical row in THIS screenshot
      inThisImage.set(batchKey, nth + 1);
      let duplicate: ReviewRow['duplicate'] = null;
      // a repeat from an earlier screenshot (overlapping screenshots), not another identical row in this one
      if ((seenCounts.get(batchKey) ?? 0) > nth) duplicate = 'batch';
      else if ((existingCounts.get(looseKey) ?? 0) > nth) duplicate = 'existing';
      out.push({
        key: `${i}-${r.key}`,
        include: duplicate === null && !r.pending,
        name: r.name,
        amountText: minorToInputText(r.amountMinor),
        type: r.type,
        categoryId: cat.id,
        categorySource: cat.source,
        remember: false,
        date,
        dateKnown: r.date !== null,
        uncertainDirection: r.uncertainDirection,
        pending: r.pending,
        repairedFrom: r.repairedFrom ?? null,
        duplicate,
        raw: r.raw,
      });
    }
    for (const [k, c] of inThisImage) seenCounts.set(k, Math.max(seenCounts.get(k) ?? 0, c));
  });
  return out;
}

const mapKeys = (rows: ReviewRow[], keys: Set<string>, fn: (r: ReviewRow) => ReviewRow) =>
  rows.map((r) => (keys.has(r.key) ? fn(r) : r));

export function editRow(rows: ReviewRow[], key: string, patch: Partial<ReviewRow>): ReviewRow[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}

// Keys of every row for the same merchant as `key` (including itself).
export function sameMerchantKeys(rows: ReviewRow[], key: string): string[] {
  const me = rows.find((r) => r.key === key);
  if (!me) return [];
  const k = merchantKey(me.name);
  return rows.filter((r) => merchantKey(r.name) === k).map((r) => r.key);
}

export function setCategory(rows: ReviewRow[], keys: string[], categoryId: number, remember: boolean): ReviewRow[] {
  return mapKeys(rows, new Set(keys), (r) => ({ ...r, categoryId, categorySource: 'you', remember }));
}

// Switches rows between money in and out. Their category is re-suggested, unless you chose one that still fits.
export function setType(rows: ReviewRow[], keys: string[], type: TxType, ctx: ReviewContext): ReviewRow[] {
  return mapKeys(rows, new Set(keys), (r) => {
    const current = ctx.categories.find((c) => c.id === r.categoryId);
    if (r.categorySource === 'you' && current && fits(current.kind, type)) {
      return { ...r, type, uncertainDirection: false };
    }
    const cat = pickCategory(ctx, r.name, type);
    return { ...r, type, uncertainDirection: false, categoryId: cat.id, categorySource: cat.source, remember: false };
  });
}

export function setInclude(rows: ReviewRow[], keys: string[], include: boolean): ReviewRow[] {
  return mapKeys(rows, new Set(keys), (r) => ({ ...r, include }));
}

// The date for rows whose screenshot didn't show one.
export function applyDefaultDate(rows: ReviewRow[], date: string): ReviewRow[] {
  return rows.map((r) => (r.dateKnown ? r : { ...r, date }));
}

// If the ₹ sign was read as a digit (₹412 read as 2412), drop each amount's first digit.
export function dropFirstDigit(rows: ReviewRow[]): ReviewRow[] {
  return rows.map((r) => {
    const [whole, frac] = r.amountText.replace(/,/g, '').split('.');
    if (whole.length < 2) return r;
    const next = whole.slice(1).replace(/^0+(?=\d)/, '');
    return { ...r, amountText: frac !== undefined ? `${next}.${frac}` : next, repairedFrom: r.repairedFrom ?? r.amountText };
  });
}

// Puts back the amount exactly as it was first read, for one row or all of them.
export function undoRepair(rows: ReviewRow[], key?: string): ReviewRow[] {
  return rows.map((r) => {
    if (r.repairedFrom === null || (key !== undefined && r.key !== key)) return r;
    const minor = parseAmount(r.repairedFrom.replace(/,/g, ''));
    return { ...r, amountText: minor === null ? r.repairedFrom : minorToInputText(minor), repairedFrom: null };
  });
}

export type BuiltInputs = { inputs: TransactionInput[]; errors: string[] };

// Turns the ticked rows into transactions, or says what's wrong with them.
export function buildInputs(rows: ReviewRow[], accountId: number | null): BuiltInputs {
  const inputs: TransactionInput[] = [];
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.include) continue;
    const label = r.name.trim() || 'a row';
    const minor = parseAmount(r.amountText);
    if (minor === null || minor <= 0) {
      errors.push(`Check the amount for “${label}”.`);
      continue;
    }
    if (!r.name.trim()) {
      errors.push('One of the rows has no name.');
      continue;
    }
    if (!isValidYmd(r.date)) {
      errors.push(`Check the date for “${label}”.`);
      continue;
    }
    inputs.push({
      date: r.date,
      description: r.name.trim().slice(0, 80),
      amountMinor: minor,
      type: r.type,
      categoryId: r.categoryId,
      accountId: accountId ?? undefined,
      note: '',
      source: 'screenshot',
    });
  }
  return { inputs, errors };
}

// The merchants to remember: one entry per merchant, the last choice winning.
export function rulesToRemember(rows: ReviewRow[]): { name: string; categoryId: number }[] {
  const byKey = new Map<string, { name: string; categoryId: number }>();
  for (const r of rows) {
    if (r.include && r.remember && r.categorySource === 'you' && /[A-Za-z]/.test(r.name)) {
      byKey.set(merchantKey(r.name), { name: r.name, categoryId: r.categoryId });
    }
  }
  return [...byKey.values()];
}
