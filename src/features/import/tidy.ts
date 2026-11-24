// Turning the words on a row into a clean merchant name, and working out money in vs. out.

import type { TxType } from '../../db/types';
import { findDate, stripTime, stripWeekdays } from './text';

// ---- what to leave out entirely ----------------------------------------------------

// A payment that didn't go through is not a transaction.
export const FAILED_RE = /\b(fail(?:ed|ure)?|declin(?:ed)?|cancel(?:l)?ed|unsuccessful|rejected|expired|timed?\s*out)\b/i;
export const PENDING_RE = /\b(pending|processing|in progress|awaiting)\b/i;

// Lines about balances, offers and totals have amounts in them, but aren't transactions.
export const NOISE_LABEL_RE =
  /\b(balance|bal|total|available|limit|outstanding|opening|closing|cashback|reward|rewards|earned|offers?|scratch|coins?|points|savings|due|statement|summary|spent|income|interest rate)\b/i;

// ---- money in or out ---------------------------------------------------------------

const CREDIT_RE = /\b(received|credited|credit|refund(?:ed)?|deposit(?:ed)?|reversal|salary)\b/i;
const DEBIT_RE = /\b(paid|sent|debited|debit|payment|purchase|withdraw(?:al|n)?|wdl|spent|bill\s?pay)\b/i;

// Looks for words like "Paid to" or "Received from" anywhere in the row.
export function directionFromWords(texts: string[]): TxType | null {
  const all = texts.join(' ');
  if (CREDIT_RE.test(all)) return 'credit';
  if (DEBIT_RE.test(all)) return 'debit';
  return null;
}

// ---- names -------------------------------------------------------------------------

// Words that describe how a payment was made, not who it was to.
const STOP = new Set([
  'paid', 'received', 'sent', 'completed', 'successful', 'success', 'debited', 'credited', 'upi', 'wallet',
  'bank', 'card', 'autopay', 'auto', 'pay', 'imps', 'neft', 'rtgs', 'transaction', 'txn', 'transfer',
  'transferred', 'payment', 'ref', 'refno', 'via', 'to', 'from', 'at', 'on', 'of',
]);

// "Paid to ...", "Received from ...", "Money received from ...", even when the reader has glued the words together
// ("Paid toMeera", "Moneyreceivedfrom An").
const LEADING_CUE =
  /^(?:money\s*|payment\s*|amount\s*)?(?:paid|sent|received|transferred|debited|credited|payment|transfer)\s*(?:to|from|at)/i;

function stripLeadingCue(s: string): string {
  const m = LEADING_CUE.exec(s);
  if (!m) return s;
  const rest = s.slice(m[0].length);
  // after the cue there must be a space, or (when glued) the name must start with a capital letter
  if (/^\s/.test(rest) || /^[A-Z]/.test(rest)) return rest.trim();
  return s;
}

const PROTOCOL = /^(?:upi|neft|imps|rtgs|pos|ecom|ach|nach|billpay|bil|mmt|ib|mb|atm|cash|chq|clg)$/i;

function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3 || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-.'(])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

// "UPI-SWIGGY-9876@ybl" -> "Swiggy".  "NEFT-ACME TECHNOLOGIES" -> "Acme Technologies".
// Ordinary names such as "Uber India" are left alone.
export function tidyName(raw: string): string {
  let s = raw.trim();
  if (/^atm\s*[-/ ]?\s*wdl/i.test(s) || /^atmwdl/i.test(s) || /^atm\s*withdrawal/i.test(s)) return 'ATM withdrawal';
  if (/^(?:upi|neft|imps|rtgs|pos|ecom|ach|nach|billpay|bil|mmt|ib|mb)\s*[-/]/i.test(s)) {
    const parts = s.split(/[-/]/).map((p) => p.trim()).filter(Boolean);
    const keep = parts.filter((p) => !PROTOCOL.test(p) && !/@/.test(p) && !/^[\dA-Za-z]*\d{3,}[\dA-Za-z]*$/.test(p));
    s = keep.join(' ');
  }
  s = s.replace(/\S*@\S*/g, ' ').replace(/\s+/g, ' ').trim();
  return titleCaseIfShouting(s);
}

// What's left of a line once dates, times and "Paid to"-style wording are taken away.
// Returns '' if the line was only that kind of wording.
export function nameFromText(text: string, dayFirst: boolean): string {
  let s = text;
  // dates and times
  for (let i = 0; i < 3; i++) {
    const d = findDate(s, dayFirst);
    if (!d) break;
    s = d.remainder;
  }
  s = stripWeekdays(stripTime(s));
  s = s.replace(/[·]/g, ' ').replace(/\s+/g, ' ').trim();
  s = stripLeadingCue(s);
  s = s.replace(/^[\s\-,.:;]+|[\s\-,.:;]+$/g, '');
  if (!s) return '';
  // only descriptive words left?
  const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => STOP.has(w) || /^\d{1,2}$/.test(w))) return '';
  if (!/[A-Za-z]/.test(s)) return ''; // no letters: a number or symbols
  return tidyName(s);
}
