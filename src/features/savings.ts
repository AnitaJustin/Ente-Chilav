// How the Overview describes what happened to the money you kept: some may have gone into savings
// accounts (RD, FD, PPF...), the rest stayed in your bank and cash. Kept separate so it can be tested.

import type { SavingsMovement } from '../db/accounts';

export type SavingsSummary = {
  // The bar: how much of what you kept was moved into savings, and how much stayed in everyday accounts.
  // null when a bar wouldn't make sense (nothing kept, or nothing moved).
  bar: { savedMinor: number; stayedMinor: number } | null;
  lines: string[];
};

export function describeSavings(keptMinor: number, s: SavingsMovement, money: (minor: number) => string): SavingsSummary {
  const lines: string[] = [];
  let bar: SavingsSummary['bar'] = null;

  if (s.intoMinor === 0 && s.outOfMinor === 0) {
    return { bar: null, lines: ['Nothing was moved into or out of your savings accounts.'] };
  }

  if (s.netMinor > 0) {
    lines.push(`You moved ${money(s.netMinor)} into savings accounts.`);
    if (keptMinor > 0) {
      const saved = Math.min(s.netMinor, keptMinor);
      bar = { savedMinor: saved, stayedMinor: keptMinor - saved };
      if (s.netMinor > keptMinor) lines.push('That is more than you kept this time, so part of it came from money you already had.');
      else if (keptMinor > s.netMinor) lines.push(`${money(keptMinor - s.netMinor)} of what you kept is still in your bank and cash.`);
      else lines.push('Everything you kept went into savings.');
    } else {
      lines.push('You spent as much as came in, so it came from money you already had.');
    }
  } else if (s.netMinor < 0) {
    lines.push(`${money(-s.netMinor)} came out of your savings accounts.`);
  } else {
    lines.push(`${money(s.intoMinor)} went into savings accounts and the same amount came out.`);
  }

  // when money moved both ways in the same period, show both
  if (s.intoMinor > 0 && s.outOfMinor > 0 && s.netMinor !== 0) {
    lines.push(`In total, ${money(s.intoMinor)} went in and ${money(s.outOfMinor)} came out.`);
  }
  return { bar, lines };
}

// ---- the Overview bar -------------------------------------------------------------------------

export type BarBlock =
  | { kind: 'category'; id: number; amountMinor: number }
  | { kind: 'savings' | 'kept'; amountMinor: number };

// The blocks of the Overview bar, left to right.
//   Without savings accounts (moved is undefined): your spending categories, then what you kept, as a share of
//   your income.
//   With savings accounts: your spending categories, then what you moved into savings. These two fill the whole
//   bar, so it shows how what you spent and what you saved compare.
export function flowBlocks(
  categories: { categoryId: number; amountMinor: number }[],
  inflowMinor: number,
  outflowMinor: number,
  movedToSavingsMinor: number | undefined,
): BarBlock[] {
  const blocks: BarBlock[] = categories.map((c) => ({ kind: 'category', id: c.categoryId, amountMinor: c.amountMinor }));
  if (movedToSavingsMinor === undefined) {
    const kept = Math.max(0, inflowMinor - outflowMinor);
    if (kept > 0) blocks.push({ kind: 'kept', amountMinor: kept });
    return blocks;
  }
  if (movedToSavingsMinor > 0) blocks.push({ kind: 'savings', amountMinor: movedToSavingsMinor });
  return blocks;
}
