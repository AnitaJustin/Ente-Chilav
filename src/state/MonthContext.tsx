import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { monthKey, todayYmd } from '@/db';

type MonthState = {
  month: string; // 'YYYY-MM' or 'all'
  setMonth: (month: string) => void;
};

const MonthContext = createContext<MonthState | null>(null);

// Remembers which month you're looking at, so Overview and Transactions stay in step.
export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(monthKey(todayYmd()));
  const value = useMemo(() => ({ month, setMonth }), [month]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthState {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth must be used inside <MonthProvider>');
  return ctx;
}
