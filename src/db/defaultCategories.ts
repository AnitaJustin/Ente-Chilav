import type { CategoryKind } from './types';

// The categories every new database starts with.
// "ignore" categories (like moving money between your own accounts)
// are left out of all spending and income totals.
export const DEFAULT_CATEGORIES: { name: string; color: string; kind: CategoryKind }[] = [
  { name: 'Food & Dining', color: '#E8743B', kind: 'expense' },
  { name: 'Groceries', color: '#86B33E', kind: 'expense' },
  { name: 'Transport', color: '#3D8FD9', kind: 'expense' },
  { name: 'Shopping', color: '#C45AB3', kind: 'expense' },
  { name: 'Bills & Utilities', color: '#5B6FD8', kind: 'expense' },
  { name: 'Rent & Home', color: '#7A5AC8', kind: 'expense' },
  { name: 'Entertainment', color: '#E2557A', kind: 'expense' },
  { name: 'Health', color: '#2BA58E', kind: 'expense' },
  { name: 'Travel', color: '#17A2B8', kind: 'expense' },
  { name: 'Education', color: '#D9A62E', kind: 'expense' },
  { name: 'Subscriptions', color: '#9A6FB0', kind: 'expense' },
  { name: 'Investments', color: '#1F7A5C', kind: 'expense' },
  { name: 'Sent to people', color: '#7D8CA3', kind: 'expense' },
  { name: 'Cash withdrawal', color: '#A0845C', kind: 'expense' },
  { name: 'Other expense', color: '#98A2B3', kind: 'expense' },
  { name: 'Salary', color: '#12906A', kind: 'income' },
  { name: 'Other income', color: '#4CC38A', kind: 'income' },
  { name: 'Self transfer', color: '#B8C0CC', kind: 'ignore' },
];
