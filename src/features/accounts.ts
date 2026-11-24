// Everything the Accounts tab shows, gathered in one go, plus the "does it add up?" tally.

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getAccountPeriod,
  getLatestCheck,
  isTracked,
  listAccounts,
  type AccountPeriod,
  type CheckResult,
} from '../db/accounts';
import { daysInMonth, monthKey, todayYmd } from '../db/dates';
import type { CurrencyCode } from '../db/money';
import { getCurrency } from '../db/settings';
import { listMonths, listTransfers } from '../db/transactions';
import type { Account, TransferRow } from '../db/types';

export type AccountCard = {
  account: Account;
  period: AccountPeriod;
  check: CheckResult | null; // your latest balance check within the period, if any
};

export type Tally = {
  openingMinor: number; // total in accounts that were already tracked when the period began
  startedMinor: number; // opening balances of accounts whose tracking began during the period
  cameInMinor: number;
  spentMinor: number;
  movedMinor: number; // net money moved or "not counted"; zero when transfers are between tracked accounts
  closingMinor: number; // what the records say the total should be
  savingsMinor: number; // of that total, how much is in savings accounts (RD, FD...)
  tracked: number; // accounts whose balance is tracked
  untracked: number; // accounts that aren't
  checked: number; // tracked accounts you've checked against your bank in this period
  matching: number; // of those, how many match exactly
  differenceMinor: number; // total of (actual − expected) across the checked accounts
  checkedActualMinor: number; // what your bank showed, added up across the checked accounts
  checkedExpectedMinor: number; // what your records say for the same accounts
  off: { name: string; differenceMinor: number }[]; // the checked accounts that don't match
};

export type AccountsData = {
  months: string[];
  month: string;
  currency: CurrencyCode;
  periodStart: string;
  periodEnd: string; // today for the current month, otherwise the month's last day
  isCurrentMonth: boolean;
  cards: AccountCard[];
  tally: Tally | null; // null when no account has its balance tracked
  transfers: TransferRow[]; // moves of money between your accounts during the month
};

// Adds up the tracked accounts into one tally.
export function composeTally(cards: AccountCard[]): Tally | null {
  const tracked = cards.filter((c) => c.period.status === 'tracked');
  if (tracked.length === 0) return null;

  const t: Tally = {
    openingMinor: 0,
    startedMinor: 0,
    cameInMinor: 0,
    spentMinor: 0,
    movedMinor: 0,
    closingMinor: 0,
    savingsMinor: 0,
    tracked: tracked.length,
    untracked: cards.filter((c) => c.period.status === 'untracked').length,
    checked: 0,
    matching: 0,
    differenceMinor: 0,
    checkedActualMinor: 0,
    checkedExpectedMinor: 0,
    off: [],
  };
  for (const c of tracked) {
    t.openingMinor += c.period.openingMinor ?? 0;
    t.startedMinor += c.period.startedMinor;
    t.cameInMinor += c.period.cameInMinor;
    t.spentMinor += c.period.spentMinor;
    t.movedMinor += c.period.movedMinor;
    t.closingMinor += c.period.closingMinor ?? 0;
    if (c.account.isSavings) t.savingsMinor += c.period.closingMinor ?? 0;
    if (c.check) {
      t.checked++;
      t.differenceMinor += c.check.differenceMinor;
      t.checkedActualMinor += c.check.actualMinor;
      t.checkedExpectedMinor += c.check.expectedMinor;
      if (c.check.differenceMinor === 0) t.matching++;
      else t.off.push({ name: c.account.name, differenceMinor: c.check.differenceMinor });
    }
  }
  return t;
}

export async function loadAccounts(
  db: SQLiteDatabase,
  requestedMonth: string,
  today: string = todayYmd(),
): Promise<AccountsData> {
  const [months, currency, accounts] = await Promise.all([listMonths(db, today), getCurrency(db), listAccounts(db)]);
  // "All time" doesn't make sense for balances, so it falls back to the latest month.
  const month = requestedMonth !== 'all' && months.includes(requestedMonth) ? requestedMonth : months[months.length - 1];
  const isCurrentMonth = month === monthKey(today);
  const periodStart = `${month}-01`;
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const periodEnd = isCurrentMonth ? today : lastDay; // for the current month, "now"

  const cards: AccountCard[] = [];
  for (const account of accounts) {
    const period = await getAccountPeriod(db, account, periodStart, periodEnd);
    let check: CheckResult | null = null;
    if (isTracked(account)) {
      const latest = await getLatestCheck(db, account, periodEnd);
      if (latest && latest.date >= periodStart) check = latest;
    }
    cards.push({ account, period, check });
  }
  const transfers = await listTransfers(db, { month });
  return { months, month, currency, periodStart, periodEnd, isCurrentMonth, cards, tally: composeTally(cards), transfers };
}

// ---- Wording ---------------------------------------------------------------------

// What a balance check's difference means, in plain English.
// The difference is "what your bank shows" minus "what your records say".
export function describeDifference(differenceMinor: number, money: (minor: number) => string): string {
  if (differenceMinor === 0) return 'Matches your records.';
  if (differenceMinor < 0) {
    return `${money(-differenceMinor)} less than your records say. Money went out that isn’t recorded.`;
  }
  return `${money(differenceMinor)} more than your records say. Money came in that isn’t recorded.`;
}

// The lines shown under the tally about how it compares with your bank.
// When every tracked account has been checked, the total comes first. A matching total can hide
// two mistakes that cancel out, so any account that is off is always listed too.
export function checkSummary(tally: Tally, money: (minor: number) => string): { good: boolean; lines: string[] } {
  if (tally.checked === 0) {
    return { good: false, lines: ['Check a balance against your bank to confirm this total.'] };
  }
  const unchecked = tally.tracked - tally.checked;
  const note = unchecked > 0 ? ` ${unchecked} not checked yet.` : '';
  const allChecked = unchecked === 0;

  if (tally.off.length === 0) {
    const text =
      tally.checked === 1
        ? 'The checked account matches your bank.'
        : allChecked
          ? `All ${tally.checked} accounts match your bank, adding up to ${money(tally.checkedActualMinor)}.`
          : `All ${tally.checked} checked accounts match your bank.`;
    return { good: true, lines: [`✓ ${text}${note}`] };
  }

  const lines: string[] = [];
  if (allChecked && tally.checked > 1) {
    lines.push(
      tally.differenceMinor === 0
        ? `Your accounts add up to ${money(tally.checkedActualMinor)}, which matches your records. But individual accounts are off:`
        : `Together your accounts show ${money(tally.checkedActualMinor)}, and your records say ${money(tally.checkedExpectedMinor)}. ${describeDifference(tally.differenceMinor, money)}`,
    );
  }
  for (const o of tally.off) lines.push(`${o.name}: ${describeDifference(o.differenceMinor, money)}`);
  if (note) lines.push(note.trim());
  return { good: false, lines };
}
