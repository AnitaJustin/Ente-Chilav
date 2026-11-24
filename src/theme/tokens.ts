// Colours, spacing and corner sizes used across the whole app.
// Change a value here and every screen updates.

export type Palette = {
  bg: string; // screen background
  surface: string; // cards and the tab bar
  surface2: string; // subtle fills inside cards
  ink: string; // main text
  ink2: string; // body text
  ink3: string; // hints and captions
  line: string; // borders and dividers
  accent: string; // buttons, active tab, links
  accentSoft: string;
  accentInk: string; // text on top of the accent colour
  income: string; // money in
  incomeSoft: string;
  expense: string; // money out
  expenseSoft: string;
  warn: string;
  savings: string; // money moved into savings accounts (RD, FD...), in the Overview's bar // nearing a budget
};

export const light: Palette = {
  bg: '#EBE7DD', // the same cream as the logo and the splash screen
  surface: '#FDFCF9',
  surface2: '#F2EFE6',
  ink: '#16251F',
  ink2: '#44534B',
  ink3: '#5D6A63',
  line: '#D8D3C5',
  accent: '#1F5A4A', // the logo's deep green
  accentSoft: '#D6E6DC',
  accentInk: '#FFFFFF',
  income: '#136C52',
  incomeSoft: '#D5EBDF',
  expense: '#AF342F',
  expenseSoft: '#F4DAD6',
  warn: '#945F00',
  savings: '#2E86AB',
};

export const dark: Palette = {
  bg: '#060b09',
  surface: '#02130c',
  surface2: '#1F2E27',
  ink: '#E8F0EA',
  ink2: '#B3C1B8',
  ink3: '#8A9B91',
  line: '#2C3D35',
  accent: '#aba44d',
  accentSoft: '#1E3A2E',
  accentInk: '#0F1814',
  income: '#aba44d',
  incomeSoft: '#16372A',
  expense: '#F28B84',
  expenseSoft: '#3B2220',
  warn: '#E6B450',
  savings: '#6CB7D9',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
