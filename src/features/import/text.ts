// Small, careful helpers for reading amounts and dates out of messy recognised text.

import { parseAmount } from '../../db/money';

// ---- tidy-up ---------------------------------------------------------------------

export function normalizeLine(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[·•‧∙⋅|]/g, ' · ')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- amounts ---------------------------------------------------------------------

export type AmountMatch = {
  amountMinor: number;
  numberText: string; // the digits as read, e.g. "1,250.50"
  sign: '+' | '-' | null;
  drcr: 'dr' | 'cr' | null;
  rest: string | null; // for a line like "UPI-SWIGGY 412.50 Dr": the text before the amount
};

// A number written the way amounts are: with comma grouping (Indian or western) or plain,
// and at most two decimals.
const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
// A currency written in letters, such as Rs. or INR...
const CUR = String.raw`(?:rs\.?|inr|usd|cad|ca\$|\$)`;
// ...or the ₹ sign, which text readers often turn into some other symbol (天 ° ? and so on).
const SYM = String.raw`[^A-Za-z0-9\s+\-.,:%/@]{1,3}`;

// The whole line is an amount.
const PURE = new RegExp(
  String.raw`^([+-])?\s*(?:(${CUR})\s*)?(?:(${SYM})\s*)?(?:[TZFRP](?=\d)|[127]\s+(?=\d))?([+-])?\s*${NUM}\s*(?:/-)?\s*(dr|cr)?\.?$`,
  'i',
);
// An amount at the end of a line that also has words in it.
// (A sign only counts when there's a space before it: in "UPI-ANITA-590" the hyphen is a separator.)
const TRAIL = new RegExp(
  String.raw`^(.*[A-Za-z].*?)(?:\s+([+-]))?\s*(?:(${CUR})\s*)?(?:(${SYM})\s*)?${NUM}\s*(dr|cr)?\.?$`,
  'i',
);

const MAX_MINOR = 10_000_000_000; // 10 crore

function finish(
  numberText: string,
  signA: string | undefined,
  signB: string | undefined,
  drcr: string | undefined,
  rest: string | null,
): AmountMatch | null {
  const minor = parseAmount(numberText);
  if (minor === null || minor <= 0 || minor > MAX_MINOR) return null;
  const sign = (signA || signB || null) as '+' | '-' | null;
  return { amountMinor: minor, numberText, sign, drcr: drcr ? (drcr.toLowerCase() as 'dr' | 'cr') : null, rest };
}

// Finds an amount in a line of text, or returns null.
// A line that is only a number counts as an amount (the ₹ sign is often lost). A number at the end of
// a line with words only counts if it clearly looks like money: it has decimals, comma grouping, a
// sign, Dr/Cr, or a currency mark.
export function extractAmount(text: string): AmountMatch | null {
  const pure = PURE.exec(text);
  if (pure) return finish(pure[5], pure[1], pure[4], pure[6], null);

  const trail = TRAIL.exec(text);
  if (trail) {
    const [, rest, sign, cur, sym, num, drcr] = trail;
    const strong = /[,.]/.test(num) || !!sign || !!cur || !!sym || !!drcr;
    if (!strong) return null;
    return finish(num, sign, undefined, drcr, rest.trim());
  }
  return null;
}

// ---- dates -----------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])`;
const monthNumber = (word: string) => MONTH_NAMES[word.slice(0, 3).toLowerCase()];

export type DateHit =
  | { kind: 'day'; day: number; month: number; year: number | null }
  | { kind: 'month'; month: number; year: number }
  | { kind: 'relative'; offset: 0 | -1 };

const WEEKDAY = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?\b\.?,?/gi;

function dim(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

// Finds the first date in a line. Returns what it found and the line with that date taken out.
// `dayFirst` says how to read an ambiguous 05/06/2026 (day first, as is usual in India).
export function findDate(text: string, dayFirst: boolean): { hit: DateHit; remainder: string } | null {
  const low = text.toLowerCase();

  const rel = /\b(today|yesterday)\b/.exec(low);
  if (rel) {
    return { hit: { kind: 'relative', offset: rel[1] === 'today' ? 0 : -1 }, remainder: cut(text, rel.index, rel[0].length) };
  }

  // 19/11/2026, 19-11-26, 19.11.2026
  const numeric = /(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?!\d)/.exec(low);
  if (numeric) {
    let a = Number(numeric[1]);
    let b = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    let day = dayFirst ? a : b;
    let month = dayFirst ? b : a;
    if (a > 12 && b <= 12) [day, month] = [a, b]; // clearly day first
    else if (b > 12 && a <= 12) [day, month] = [b, a]; // clearly month first
    if (month >= 1 && month <= 12 && day >= 1 && day <= dim(month, year)) {
      return { hit: { kind: 'day', day, month, year }, remainder: cut(text, numeric.index, numeric[0].length) };
    }
  }

  // 20 Nov, 20 Nov 2026, 20th November, 20-Nov-2026
  const dayMonth = new RegExp(String.raw`(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[\s,.\-]*${MONTH_RE}\.?(?:[\s,.\-]*(\d{4})(?!\d))?`).exec(low);
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = monthNumber(dayMonth[2]);
    const year = dayMonth[3] ? Number(dayMonth[3]) : null;
    if (day >= 1 && day <= dim(month, year ?? 2024)) {
      return { hit: { kind: 'day', day, month, year }, remainder: cut(text, dayMonth.index, dayMonth[0].length) };
    }
  }

  // November 2026
  const monthYear = new RegExp(String.raw`\b${MONTH_RE}\.?\s*,?\s*(\d{4})\b`).exec(low);
  if (monthYear) {
    return {
      hit: { kind: 'month', month: monthNumber(monthYear[1]), year: Number(monthYear[2]) },
      remainder: cut(text, monthYear.index, monthYear[0].length),
    };
  }

  // Nov 20, Nov 20, 2026, Nov20,2026
  const monthDay = new RegExp(String.raw`\b${MONTH_RE}\.?\s*(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4})(?!\d))?`).exec(low);
  if (monthDay) {
    const month = monthNumber(monthDay[1]);
    const day = Number(monthDay[2]);
    const year = monthDay[3] ? Number(monthDay[3]) : null;
    if (day >= 1 && day <= dim(month, year ?? 2024)) {
      return { hit: { kind: 'day', day, month, year }, remainder: cut(text, monthDay.index, monthDay[0].length) };
    }
  }
  return null;
}

function cut(text: string, index: number, length: number): string {
  return (text.slice(0, index) + ' ' + text.slice(index + length)).replace(/\s+/g, ' ').trim();
}

// Is the whole line just a date (or a day name with a date)? Used to spot headings like "Today".
export function isPureDate(text: string, dayFirst: boolean): boolean {
  const found = findDate(text, dayFirst);
  if (!found) return false;
  const left = found.remainder.replace(WEEKDAY, ' ').replace(/[\s·,.\-:]/g, '');
  return left.length === 0;
}

export function stripTime(text: string): string {
  return text.replace(/\b\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*(?:[ap]\.?\s?m\.?)?/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function stripWeekdays(text: string): string {
  return text.replace(WEEKDAY, ' ').replace(/\s+/g, ' ').trim();
}

// Turns a found date into YYYY-MM-DD.
//   today: the current day
//   headingYear: the year from a "November 2026" style heading above, if there is one
export function resolveDate(
  hit: DateHit,
  today: string,
  headingYear: { month: number; year: number } | null,
): string | null {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const [ty, tm, td] = today.split('-').map(Number);
  if (hit.kind === 'relative') {
    const d = new Date(ty, tm - 1, td + hit.offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (hit.kind === 'month') return null; // a month on its own isn't a day
  let year = hit.year;
  if (year === null) {
    if (headingYear && headingYear.month === hit.month) year = headingYear.year;
    else {
      // The most recent such date that isn't in the future.
      year = hit.month > tm || (hit.month === tm && hit.day > td) ? ty - 1 : ty;
    }
  }
  if (hit.day > dim(hit.month, year)) return null;
  return `${year}-${pad(hit.month)}-${pad(hit.day)}`;
}
