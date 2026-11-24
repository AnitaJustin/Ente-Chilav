// Turns the lines of text found on a screenshot of a transaction list into transactions.
//
// It is built around what real text readers produce: the ₹ sign is often lost or changed into some other
// character, words get glued together, and an amount is sometimes merged into the same line as the
// description. So amounts are found by their shape and where they sit (right-aligned), and each row is
// the band of text around its amount.

import type { TxType } from '../../db/types';
import { FAILED_RE, NOISE_LABEL_RE, PENDING_RE, directionFromWords, nameFromText } from './tidy';
import {
  extractAmount,
  findDate,
  isPureDate,
  normalizeLine,
  resolveDate,
  type AmountMatch,
  type DateHit,
} from './text';
import { parseAmount } from '../../db/money';
import type { ImageSize, OcrLine, ParseResult, ParsedRow, SkippedLine } from './types';

type Item = OcrLine & { yc: number; right: number };
type Anchor = { item: Item; amount: AmountMatch };

const CLOCK = /^\d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)?$/i;
const BATTERY = /^\d{1,3}\s?%$/;
// The heading row of a statement table: "Date  Description  Amount".
const HEADER_WORDS = new Set(['date', 'description', 'amount', 'particulars', 'narration', 'details', 'balance', 'debit', 'credit', 'dr', 'cr', 'withdrawal', 'withdrawals', 'deposit', 'deposits', 'ref', 'chq', 'type', 'status', 'time', 'txn', 'value', 'transaction', 'remarks']);
const isColumnHeading = (t: string) => {
  if (/\d/.test(t)) return false; // a heading has no numbers; "412.50 Dr" is an amount
  const words = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.every((w) => HEADER_WORDS.has(w));
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function parseTransactionLines(
  lines: OcrLine[],
  image: ImageSize,
  options: { today: string; dayFirst?: boolean },
): ParseResult {
  const dayFirst = options.dayFirst ?? true;
  const skipped: SkippedLine[] = [];

  const items: Item[] = lines
    .map((l) => ({ ...l, text: normalizeLine(l.text) }))
    .filter((l) => l.text.length > 0)
    .map((l) => ({ ...l, yc: l.y + l.height / 2, right: l.x + l.width }));

  // The phone's own status bar at the top of a screenshot: the clock, the battery level, signal and so on.
  // Some phones show the battery as a bare number with no % sign ("56"), which looks exactly like a small
  // amount. So a bare short number on the same line as the clock is dropped. (Amounts with decimals, commas
  // or a sign are never mistaken for a battery level, so a screenshot cropped right at the first payment
  // keeps it.) If the clock wasn't read, a lone bare number right at the very top is dropped later on,
  // but only if nothing else is close below it.
  const BARE_SHORT = /^\d{1,3}\s?%?$/;
  const clocks = items.filter((l) => CLOCK.test(l.text) && l.yc < image.height * 0.045);
  let barTop = Infinity;
  let barBottom = -Infinity;
  if (clocks.length > 0) {
    const h = Math.max(...clocks.map((c) => c.height));
    barTop = Math.min(...clocks.map((c) => c.y)) - h * 0.7;
    barBottom = Math.max(...clocks.map((c) => c.y + c.height)) + h * 0.7;
  }
  const isStatusBar = (l: Item) => l.yc >= barTop && l.yc <= barBottom && BARE_SHORT.test(l.text);

  // Phone chrome: the status bar, and single stray letters (profile pictures).
  const content = items.filter(
    (l) => !CLOCK.test(l.text) && !BATTERY.test(l.text) && !isStatusBar(l) && !/^[A-Za-z]$/.test(l.text) && !isColumnHeading(l.text),
  );

  // ---- 1. which lines carry an amount? -------------------------------------------
  const rightAligned = (l: Item) => l.right >= image.width * 0.55;
  let candidates: Anchor[] = [];
  for (const item of content) {
    const amount = extractAmount(item.text);
    if (!amount) continue;
    if (NOISE_LABEL_RE.test(item.text)) {
      skipped.push({ reason: 'balance or offer', text: item.text });
      continue;
    }
    candidates.push({ item, amount });
  }
  // A bare number at the very top of the screen with nothing close below it is the battery level (the clock
  // wasn't read, or it wouldn't have got this far). A real first payment has the next payment right beneath it.
  const byHeight = [...candidates].sort((a, b) => a.item.yc - b.item.yc);
  const top = byHeight[0];
  if (top && top.item.yc < image.height * 0.035 && BARE_SHORT.test(top.item.text)) {
    const next = byHeight[1];
    if (!next || next.item.yc - top.item.yc >= image.height * 0.09) {
      skipped.push({ reason: 'status bar', text: top.item.text });
      candidates = candidates.filter((c) => c !== top);
    }
  }

  // Amounts sit on the right in almost every app. If we found at least two there, trust only those.
  const onRight = candidates.filter((c) => rightAligned(c.item));
  if (onRight.length >= 2) {
    for (const c of candidates) if (!onRight.includes(c)) skipped.push({ reason: 'amount not on the right', text: c.item.text });
    candidates = onRight;
  } else {
    // A layout with amounts elsewhere: keep only lines that are purely an amount.
    candidates = candidates.filter((c) => c.amount.rest === null);
  }
  const anchors = candidates.sort((a, b) => a.item.yc - b.item.yc);
  if (anchors.length === 0) return { rows: [], skipped };

  const anchorItems = new Set(anchors.map((a) => a.item));
  const spacing = median(anchors.slice(1).map((a, i) => a.item.yc - anchors[i].item.yc));
  const typical = spacing > 0 ? spacing : image.height * 0.07;

  // ---- 2. headings such as "November 2026", "Today" or "19 Nov 2026" ---------------
  const nearAnchor = (l: Item) => anchors.some((a) => Math.abs(a.item.yc - l.yc) <= typical * 0.35);
  type Heading = { yc: number; hit: DateHit };
  const headings: Heading[] = [];
  const headingItems = new Set<Item>();
  for (const l of content) {
    if (anchorItems.has(l) || !isPureDate(l.text, dayFirst)) continue;
    const found = findDate(l.text, dayFirst);
    if (!found) continue;
    const alwaysHeading = found.hit.kind === 'month' || found.hit.kind === 'relative' || /[A-Za-z]{3,}\s*,/.test(l.text.replace(/\d/g, ''));
    // A full date sitting level with an amount is that row's own date (as in a bank statement).
    if (alwaysHeading || !nearAnchor(l)) {
      headings.push({ yc: l.yc, hit: found.hit });
      headingItems.add(l);
    }
  }
  headings.sort((a, b) => a.yc - b.yc);

  // ---- 3. one row per amount --------------------------------------------------------
  const rows: ParsedRow[] = [];
  anchors.forEach((a, i) => {
    const yc = a.item.yc;
    const top = i === 0 ? yc - typical * 0.5 : (anchors[i - 1].item.yc + yc) / 2;
    const bottom = i === anchors.length - 1 ? yc + typical * 0.5 : (yc + anchors[i + 1].item.yc) / 2;

    const mine = content
      .filter((l) => !anchorItems.has(l) && !headingItems.has(l) && l.yc >= top && l.yc < bottom)
      .sort((p, q) => p.yc - q.yc || p.x - q.x);
    const texts = [...(a.amount.rest ? [a.amount.rest] : []), ...mine.map((l) => l.text)];
    const raw = [...mine.filter((l) => l.yc < yc - 1).map((l) => l.text), a.item.text, ...mine.filter((l) => l.yc >= yc - 1).map((l) => l.text)]
      .join('  |  ');

    // left out: payments that failed
    if (texts.some((t) => FAILED_RE.test(t))) {
      skipped.push({ reason: 'failed payment', text: raw });
      return;
    }

    // money in or out
    let type: TxType | null = null;
    if (a.amount.sign === '+' || a.amount.drcr === 'cr') type = 'credit';
    else if (a.amount.sign === '-' || a.amount.drcr === 'dr') type = 'debit';
    else type = directionFromWords(texts);
    const uncertainDirection = type === null;

    // the date: this row's own, otherwise the heading above it
    let date: string | null = null;
    let dateFrom: ParsedRow['dateFrom'] = null;
    const above = [...headings].filter((h) => h.yc < yc).pop();
    const headingMonthYear = [...headings].filter((h) => h.yc < yc && h.hit.kind === 'month').pop();
    const monthYear = headingMonthYear && headingMonthYear.hit.kind === 'month' ? { month: headingMonthYear.hit.month, year: headingMonthYear.hit.year } : null;
    for (const t of texts) {
      const found = findDate(t, dayFirst);
      if (found && found.hit.kind !== 'month') {
        const resolved = resolveDate(found.hit, options.today, monthYear);
        if (resolved) {
          date = resolved;
          dateFrom = 'row';
          break;
        }
      }
    }
    if (!date) {
      // the nearest heading above that names an actual day
      const dayHeadings = headings.filter((h) => h.yc < yc && h.hit.kind !== 'month');
      const nearest = dayHeadings.length ? dayHeadings[dayHeadings.length - 1] : null;
      // use it only if no month heading comes after it (that would start a different group)
      if (nearest && !(above && above.hit.kind === 'month' && above.yc > nearest.yc)) {
        const resolved = resolveDate(nearest.hit, options.today, monthYear);
        if (resolved) {
          date = resolved;
          dateFrom = 'heading';
        }
      }
    }

    // the name: the first line left once dates, times and "Paid to" wording are removed
    let name = '';
    for (const t of texts) {
      name = nameFromText(t, dayFirst);
      if (name) break;
    }
    if (!name) name = 'Unknown';

    rows.push({
      key: `r${rows.length + 1}`,
      name,
      amountMinor: a.amount.amountMinor,
      type: type ?? 'debit',
      date,
      dateFrom,
      uncertainDirection,
      pending: texts.some((t) => PENDING_RE.test(t)),
      amountText: a.amount.numberText,
      repairedFrom: null,
      raw,
    });
  });

  return { rows, skipped };
}

// If every amount starts with the same digit (2 or 7), the ₹ sign has probably been read as that digit
// (₹412 read as 2412). Returns that digit, otherwise null.
export function suspectedCurrencyDigit(rows: ParsedRow[]): string | null {
  if (rows.length < 4) return null;
  for (const digit of ['2', '7']) {
    const hits = rows.filter((r) => {
      const t = r.amountText.replace(/,/g, '');
      return t.length >= 3 && t[0] === digit;
    });
    if (hits.length / rows.length >= 0.8) return digit;
  }
  return null;
}

// ---- the ₹ sign read as a digit ---------------------------------------------------------------
//
// The phone's text reader often reads the ₹ sign as a 7 or a 2, stuck onto the front of the amount:
// ₹250 becomes 7250 or 2250. It doesn't always do it, so each amount has to be judged on its own.
//
// Whether it is happening is decided by weighing evidence across the whole batch of screenshots. Honest
// amounts rarely begin with a 7 (about 6% of the time) and less often with a 2 (about 22%), so a
// batch full of them points to the ₹ sign. A leading 7 is strong evidence, a leading 2 weak, and any
// other first digit counts against. Only when the evidence is strong are the amounts that begin with a
// 2 or 7 repaired. Amounts that begin with anything else are left exactly as read, and a batch that
// reads cleanly is never touched. (Tested on simulated screenshots: it never fired on clean ones.)

const MISREAD_DIGITS = new Set(['2', '7']);
const NATURAL_RATE: Record<string, number> = { '2': 0.22, '7': 0.06 }; // how often honest amounts start with it
const MISREAD_RATE = 0.8; // if the problem is happening, roughly how many amounts it affects
export const REPAIR_EVIDENCE = 1.0; // evidence needed (as a power of ten: 1.0 means 10 to 1 odds)

function wholePart(amountText: string): string {
  return amountText.replace(/,/g, '').split('.')[0];
}

// How strongly this batch of amounts points to the ₹ sign being read as a 2 or a 7.
export function currencyDigitEvidence(rows: { amountText: string }[]): number {
  let sum = 0;
  for (const r of rows) {
    const w = wholePart(r.amountText);
    const d = w.length >= 2 ? w[0] : '';
    if (MISREAD_DIGITS.has(d)) {
      const q = NATURAL_RATE[d];
      sum += Math.log10((MISREAD_RATE * 0.5 + (1 - MISREAD_RATE) * q) / q);
    } else {
      sum += Math.log10(1 - MISREAD_RATE);
    }
  }
  return sum;
}

export type RepairResult = { images: ParsedRow[][]; repaired: number };

export function repairCurrencyDigits(images: ParsedRow[][]): RepairResult {
  const all = images.flat();
  const hits = all.filter((r) => {
    const w = wholePart(r.amountText);
    return w.length >= 2 && MISREAD_DIGITS.has(w[0]);
  });
  if (hits.length < 2 || currencyDigitEvidence(all) < REPAIR_EVIDENCE) return { images, repaired: 0 };

  let repaired = 0;
  const fixed = images.map((rows) =>
    rows.map((r) => {
      const w = wholePart(r.amountText);
      if (w.length < 2 || !MISREAD_DIGITS.has(w[0])) return r;
      const frac = r.amountText.includes('.') ? r.amountText.slice(r.amountText.indexOf('.')) : '';
      const text = w.slice(1).replace(/^0+(?=\d)/, '') + frac;
      const minor = parseAmount(text);
      if (minor === null || minor <= 0) return r; // stripping would leave nothing sensible: keep what was read
      repaired++;
      return { ...r, amountMinor: minor, amountText: text, repairedFrom: r.amountText };
    }),
  );
  return { images: fixed, repaired };
}
