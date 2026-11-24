// Money helpers.
//
// Amounts are stored as whole "minor units" (paise or cents) in integers,
// never as decimals. Decimals like 0.1 + 0.2 give 0.30000000000000004 in
// JavaScript, and over hundreds of transactions those tiny errors add up.
// With integers, 250.50 is stored as 25050 and sums are always exact.

export type CurrencyCode = 'INR' | 'USD' | 'CAD';

export const CURRENCIES: Record<CurrencyCode, { symbol: string; name: string; indianGrouping: boolean }> = {
  INR: { symbol: '₹', name: 'Indian rupee', indianGrouping: true },
  USD: { symbol: '$', name: 'US dollar', indianGrouping: false },
  CAD: { symbol: 'CA$', name: 'Canadian dollar', indianGrouping: false },
};

// The order currencies are shown in the picker.
export const CURRENCY_ORDER: CurrencyCode[] = ['INR', 'USD', 'CAD'];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

// "1,250.5" -> 125050. Returns null if the text isn't a valid amount.
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s₹$]|CA\$/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

function group(digits: string, indian: boolean): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const size = indian ? 2 : 3;
  const parts: string[] = [];
  while (rest.length > size) {
    parts.unshift(rest.slice(-size));
    rest = rest.slice(0, -size);
  }
  if (rest) parts.unshift(rest);
  return parts.join(',') + ',' + last3;
}

// 10359300 -> "₹1,03,593" (INR) or "$103,593" (USD). Cents/paise show only when non-zero.
export function formatMoney(
  minor: number,
  currency: CurrencyCode = 'INR',
  options: { forceDecimals?: boolean } = {},
): string {
  const { symbol, indianGrouping } = CURRENCIES[currency];
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let text = symbol + group(String(whole), indianGrouping);
  if (frac !== 0 || options.forceDecimals) text += '.' + String(frac).padStart(2, '0');
  return (negative ? '−' : '') + text;
}

// Short form for chart axes: 10359300 -> "₹1.0L" (INR) or "$104k" (USD).
export function formatCompact(minor: number, currency: CurrencyCode = 'INR'): string {
  const { symbol } = CURRENCIES[currency];
  const abs = Math.abs(minor) / 100;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  let text: string;
  if (currency === 'INR') {
    if (abs >= 1e7) text = trim(abs / 1e7) + 'Cr';
    else if (abs >= 1e5) text = trim(abs / 1e5) + 'L';
    else if (abs >= 1e3) text = trim(abs / 1e3) + 'k';
    else text = String(Math.round(abs));
  } else if (abs >= 1e6) text = trim(abs / 1e6) + 'M';
  else if (abs >= 1e3) text = trim(abs / 1e3) + 'k';
  else text = String(Math.round(abs));
  return (minor < 0 ? '−' : '') + symbol + text;
}
