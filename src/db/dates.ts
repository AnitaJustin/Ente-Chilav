// Dates are stored as plain "YYYY-MM-DD" text, in your own local time zone.
// Months are "YYYY-MM". Names are spelled out here (instead of using the phone's
// language settings) so they look the same on every phone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y, m, d];
}

export function todayYmd(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

// True only for real calendar dates ("2026-02-30" is rejected).
export function isValidYmd(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = parts(text);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// shiftMonth('2026-11', -1) -> '2026-10'
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// monthsBetween('2026-09', '2026-11') -> ['2026-09', '2026-10', '2026-11']
export function monthsBetween(from: string, to: string): string[] {
  if (from > to) return [to];
  const out: string[] = [];
  let m = from;
  while (m <= to && out.length < 1200) {
    out.push(m);
    m = shiftMonth(m, 1);
  }
  return out;
}

// addDays('2026-03-01', -1) -> '2026-02-28'
export function addDays(ymd: string, delta: number): string {
  const [y, m, d] = parts(ymd);
  return todayYmd(new Date(y, m - 1, d + delta));
}

// 'November 2026'
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// 'Nov'
export function monthShortLabel(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3);
}

// 'Sat, 21 Nov'
export function dayLabel(ymd: string): string {
  const [y, m, d] = parts(ymd);
  const wd = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS[wd]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

// 'Sat, 21 Nov 2026'
export function longDateLabel(ymd: string): string {
  return `${dayLabel(ymd)} ${parts(ymd)[0]}`;
}
