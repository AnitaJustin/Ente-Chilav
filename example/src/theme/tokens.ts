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
  warn: string; // nearing a budget
};

export const light: Palette = {
  bg: '#EBEFF4',
  surface: '#FFFFFF',
  surface2: '#F4F6F9',
  ink: '#0D1B2A',
  ink2: '#46566A',
  ink3: '#8391A5',
  line: '#DCE2EA',
  accent: '#2D4BDB',
  accentSoft: '#E3E8FC',
  accentInk: '#FFFFFF',
  income: '#0F8A63',
  incomeSoft: '#DDF3EA',
  expense: '#D1403C',
  expenseSoft: '#FBE4E3',
  warn: '#C98A12',
};

export const dark: Palette = {
  bg: '#0A111D',
  surface: '#121C2D',
  surface2: '#182438',
  ink: '#EAF0F8',
  ink2: '#A9B7CA',
  ink3: '#71829A',
  line: '#233248',
  accent: '#7C93FF',
  accentSoft: '#1E2A52',
  accentInk: '#0A111D',
  income: '#3FCB9A',
  incomeSoft: '#12332B',
  expense: '#FF7B76',
  expenseSoft: '#3A1E21',
  warn: '#E8B04A',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
