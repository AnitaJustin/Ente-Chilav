import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Fab } from '@/components/Fab';
import { MonthStepper } from '@/components/MonthStepper';
import { Segmented } from '@/components/Segmented';
import { TransactionRow } from '@/components/TransactionRow';
import {
  countTransactions,
  dayLabel,
  formatMoney,
  getCurrency,
  listAccounts,
  listCategories,
  listMonths,
  listTransactions,
  monthKey,
  todayYmd,
  type Account,
  type Category,
  type CurrencyCode,
  type TransactionRow as Row,
  type TxType,
} from '@/db';
import { groupByDate, summarize } from '@/features/transactionList';
import { radius, spacing } from '@/theme/tokens';
import { useMonth } from '@/state/MonthContext';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

type TypeFilter = 'all' | TxType;

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();

  const [months, setMonths] = useState<string[]>([monthKey(todayYmd())]);
  const { month, setMonth } = useMonth(); // 'YYYY-MM' or 'all', shared with Overview
  const params = useLocalSearchParams<{ categoryId?: string; nonce?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState(''); // searchText after a short pause in typing
  const [rows, setRows] = useState<Row[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const latestRequest = useRef(0);

  // Tapping a category on Overview sends us here with that category already selected.
  useEffect(() => {
    if (!params.nonce) return;
    setCategoryId(params.categoryId ? Number(params.categoryId) : null);
    setTypeFilter('debit');
    setSearchText('');
    setSearch('');
  }, [params.nonce, params.categoryId]);

  // Wait 250ms after the last keystroke before searching.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(async () => {
    const mine = ++latestRequest.current;
    const [ms, cats, cur, count, accountList] = await Promise.all([
      listMonths(db),
      listCategories(db),
      getCurrency(db),
      countTransactions(db),
      listAccounts(db),
    ]);
    // If the chosen month no longer exists (e.g. its data was removed), jump to the latest.
    const effective = month === 'all' || ms.includes(month) ? month : ms[ms.length - 1];
    const list = await listTransactions(db, {
      month: effective === 'all' ? undefined : effective,
      categoryId: categoryId ?? undefined,
      accountId: accountId ?? undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
      search,
    });
    if (mine !== latestRequest.current) return; // a newer search has already started
    setMonths(ms);
    setCategories(cats);
    setAccounts(accountList);
    setCurrency(cur);
    setTotalCount(count);
    if (effective !== month) setMonth(effective);
    setRows(list);
    setLoaded(true);
  }, [db, month, categoryId, accountId, typeFilter, search]);

  // Reload whenever the filters change, and whenever this tab comes back into view
  // (for example after adding a transaction).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sections = useMemo(() => groupByDate(rows), [rows]);
  const summary = useMemo(() => summarize(rows), [rows]);

  function clearFilters() {
    setCategoryId(null);
    setAccountId(null);
    setTypeFilter('all');
    setSearchText('');
    setSearch('');
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="title">Transactions</AppText>
        <Pressable
          onPress={() => router.push('/import')}
          accessibilityRole="button"
          accessibilityLabel="Add from screenshots"
          style={[styles.importBtn, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Ionicons name="images-outline" size={18} color={colors.accent} />
          <AppText variant="bodyBold" tone="accent" style={styles.importText}>
            From screenshots
          </AppText>
        </Pressable>
      </View>
      <MonthStepper months={months} value={month} onChange={setMonth} />

      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Ionicons name="search" size={18} color={colors.ink3} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search merchant, note or category"
          placeholderTextColor={colors.ink3}
          style={[styles.searchInput, { color: colors.ink }]}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search transactions"
        />
        {searchText ? (
          <Ionicons
            name="close-circle"
            size={20}
            color={colors.ink3}
            onPress={() => {
              setSearchText('');
              setSearch('');
            }}
            accessibilityLabel="Clear search"
          />
        ) : null}
      </View>

      <Segmented<TypeFilter>
        options={[
          { value: 'all', label: 'All' },
          { value: 'debit', label: 'Money out' },
          { value: 'credit', label: 'Money in' },
        ]}
        value={typeFilter}
        onChange={setTypeFilter}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}>
        <Chip label="All categories" selected={categoryId === null} onPress={() => setCategoryId(null)} />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            dotColor={c.color}
            selected={categoryId === c.id}
            onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>

      {accounts.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}>
          <Chip label="All accounts" selected={accountId === null} onPress={() => setAccountId(null)} />
          {accounts.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              dotColor={a.color}
              selected={accountId === a.id}
              onPress={() => setAccountId(accountId === a.id ? null : a.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {loaded && rows.length > 0 ? (
        <AppText variant="caption">
          {summary.count} transaction{summary.count === 1 ? '' : 's'} · in{' '}
          {formatMoney(summary.inflowMinor, currency)} · out {formatMoney(summary.outflowMinor, currency)}
        </AppText>
      ) : null}
    </View>
  );

  const empty = !loaded ? undefined : totalCount === 0 ? (
    <View style={styles.empty}>
      <AppText variant="heading">No transactions yet</AppText>
      <AppText style={styles.centered}>
        Add your first one with the + button, and it will show up here.
      </AppText>
      <Button label="Add a transaction" onPress={() => router.push('/transaction')} />
      <Button label="Add from screenshots" variant="secondary" onPress={() => router.push('/import')} />
    </View>
  ) : (
    <View style={styles.empty}>
      <AppText variant="heading">Nothing matches</AppText>
      <AppText style={styles.centered}>Try another month or remove some filters.</AppText>
      <Button label="Clear filters" variant="secondary" onPress={clearFilters} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        initialNumToRender={20}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHead}>
            <AppText variant="caption" style={styles.dayText}>
              {dayLabel(section.date)}
            </AppText>
            <AppText variant="caption">
              {section.netMinor >= 0 ? '+' : '−'}
              {formatMoney(Math.abs(section.netMinor), currency)}
            </AppText>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <TransactionRow
            row={item}
            currency={currency}
            first={index === 0}
            last={index === section.data.length - 1}
            showAccount={accounts.length > 1}
            onPress={() => router.push({ pathname: '/transaction', params: { id: String(item.id) } })}
          />
        )}
      />
      <Fab label="Add transaction" onPress={() => router.push('/transaction')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  header: { gap: spacing.md - 4, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm + 4, paddingVertical: 7 },
  importText: { fontSize: fs(13) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 2,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: fs(15), paddingVertical: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  dayText: { fontWeight: '700' },
  empty: { alignItems: 'center', gap: spacing.md - 4, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  centered: { textAlign: 'center' },
});
