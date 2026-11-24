// Turns your transactions into a spreadsheet file (CSV) that opens in Excel, Google Sheets, etc.

import type { CurrencyCode } from '../db/money';
import type { TransactionRow, TxSource } from '../db/types';

export const CSV_HEADER = [
  'Date',
  'Description',
  'Type',
  'Amount',
  'Currency',
  'Account',
  'Category',
  'Note',
  'Counted in totals',
  'Source',
];

// Wraps a value in quotes when needed. Text that starts with = + - @ is prefixed with an
// apostrophe so a spreadsheet can never run it as a formula (a known trick for planting
// formulas in exported files).
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// 25050 -> "250.50". Always two decimals, no currency symbol, so spreadsheets treat it as a number.
export function amountText(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = minor % 100;
  return `${whole}.${frac < 10 ? '0' + frac : frac}`;
}

const SOURCE_LABEL: Record<TxSource, string> = {
  manual: 'Entered by hand',
  screenshot: 'Screenshot',
  sample: 'Sample data',
};

// Oldest first, which is the natural order for a spreadsheet.
// Starts with a byte-order mark so Excel reads symbols like ₹ correctly, and uses
// Windows line endings.
export function buildCsv(rows: TransactionRow[], currency: CurrencyCode): string {
  const sorted = [...rows].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const lines = [CSV_HEADER, ...sorted.map((r) => [
    r.date,
    r.description,
    r.type === 'credit' ? 'Money in' : 'Money out',
    amountText(r.amountMinor),
    currency,
    r.accountName,
    r.categoryName,
    r.note,
    r.categoryKind === 'ignore' ? 'No' : 'Yes',
    SOURCE_LABEL[r.source],
  ])];
  return '\uFEFF' + lines.map((cols) => cols.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
