import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { AppLockCard } from '@/components/AppLockCard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import {
  countTransactions,
  CURRENCIES,
  CURRENCY_ORDER,
  getCurrency,
  listBudgets,
  listCategories,
  setCurrency,
  type CurrencyCode,
} from '@/db';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Summary = { budgets: number; categories: number; mine: number; hidden: number; transactions: number };

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isDark } = useTheme();
  const [currency, setCurrencyState] = useState<CurrencyCode>('INR');
  const [summary, setSummary] = useState<Summary | null>(null);

  const refresh = useCallback(async () => {
    const [cur, budgets, categories, transactions] = await Promise.all([
      getCurrency(db),
      listBudgets(db),
      listCategories(db, { includeHidden: true }),
      countTransactions(db),
    ]);
    setCurrencyState(cur);
    setSummary({
      budgets: budgets.length,
      categories: categories.length,
      mine: categories.filter((c) => !c.isDefault).length,
      hidden: categories.filter((c) => c.isHidden).length,
      transactions,
    });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function apply(code: CurrencyCode) {
    await setCurrency(db, code);
    await refresh();
  }

  function pickCurrency(code: CurrencyCode) {
    if (code === currency) return;
    if (!summary || summary.transactions === 0) {
      apply(code);
      return;
    }
    // Existing amounts are only relabelled, never converted, so make sure that's understood.
    Alert.alert(
      `Switch to ${CURRENCIES[code].name}s?`,
      'This only changes the currency symbol and number style. The amounts you’ve already entered stay exactly as they are and are not converted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => apply(code) },
      ],
    );
  }

  return (
    <Screen title="Settings" subtitle="Make the app yours">
      <Card>
        <AppText variant="heading">Currency</AppText>
        <View style={styles.chips}>
          {CURRENCY_ORDER.map((code) => (
            <Chip
              key={code}
              label={`${CURRENCIES[code].symbol} ${code}`}
              selected={code === currency}
              onPress={() => pickCurrency(code)}
            />
          ))}
        </View>
        <AppText variant="caption">
          Showing amounts in {CURRENCIES[currency].name}s. Switching only changes the symbol; nothing is converted.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Monthly budgets</AppText>
        <AppText>
          {summary && summary.budgets > 0
            ? `You have ${summary.budgets} budget${summary.budgets === 1 ? '' : 's'} set. The Overview shows how much of each you’ve used.`
            : 'Set a monthly limit for the categories you want to keep an eye on, and the Overview will show how much of each you’ve used.'}
        </AppText>
        <Button label="Set monthly budgets" onPress={() => router.push('/budgets')} />
      </Card>

      <Card>
        <AppText variant="heading">Categories</AppText>
        <AppText>
          {summary
            ? `${summary.categories} categories, ${summary.mine} of your own${summary.hidden ? `, ${summary.hidden} hidden` : ''}. Add your own, change colours, or hide the ones you never use.`
            : 'Add your own, change colours, or hide the ones you never use.'}
        </AppText>
        <Button label="Manage categories" onPress={() => router.push('/categories')} />
      </Card>

      <Card>
        <AppText variant="heading">Remembered merchants</AppText>
        <AppText>
          When you add transactions from screenshots, the app remembers which category you chose for each merchant. See them here, or
          make it forget one.
        </AppText>
        <Button label="See remembered merchants" onPress={() => router.push('/rules')} />
      </Card>

      <Card>
        <AppText variant="heading">Backup & export</AppText>
        <AppText>
          Save a spreadsheet of your transactions, make a backup file, or restore from one. A backup is the
          way to move your data to a new phone.
        </AppText>
        <Button label="Open backup & export" onPress={() => router.push('/backup')} />
      </Card>

      <AppLockCard />

      <Card>
        <AppText variant="heading">Appearance</AppText>
        <AppText>
          The app follows your phone’s light or dark setting. Right now it is in{' '}
          <AppText variant="bodyBold">{isDark ? 'dark' : 'light'}</AppText> mode.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
