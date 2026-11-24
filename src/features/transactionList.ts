// The logic behind the Transactions list, kept separate so it can be tested.

import type { TransactionRow } from '../db/types';

export type DaySection = {
  date: string;
  netMinor: number; // money in minus money out for the day (ignored categories excluded)
  data: TransactionRow[];
};

// Groups rows (already sorted newest first) into one section per day.
export function groupByDate(rows: TransactionRow[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const row of rows) {
    let section = sections[sections.length - 1];
    if (!section || section.date !== row.date) {
      section = { date: row.date, netMinor: 0, data: [] };
      sections.push(section);
    }
    section.data.push(row);
    if (row.categoryKind !== 'ignore') {
      section.netMinor += row.type === 'credit' ? row.amountMinor : -row.amountMinor;
    }
  }
  return sections;
}

export function summarize(rows: TransactionRow[]) {
  let inflowMinor = 0;
  let outflowMinor = 0;
  for (const row of rows) {
    if (row.categoryKind === 'ignore') continue;
    if (row.type === 'credit') inflowMinor += row.amountMinor;
    else outflowMinor += row.amountMinor;
  }
  return { inflowMinor, outflowMinor, count: rows.length };
}
