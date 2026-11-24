import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';

import { LockGate } from '@/components/LockGate';
import { Loading } from '@/components/Loading';
import { migrate } from '@/db';
import { AppLockProvider } from '@/state/AppLockContext';
import { MonthProvider } from '@/state/MonthContext';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;

  // Tell the navigation system to use our colours.
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.ink,
      border: colors.line,
      primary: colors.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Suspense fallback={<Loading />}>
        {/* Opens (or creates) the database file on the phone, then runs migrate() */}
        <SQLiteProvider databaseName="entechilav.db" onInit={migrate} useSuspense>
          <AppLockProvider>
            {/* Covers everything with a lock screen when the app lock is on */}
            <LockGate>
              <MonthProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  {/* The add/edit form slides up over the tabs */}
                  <Stack.Screen
                    name="transaction"
                    options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                  />
                </Stack>
              </MonthProvider>
            </LockGate>
          </AppLockProvider>
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}
