import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import {
  addDays,
  addTransaction,
  CURRENCIES,
  deleteTransaction,
  formatMoney,
  getCurrency,
  getSetting,
  getTransaction,
  isValidYmd,
  listAccounts,
  listCategories,
  longDateLabel,
  parseAmount,
  todayYmd,
  setSetting,
  updateTransaction,
  type Account,
  type Category,
  type CurrencyCode,
  type TxType,
} from '@/db';
import {
  buildInput,
  categoriesForType,
  defaultCategoryFor,
  minorToInputText,
  sanitizeAmountText,
} from '@/features/transactionForm';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { spacing } from '@/theme/tokens';
import { fs } from '@/theme/typography';
import { useTheme } from '@/theme/useTheme';

export default function TransactionFormScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    accountId?: string; // the next few can pre-fill a new transaction, e.g. from a balance check
    type?: string;
    amountMinor?: string;
    date?: string;
    description?: string;
    note?: string;
  }>();
  const { id } = params;
  const editingId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('INR');

  const [type, setType] = useState<TxType>('debit');
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [transferHalf, setTransferHalf] = useState<string | null>(null); // set when this is one half of a transfer
  const [note, setNote] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load categories and currency, and fill in the form if we're editing.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cats, cur, accountList] = await Promise.all([
        listCategories(db, { includeHidden: true }),
        getCurrency(db),
        listAccounts(db),
      ]);
      if (!alive) return;
      setAllCategories(cats);
      setCurrency(cur);
      setAccounts(accountList);
      if (editingId != null) {
        const t = await getTransaction(db, editingId);
        if (!alive) return;
        if (!t) {
          setMissing(true);
        } else {
          setType(t.type);
          setAmountText(minorToInputText(t.amountMinor));
          setDescription(t.description);
          setDate(t.date);
          setCategoryId(t.categoryId);
          setNote(t.note);
          setAccountId(t.accountId);
          if (t.transferId !== null) setTransferHalf(t.description);
        }
      } else {
        // A new transaction: start from anything passed in, otherwise the account used last time.
        const visible = cats.filter((c) => !c.isHidden);
        const startType = params.type === 'credit' ? 'credit' : 'debit';
        setType(startType);
        setCategoryId(defaultCategoryFor(visible, startType));
        if (params.amountMinor && /^\d+$/.test(params.amountMinor) && Number(params.amountMinor) > 0) {
          setAmountText(minorToInputText(Number(params.amountMinor)));
        }
        if (params.date && isValidYmd(params.date)) setDate(params.date);
        if (params.description) setDescription(params.description.slice(0, 80));
        if (params.note) setNote(params.note.slice(0, 120));
        const wanted = params.accountId ? Number(params.accountId) : null;
        const last = Number(await getSetting(db, 'last_account_id'));
        const valid = (n: number | null) => n !== null && accountList.some((a) => a.id === n);
        setAccountId(valid(wanted) ? wanted : valid(last) ? last : (accountList[0]?.id ?? null));
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db, editingId]);

  // Hidden categories are left out, unless this transaction already uses one.
  const categories = allCategories.filter((c) => !c.isHidden || c.id === categoryId);

  function changeType(next: TxType) {
    setType(next);
    // If the chosen category doesn't fit the new direction, switch to a sensible default.
    const allowed = categoriesForType(categories, next);
    if (!allowed.some((c) => c.id === categoryId)) setCategoryId(defaultCategoryFor(categories, next));
  }

  function pickDate() {
    if (Platform.OS !== 'android') return;
    const [y, m, d] = date.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d),
      mode: 'date',
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) setDate(todayYmd(selected));
      },
    });
  }

  async function save() {
    if (saving) return;
    const result = buildInput({ type, amountText, description, date, categoryId, note });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      const input = { ...result.input, accountId: accountId ?? undefined };
      if (editingId != null) await updateTransaction(db, editingId, input);
      else {
        await addTransaction(db, input);
        if (accountId !== null) await setSetting(db, 'last_account_id', String(accountId)); // remember it for next time
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (editingId == null) return;
    const minor = parseAmount(amountText);
    const isTransfer = transferHalf !== null;
    Alert.alert(
      isTransfer ? 'Delete this transfer?' : 'Delete this transaction?',
      isTransfer
        ? `${description}${minor ? ' · ' + formatMoney(minor, currency) : ''}\n\nBoth sides of the transfer will be removed, so your two accounts stay in step.`
        : `${description}${minor ? ' · ' + formatMoney(minor, currency) : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(db, editingId);
            router.back();
          },
        },
      ],
    );
  }

  const today = todayYmd();
  const yesterday = addDays(today, -1);
  const shownCategories = categoriesForType(categories, type);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.topBar}>
        <AppText variant="heading">{editingId != null ? 'Edit transaction' : 'Add transaction'}</AppText>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <AppText variant="caption">Loading…</AppText>
        </View>
      ) : missing ? (
        <View style={styles.center}>
          <AppText variant="heading">Transaction not found</AppText>
          <AppText>It may have been deleted.</AppText>
          <Button label="Go back" onPress={() => router.back()} />
        </View>
      ) : transferHalf !== null ? (
        <ScrollView contentContainerStyle={styles.form}>
          <View style={[styles.errorBox, { backgroundColor: colors.surface2 }]}>
            <AppText variant="bodyBold">{transferHalf}</AppText>
            <AppText variant="caption">
              {formatMoney(parseAmount(amountText) ?? 0, currency)} on {longDateLabel(date)}
              {accounts.find((a) => a.id === accountId) ? ` · ${accounts.find((a) => a.id === accountId)?.name}` : ''}
            </AppText>
          </View>
          <AppText>
            This is one half of a transfer between your accounts, so it can’t be edited on its own. To change it, delete
            the transfer and add it again with Move money on the Accounts tab.
          </AppText>
          <Button label="Delete transfer" variant="danger" onPress={confirmDelete} />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.form, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <Segmented<TxType>
            options={[
              { value: 'debit', label: 'Money out' },
              { value: 'credit', label: 'Money in' },
            ]}
            value={type}
            onChange={changeType}
          />

          <TextField
            label="Amount"
            prefix={CURRENCIES[currency].symbol}
            value={amountText}
            onChangeText={(t) => {
              setAmountText(sanitizeAmountText(t));
              setError(null);
            }}
            placeholder="0"
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus={editingId == null}
            style={styles.amountInput}
          />

          <TextField
            label={type === 'debit' ? 'Paid to' : 'Received from'}
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              setError(null);
            }}
            placeholder={type === 'debit' ? 'e.g. Swiggy, Rent, Rohan' : 'e.g. Salary, Refund, Priya'}
            maxLength={80}
            autoCapitalize="words"
          />

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Date
            </AppText>
            <AppText variant="bodyBold">{longDateLabel(date)}</AppText>
            <View style={styles.wrap}>
              <Chip label="Today" selected={date === today} onPress={() => setDate(today)} />
              <Chip label="Yesterday" selected={date === yesterday} onPress={() => setDate(yesterday)} />
              <Chip label="Pick a date" onPress={pickDate} />
            </View>
          </View>

          {accounts.length > 1 ? (
            <View style={styles.block}>
              <AppText variant="caption" style={styles.label}>
                Account
              </AppText>
              <View style={styles.wrap}>
                {accounts.map((a) => (
                  <Chip key={a.id} label={a.name} dotColor={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Category
            </AppText>
            <View style={styles.wrap}>
              {shownCategories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  dotColor={c.color}
                  selected={categoryId === c.id}
                  onPress={() => {
                    setCategoryId(c.id);
                    setError(null);
                  }}
                />
              ))}
            </View>
          </View>

          <TextField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. birthday dinner"
            maxLength={120}
          />

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}

          <Button label={saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add transaction'} onPress={save} disabled={saving} />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
          {editingId != null ? <Button label="Delete transaction" variant="danger" onPress={confirmDelete} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  form: { padding: spacing.md, gap: spacing.md },
  block: { gap: spacing.sm },
  label: { fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amountInput: { fontSize: fs(22), fontWeight: '700' },
  errorBox: { padding: spacing.md - 4, borderRadius: 12 },
});
