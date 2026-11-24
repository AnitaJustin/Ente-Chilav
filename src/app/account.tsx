import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ColorSwatches } from '@/components/ColorSwatches';
import { DateField } from '@/components/DateField';
import { ModalHeader } from '@/components/ModalHeader';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import {
  addAccount,
  CURRENCIES,
  countTransactionsInAccount,
  deleteAccount,
  getAccount,
  getCurrency,
  listAccounts,
  MAX_ACCOUNT_NAME,
  parseAmount,
  todayYmd,
  updateAccount,
  type Account,
  type AccountKind,
  type CurrencyCode,
} from '@/db';
import { minorToInputText, sanitizeAmountText } from '@/features/transactionForm';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { CATEGORY_COLORS } from '@/theme/categoryColors';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function AccountFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [others, setOthers] = useState<Account[]>([]); // the other accounts, for moving transactions on delete
  const [txCount, setTxCount] = useState(0);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [isSavings, setIsSavings] = useState(false);
  const [color, setColor] = useState(CATEGORY_COLORS[7]);
  const [track, setTrack] = useState(true);
  const [balanceText, setBalanceText] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [moveTo, setMoveTo] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cur, all] = await Promise.all([getCurrency(db), listAccounts(db)]);
      if (!alive) return;
      setCurrency(cur);
      if (editingId == null) {
        setColor(CATEGORY_COLORS[(7 + all.length * 3) % CATEGORY_COLORS.length]); // a different starting colour each time
      } else {
        const account = await getAccount(db, editingId);
        if (!alive) return;
        if (!account) {
          setMissing(true);
        } else {
          const n = await countTransactionsInAccount(db, editingId);
          if (!alive) return;
          const rest = all.filter((a) => a.id !== editingId);
          setOthers(rest);
          setMoveTo(rest.length ? rest[0].id : null);
          setTxCount(n);
          setName(account.name);
          setKind(account.kind);
          setIsSavings(account.isSavings);
          setColor(account.color);
          setTrack(account.openingBalanceMinor !== null);
          if (account.openingBalanceMinor !== null) setBalanceText(minorToInputText(account.openingBalanceMinor));
          if (account.openingDate) setDate(account.openingDate);
        }
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db, editingId]);

  async function save() {
    if (saving) return;
    let openingBalanceMinor: number | null = null;
    let openingDate: string | null = null;
    if (track) {
      const minor = parseAmount(balanceText);
      if (minor === null) {
        setError('Enter the opening balance, like 10000 or 2500.50. Or switch tracking off.');
        return;
      }
      openingBalanceMinor = minor;
      openingDate = date;
    }
    setSaving(true);
    try {
      if (editingId == null) await addAccount(db, { name, kind, color, openingBalanceMinor, openingDate, isSavings });
      else await updateAccount(db, editingId, { name, kind, color, openingBalanceMinor, openingDate, isSavings });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (editingId == null) return;
    const target = others.find((a) => a.id === moveTo);
    Alert.alert(
      `Delete “${name}”?`,
      txCount > 0
        ? `Its ${txCount} transaction${txCount === 1 ? '' : 's'} will move to “${target?.name}”. Balance checks for this account are removed.`
        : 'This account has no transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(db, editingId, moveTo ?? undefined);
              router.back();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete.');
            }
          },
        },
      ],
    );
  }

  const monthStart = `${todayYmd().slice(0, 7)}-01`;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ModalHeader title={editingId != null ? 'Edit account' : 'New account'} />
      {loading ? (
        <View style={styles.center}>
          <AppText variant="caption">Loading…</AppText>
        </View>
      ) : missing ? (
        <View style={styles.center}>
          <AppText variant="heading">Account not found</AppText>
          <Button label="Go back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.form, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <TextField
            label="Name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="e.g. HDFC Savings, Cash in hand"
            maxLength={MAX_ACCOUNT_NAME}
            autoFocus={editingId == null}
            autoCapitalize="words"
          />

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Type
            </AppText>
            <Segmented<AccountKind>
              options={[
                { value: 'bank', label: 'Bank account' },
                { value: 'cash', label: 'Cash' },
              ]}
              value={kind}
              onChange={(k) => {
                setKind(k);
                if (k === 'cash') setIsSavings(false); // cash can't be a savings account
              }}
            />
          </View>

          {kind === 'bank' ? (
            <View style={styles.block}>
              <AppText variant="caption" style={styles.label}>
                Use
              </AppText>
              <View style={styles.row}>
                <Chip label="Everyday" selected={!isSavings} onPress={() => setIsSavings(false)} />
                <Chip label="Savings (RD, FD, PPF…)" selected={isSavings} onPress={() => setIsSavings(true)} />
              </View>
              <AppText variant="caption">
                {isSavings
                  ? 'Money you move into this account counts as saved in your Overview, and money you take out is shown as taken from savings.'
                  : 'A normal account for everyday money.'}
              </AppText>
            </View>
          ) : null}

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Colour
            </AppText>
            <ColorSwatches value={color} onChange={setColor} />
          </View>

          <View style={styles.block}>
            <AppText variant="caption" style={styles.label}>
              Balance
            </AppText>
            <View style={styles.row}>
              <Chip label="Track the balance" selected={track} onPress={() => { setTrack(true); setError(null); }} />
              <Chip label="Don’t track" selected={!track} onPress={() => { setTrack(false); setError(null); }} />
            </View>
            <AppText variant="caption">
              {track
                ? 'The app works out this account’s balance from your transactions, and you can check it against your bank.'
                : 'Transactions can still belong to this account; its balance just won’t be shown.'}
            </AppText>
          </View>

          {track ? (
            <>
              <TextField
                label="Opening balance"
                prefix={CURRENCIES[currency].symbol}
                value={balanceText}
                onChangeText={(t) => {
                  setBalanceText(sanitizeAmountText(t));
                  setError(null);
                }}
                placeholder="0"
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
              <DateField
                label="Balance as of"
                value={date}
                onChange={setDate}
                extras={[{ label: 'Start of this month', value: monthStart }]}
              />
              <AppText variant="caption">
                For example, if your bank showed 10,000 on the morning of 1 November, enter 10000 and 1 Nov. Transactions
                from that date onward are counted.
              </AppText>
            </>
          ) : null}

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.expenseSoft }]}>
              <AppText variant="bodyBold" tone="expense">
                {error}
              </AppText>
            </View>
          ) : null}

          <Button label={saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add account'} onPress={save} disabled={saving} />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />

          {editingId != null ? (
            <View style={styles.block}>
              <AppText variant="caption" style={styles.label}>
                Delete this account
              </AppText>
              {others.length === 0 ? (
                <AppText variant="caption">You need at least one account, so this one can’t be deleted.</AppText>
              ) : (
                <>
                  {txCount > 0 ? (
                    <>
                      <AppText variant="caption">
                        Its {txCount} transaction{txCount === 1 ? '' : 's'} will move to:
                      </AppText>
                      <View style={styles.row}>
                        {others.map((a) => (
                          <Chip key={a.id} label={a.name} dotColor={a.color} selected={moveTo === a.id} onPress={() => setMoveTo(a.id)} />
                        ))}
                      </View>
                    </>
                  ) : null}
                  <Button label="Delete account" variant="danger" onPress={confirmDelete} />
                </>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  form: { padding: spacing.md, gap: spacing.md },
  block: { gap: spacing.sm },
  label: { fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  errorBox: { padding: spacing.md - 4, borderRadius: 12 },
});
