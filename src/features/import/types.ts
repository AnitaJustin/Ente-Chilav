// What the phone's text reader gives us for a screenshot, and what we make of it.

import type { TxType } from '../../db/types';

// One line of text found on the screenshot, with where it sits (in pixels).
export type OcrLine = { text: string; x: number; y: number; width: number; height: number };
export type ImageSize = { width: number; height: number };

export type ParsedRow = {
  key: string; // identifies the row within one screenshot
  name: string;
  amountMinor: number;
  type: TxType;
  date: string | null; // YYYY-MM-DD, or null if the screenshot didn't say
  dateFrom: 'row' | 'heading' | null;
  uncertainDirection: boolean; // nothing said whether this was money in or out, so we guessed "out"
  pending: boolean;
  amountText: string; // the digits as read, e.g. "1,250"
  repairedFrom?: string | null; // set when a stray digit (the ₹ sign misread) was removed: what was originally read
  raw: string; // everything the screen said for this row, to help you check it
};

export type SkippedLine = { reason: string; text: string };

export type ParseResult = {
  rows: ParsedRow[];
  skipped: SkippedLine[]; // things we deliberately left out: balances, failed payments, offers...
};
