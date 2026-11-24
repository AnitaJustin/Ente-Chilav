// For troubleshooting: lets you share what the phone read from a screenshot, with the personal details
// hidden but the layout kept intact.

import type { OcrLine } from './types';

// Words that describe the layout rather than a person, so they are left readable.
const KEEP = new Set([
  'paid', 'to', 'from', 'received', 'sent', 'today', 'yesterday', 'balance', 'total', 'failed', 'completed', 'upi', 'dr',
  'cr', 'transaction', 'history', 'passbook', 'statement', 'date', 'description', 'amount', 'money', 'payment', 'pending',
  'wallet', 'bank', 'debited', 'credited', 'successful', 'refund', 'cashback', 'home', 'scan', 'pay',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'am', 'pm',
]);

// Hides names (and optionally amounts and dates) but keeps the length and shape of every line.
export function maskText(text: string, hideNumbers: boolean): string {
  let out = text.replace(/[A-Za-z]+/g, (word) => (KEEP.has(word.toLowerCase()) ? word : 'x'.repeat(word.length)));
  if (hideNumbers) out = out.replace(/\d/g, '9');
  return out;
}

export function maskLines(lines: OcrLine[], hideNumbers: boolean): OcrLine[] {
  return lines.map((l) => ({ ...l, text: maskText(l.text, hideNumbers) }));
}
