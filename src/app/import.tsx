import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { DateField } from '@/components/DateField';
import { CategoryPicker, type PickOptions } from '@/components/import/CategoryPicker';
import { ReviewRowView } from '@/components/import/ReviewRowView';
import { ModalHeader } from '@/components/ModalHeader';
import {
  addTransaction,
  CURRENCIES,
  getCurrency,
  getSetting,
  listAccounts,
  listCategories,
  listRules,
  listTransactions,
  setSetting,
  todayYmd,
  upsertRules,
  type Account,
  type Category,
  type CurrencyCode,
  type TxType,
} from '@/db';
import { ocrAvailable, pickScreenshots, readLines, sizeOf } from '@/features/import/engine';
import { maskLines } from '@/features/import/mask';
import { parseTransactionLines, repairCurrencyDigits, suspectedCurrencyDigit } from '@/features/import/parse';
import {
  applyDefaultDate,
  buildInputs,
  buildReviewRows,
  categoriesFor,
  dropFirstDigit,
  editRow,
  rulesToRemember,
  sameMerchantKeys,
  setCategory,
  undoRepair,
  setInclude,
  setType,
  type ReviewContext,
  type ReviewRow,
} from '@/features/import/review';
import type { OcrLine, ParsedRow, SkippedLine } from '@/features/import/types';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Phase = 'pick' | 'reading' | 'review' | 'empty' | 'done';
type Looked = { index: number; width: number; height: number; lines: OcrLine[]; found: number; skipped: SkippedLine[] };
type PickerState = { keys: string[]; type: TxType; merchant: string | null; sameCount: number; title: string };

export default function ImportScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [phase, setPhase] = useState<Phase>('pick');
  const [available] = useState(() => ocrAvailable());
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const stop = useRef(false);

  const [categories, setCategories] = useState<Category[]>([]); // the ones you can use (not hidden)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [defaultDate, setDefaultDate] = useState(todayYmd());

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [looked, setLooked] = useState<Looked[]>([]);
  const [digit, setDigit] = useState<string | null>(null);
  const [repairedCount, setRepairedCount] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState({ count: 0, remembered: 0 });
  const [showRead, setShowRead] = useState(false);
  const [hideNumbers, setHideNumbers] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cats, accountList, cur, last] = await Promise.all([
        listCategories(db),
        listAccounts(db),
        getCurrency(db),
        getSetting(db, 'last_account_id'),
      ]);
      if (!alive) return;
      setCategories(cats);
      setAccounts(accountList);
      setCurrency(cur);
      const wanted = Number(last);
      setAccountId(accountList.some((a) => a.id === wanted) ? wanted : (accountList[0]?.id ?? null));
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const symbol = CURRENCIES[currency].symbol;
  const context = useCallback(
    async (): Promise<ReviewContext> => ({
      categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
      rules: await listRules(db),
      defaultDate,
    }),
    [categories, db, defaultDate],
  );

  // ---- choosing and reading screenshots ------------------------------------------------
  async function choose() {
    setError(null);
    let picked;
    try {
      picked = await pickScreenshots(10);
    } catch {
      setError('Could not open your photos. Please try again.');
      return;
    }
    if (!picked || picked.length === 0) return;

    stop.current = false;
    setPhase('reading');
    setProgress({ current: 0, total: picked.length });
    const parsed: ParsedRow[][] = [];
    const seen: Looked[] = [];
    const bad: string[] = [];
    for (let i = 0; i < picked.length; i++) {
      if (stop.current) break;
      setProgress({ current: i + 1, total: picked.length });
      try {
        const lines = await readLines(picked[i].uri);
        const size = sizeOf(picked[i], lines);
        const result = parseTransactionLines(lines, size, { today: todayYmd(), dayFirst: currency === 'INR' });
        parsed.push(result.rows);
        seen.push({ index: i + 1, width: size.width, height: size.height, lines, found: result.rows.length, skipped: result.skipped });
      } catch (e) {
        parsed.push([]);
        bad.push(`Screenshot ${i + 1} couldn’t be read${e instanceof Error && e.message ? ` (${e.message})` : ''}.`);
        seen.push({ index: i + 1, width: 0, height: 0, lines: [], found: 0, skipped: [] });
      }
    }
    setLooked(seen);
    setProblems(bad);
    const all = parsed.flat();
    if (all.length === 0) {
      setPhase('empty');
      return;
    }
    const existing = (await listTransactions(db, {})).map((t) => ({ date: t.date, amountMinor: t.amountMinor, type: t.type }));
    // The ₹ sign is often read as a 2 or 7 stuck to the front of an amount; repair those where it's clearly happening.
    const repaired = repairCurrencyDigits(parsed);
    setRepairedCount(repaired.repaired);
    setRows(buildReviewRows(repaired.images, await context(), existing));
    setDigit(repaired.repaired === 0 ? suspectedCurrencyDigit(all) : null);
    setPhase('review');
  }

  // ---- changes in the review list ----------------------------------------------------
  const onChange = useCallback((key: string, patch: Partial<ReviewRow>) => setRows((prev) => editRow(prev, key, patch)), []);
  const selected = useMemo(() => rows.filter((r) => r.include), [rows]);

  async function changeType(keys: string[], type: TxType) {
    const ctx = await context();
    setRows((prev) => setType(prev, keys, type, ctx));
  }
  const onType = useCallback(
    (key: string, type: TxType) => {
      changeType([key], type);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context],
  );

  const onUndoRepair = useCallback((key: string) => setRows((prev) => undoRepair(prev, key)), []);

  const onCategory = useCallback(
    (key: string) => {
      const row = rows.find((r) => r.key === key);
      if (!row) return;
      setPicker({
        keys: [key],
        type: row.type,
        merchant: row.name,
        sameCount: sameMerchantKeys(rows, key).filter((k) => k !== key && rows.find((r) => r.key === k)?.type === row.type).length,
        title: `Category for “${row.name}”`,
      });
    },
    [rows],
  );

  function bulkCategory() {
    const types = new Set(selected.map((r) => r.type));
    if (selected.length === 0) {
      setError('Tick the transactions you want to change first.');
      return;
    }
    if (types.size > 1) {
      setError('Money in and money out use different categories. Tick only one kind at a time, or use Out/In above first.');
      return;
    }
    setError(null);
    setPicker({
      keys: selected.map((r) => r.key),
      type: selected[0].type,
      merchant: null,
      sameCount: 0,
      title: `Category for ${selected.length} transaction${selected.length === 1 ? '' : 's'}`,
    });
  }

  function onPick(categoryId: number, options: PickOptions) {
    if (!picker) return;
    let keys = picker.keys;
    if (picker.merchant !== null && options.applyToSame) {
      const same = sameMerchantKeys(rows, picker.keys[0]);
      keys = same.filter((k) => rows.find((r) => r.key === k)?.type === picker.type);
    }
    setRows((prev) => setCategory(prev, keys, categoryId, options.remember));
    setPicker(null);
    setError(null);
  }

  // ---- saving ------------------------------------------------------------------------
  async function save() {
    if (saving) return;
    const { inputs, errors } = buildInputs(rows, accountId);
    if (errors.length > 0) {
      setError(errors.slice(0, 3).join(' '));
      return;
    }
    if (inputs.length === 0) {
      setError('Tick at least one transaction to add.');
      return;
    }
    setSaving(true);
    try {
      const remembered = rulesToRemember(rows);
      await db.withTransactionAsync(async () => {
        for (const input of inputs) await addTransaction(db, input);
        await upsertRules(db, remembered);
      });
      if (accountId !== null) await setSetting(db, 'last_account_id', String(accountId));
      setDone({ count: inputs.length, remembered: remembered.length });
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Nothing was added. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startOver() {
    setRows([]);
    setLooked([]);
    setProblems([]);
    setError(null);
    setDigit(null);
    setRepairedCount(0);
    setPhase('pick');
  }

  // ---- sharing what the phone read (names hidden) ----------------------------------------
  async function shareRead() {
    const payload = looked.map((l) => ({ screenshot: l.index, width: l.width, height: l.height, lines: maskLines(l.lines, hideNumbers) }));
    try {
      await Share.share({ message: JSON.stringify(payload) });
    } catch {
      // closing the share sheet isn't an error
    }
  }

  const pickerCategories = picker ? categoriesFor(
    categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    picker.type,
  ).map((c) => catById.get(c.id) as Category) : [];

  // ---- screens -----------------------------------------------------------------------
  const readCard = (
    <Card>
      <View style={styles.row}>
        <AppText variant="heading" style={styles.flex}>
          What the phone read
        </AppText>
        <Chip label={showRead ? 'Hide' : 'Show'} selected={showRead} onPress={() => setShowRead(!showRead)} />
      </View>
      <AppText variant="caption">
        If something was missed or misread, share this with me so the reading can be improved. Names are hidden before it’s shared.
      </AppText>
      {showRead
        ? looked.map((l) => (
            <View key={l.index} style={styles.readBlock}>
              <AppText variant="bodyBold">
                Screenshot {l.index}: {l.found} found, {l.lines.length} lines read
              </AppText>
              {l.skipped.map((s, i) => (
                <AppText key={`s${i}`} variant="caption">
                  Left out ({s.reason}): {s.text.slice(0, 80)}
                </AppText>
              ))}
              {l.lines.slice(0, 60).map((line, i) => (
                <AppText key={i} variant="caption" numberOfLines={1}>
                  {Math.round(line.y)}  {line.text}
                </AppText>
              ))}
            </View>
          ))
        : null}
      <View style={styles.wrap}>
        <Chip label="Hide amounts and dates too" selected={hideNumbers} onPress={() => setHideNumbers(!hideNumbers)} />
      </View>
      <Button label="Share what was read (names hidden)" variant="secondary" onPress={shareRead} />
    </Card>
  );

  let body;
  if (phase === 'pick') {
    body = (
      <View style={styles.pad}>
        <Card>
          <AppText variant="heading">Add from screenshots</AppText>
          <AppText>
            Choose screenshots of a list of payments, from GPay, PhonePe, Paytm or your bank app. The app reads the names and
            amounts, guesses a category for each, and shows you everything to check before anything is saved.
          </AppText>
          <AppText variant="caption">Everything happens on this phone. The pictures are never uploaded or shared.</AppText>
        </Card>
        {!available ? (
          <Card>
            <AppText variant="bodyBold" tone="expense">
              Reading screenshots isn’t available here
            </AppText>
            <AppText>It needs the installed Ente Chilavu app. It doesn’t work inside Expo Go.</AppText>
          </Card>
        ) : null}
        {error ? (
          <View style={[styles.box, { backgroundColor: colors.expenseSoft }]}>
            <AppText variant="bodyBold" tone="expense">
              {error}
            </AppText>
          </View>
        ) : null}
        <Button label="Choose screenshots" onPress={choose} disabled={!available} />
        <AppText variant="caption">
          Tip: one screen of transactions per screenshot works best. Overlapping screenshots are fine, since repeats are spotted.
        </AppText>
      </View>
    );
  } else if (phase === 'reading') {
    body = (
      <View style={[styles.pad, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="heading">
          Reading screenshot {progress.current} of {progress.total}…
        </AppText>
        <Button
          label="Stop"
          variant="secondary"
          onPress={() => {
            stop.current = true;
          }}
        />
      </View>
    );
  } else if (phase === 'empty') {
    body = (
      <FlatList
        data={[]}
        renderItem={() => null}
        contentContainerStyle={styles.pad}
        ListHeaderComponent={
          <View style={styles.gap}>
            <Card>
              <AppText variant="heading">No transactions found</AppText>
              <AppText>
                The screenshots didn’t contain a list of payments the app could read. Try a screenshot where each payment shows a name
                and an amount.
              </AppText>
              {problems.map((p, i) => (
                <AppText key={i} variant="caption" tone="expense">
                  {p}
                </AppText>
              ))}
            </Card>
            {readCard}
            <Button label="Try again" onPress={startOver} />
          </View>
        }
      />
    );
  } else if (phase === 'done') {
    body = (
      <View style={[styles.pad, styles.center]}>
        <Card>
          <AppText variant="heading">
            Added {done.count} transaction{done.count === 1 ? '' : 's'}
          </AppText>
          {done.remembered > 0 ? (
            <AppText>
              Remembered {done.remembered} merchant{done.remembered === 1 ? '' : 's'}, so they’ll be put in the same category next time.
            </AppText>
          ) : null}
        </Card>
        <Button label="Done" onPress={() => router.back()} />
        <Button label="Import more" variant="secondary" onPress={startOver} />
      </View>
    );
  } else {
    const count = selected.length;
    body = (
      <>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          extraData={categories}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: 140 + keyboardHeight }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListHeaderComponent={
            <View style={styles.gap}>
              <AppText variant="heading">
                {rows.length} found. Check them, then add.
              </AppText>
              {problems.map((p, i) => (
                <AppText key={i} variant="caption" tone="expense">
                  {p}
                </AppText>
              ))}
              {repairedCount > 0 && rows.some((r) => r.repairedFrom) ? (
                <View style={[styles.box, { backgroundColor: colors.surface2, borderColor: colors.line, borderWidth: 1 }]}>
                  <AppText variant="bodyBold">I fixed {rows.filter((r) => r.repairedFrom).length} amount{rows.filter((r) => r.repairedFrom).length === 1 ? '' : 's'}</AppText>
                  <AppText variant="caption">
                    The ₹ sign was being read as a 7 or a 2 stuck to the front of the amount, so I removed that digit. Rows marked “Fixed” show
                    what was first read, and you can tap one to put it back.
                  </AppText>
                  <Button label="Undo all fixes" variant="secondary" onPress={() => setRows((prev) => undoRepair(prev))} />
                </View>
              ) : null}
              {digit ? (
                <View style={[styles.box, { backgroundColor: colors.surface2, borderColor: colors.warn, borderWidth: 1 }]}>
                  <AppText variant="bodyBold">The ₹ sign may have been read as the digit {digit}</AppText>
                  <AppText variant="caption">Nearly every amount starts with {digit}, which would make them far too large. If that looks right, fix them all at once.</AppText>
                  <Button
                    label="Drop the first digit from every amount"
                    variant="secondary"
                    onPress={() => {
                      setRows((prev) => dropFirstDigit(prev));
                      setDigit(null);
                    }}
                  />
                </View>
              ) : null}
              <Card>
                {accounts.length > 1 ? (
                  <>
                    <AppText variant="caption" style={styles.label}>
                      Add to account
                    </AppText>
                    <View style={styles.wrap}>
                      {accounts.map((a) => (
                        <Chip key={a.id} label={a.name} dotColor={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
                      ))}
                    </View>
                  </>
                ) : null}
                <DateField
                  label="Date for any that show none"
                  value={defaultDate}
                  onChange={(d) => {
                    setDefaultDate(d);
                    setRows((prev) => applyDefaultDate(prev, d));
                  }}
                  maxToday
                />
              </Card>
              <Card>
                <AppText variant="caption" style={styles.label}>
                  Change all {count} ticked at once
                </AppText>
                <View style={styles.wrap}>
                  <Chip label="All money out" onPress={() => changeType(selected.map((r) => r.key), 'debit')} />
                  <Chip label="All money in" onPress={() => changeType(selected.map((r) => r.key), 'credit')} />
                  <Chip label="Set a category…" onPress={bulkCategory} />
                </View>
                <View style={styles.wrap}>
                  <Chip label="Tick all" onPress={() => setRows((prev) => setInclude(prev, prev.map((r) => r.key), true))} />
                  <Chip label="Untick all" onPress={() => setRows((prev) => setInclude(prev, prev.map((r) => r.key), false))} />
                </View>
              </Card>
            </View>
          }
          renderItem={({ item }) => {
            const cat = catById.get(item.categoryId);
            return (
              <ReviewRowView
                row={item}
                symbol={symbol}
                categoryName={cat?.name ?? 'Choose'}
                categoryColor={cat?.color ?? colors.ink3}
                onChange={onChange}
                onType={onType}
                onCategory={onCategory}
                onUndoRepair={onUndoRepair}
              />
            );
          }}
          ListFooterComponent={<View style={[styles.gap, { marginTop: spacing.md }]}>{readCard}</View>}
        />
        {keyboardHeight === 0 ? (
          <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.line }]}>
            {error ? (
              <AppText variant="caption" tone="expense">
                {error}
              </AppText>
            ) : null}
            <Button
              label={saving ? 'Adding…' : count === 0 ? 'Nothing ticked' : `Add ${count} transaction${count === 1 ? '' : 's'}`}
              onPress={save}
              disabled={saving || count === 0}
            />
          </View>
        ) : null}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ModalHeader title="Add from screenshots" />
      {body}
      <CategoryPicker
        visible={picker !== null}
        title={picker?.title ?? ''}
        categories={pickerCategories}
        merchant={picker?.merchant ?? null}
        sameCount={picker?.sameCount ?? 0}
        onClose={() => setPicker(null)}
        onPick={onPick}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { padding: spacing.md, gap: spacing.md },
  center: { alignItems: 'stretch' },
  list: { padding: spacing.md },
  gap: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { fontWeight: '600' },
  box: { padding: spacing.md - 4, borderRadius: 12, gap: spacing.xs },
  readBlock: { gap: 2, marginTop: spacing.xs },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, gap: spacing.xs, borderTopWidth: 1 },
});
