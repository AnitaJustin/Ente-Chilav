// The shapes of the data we store. Everything else in the app uses these.

export type CategoryKind = 'expense' | 'income' | 'ignore';
export type TxType = 'debit' | 'credit'; // debit = money out, credit = money in
export type TxSource = 'manual' | 'screenshot' | 'sample';

export type Category = {
  id: number;
  name: string;
  color: string;
  kind: CategoryKind;
  isDefault: boolean; // built-in categories can't be renamed or deleted
  isHidden: boolean; // hidden categories don't show in pickers, but old transactions keep them
};

export type AccountKind = 'bank' | 'cash';

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  color: string;
  // The balance on `openingDate` (before that day's transactions), in paise/cents.
  // Both are null when you don't track this account's balance.
  openingBalanceMinor: number | null;
  openingDate: string | null;
  isSavings: boolean; // an RD, FD or similar: money moved into it counts as saved
  sortOrder: number;
};

// What you provide when adding a transaction.
export type TransactionInput = {
  date: string; // YYYY-MM-DD
  description: string; // merchant or person
  amountMinor: number; // whole paise/cents, always positive. 250.50 is stored as 25050
  type: TxType;
  categoryId: number;
  accountId?: number; // leave out to use your first account
  note?: string;
  source?: TxSource;
};

// What you get back: the transaction plus its category's details.
export type TransactionRow = {
  id: number;
  date: string;
  description: string;
  amountMinor: number;
  type: TxType;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryKind: CategoryKind;
  accountId: number;
  accountName: string;
  accountColor: string;
  transferId: number | null; // set when this is one half of a transfer between accounts
  note: string;
  source: TxSource;
  createdAt: number;
};

export type TransactionFilter = {
  month?: string; // 'YYYY-MM'. Leave out for all time.
  categoryId?: number;
  accountId?: number;
  type?: TxType;
  search?: string; // matches description, note and category name
  limit?: number;
  includeTransfers?: boolean; // moves between your own accounts are left out unless you ask for them
};

// One move of money between two of your accounts (shown once, not as two transactions).
export type TransferRow = {
  transferId: number;
  date: string;
  amountMinor: number;
  fromAccountId: number;
  fromName: string;
  toAccountId: number;
  toName: string;
  note: string;
};

export type Totals = {
  inflowMinor: number;
  outflowMinor: number;
  count: number;
};

export type MonthTotals = {
  month: string; // 'YYYY-MM'
  inflowMinor: number;
  outflowMinor: number;
};
