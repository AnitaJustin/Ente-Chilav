import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MonthStepper } from '@/components/MonthStepper';
import { Screen } from '@/components/Screen';
import { deleteTransfer, formatMoney, longDateLabel, monthLabel, type TransferRow } from '@/db';
import {
  checkSummary,
  describeDifference,
  loadAccounts,
  type AccountCard,
  type AccountsData,
} from '@/features/accounts';
import { useMonth } from '@/state/MonthContext';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function AccountsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { month, setMonth } = useMonth();
  const [data, setData] = useState<AccountsData | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    const d = await loadAccounts(db, month);
    if (mine !== latest.current) return; // a newer request has already started
    setData(d);
  }, [db, month]);

  // Reload when the month changes and whenever this tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDeleteMove(t: TransferRow) {
    Alert.alert(
      'Delete this move?',
      `${t.fromName} → ${t.toName}, ${formatMoney(t.amountMinor, data?.currency ?? 'INR')} on ${longDateLabel(t.date)}.\n\nBoth balances go back to how they were.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransfer(db, t.transferId);
            await load();
          },
        },
      ],
    );
  }

  if (!data) {
    return (
      <Screen title="Accounts" subtitle="Where your money sits">
        <Card>
          <AppText variant="caption">Loading…</AppText>
        </Card>
      </Screen>
    );
  }

  const money = (minor: number) => formatMoney(minor, data.currency);
  const { tally } = data;
  const period = monthLabel(data.month);
  const summary = tally ? checkSummary(tally, money) : null;

  return (
    <Screen title="Accounts" subtitle="Where your money sits">
      <MonthStepper months={data.months} value={data.month} onChange={setMonth} allowAll={false} />

      {tally ? (
        <>
          <Card>
            <AppText variant="caption">
              {data.isCurrentMonth ? 'Total balance today' : `Total balance at the end of ${period}`}
            </AppText>
            <AppText variant="headline">{money(tally.closingMinor)}</AppText>
            <AppText variant="caption">
              {tally.tracked} account{tally.tracked === 1 ? '' : 's'} tracked
              {tally.untracked > 0 ? ` · ${tally.untracked} not tracked` : ''}
            </AppText>
            {tally.savingsMinor !== 0 || data.cards.some((c) => c.account.isSavings) ? (
              <AppText variant="caption">
                In savings accounts {money(tally.savingsMinor)} · In bank and cash {money(tally.closingMinor - tally.savingsMinor)}
              </AppText>
            ) : null}
          </Card>

          <Card>
            <AppText variant="heading">Does it add up?</AppText>
            <AppText variant="caption">
              Your records for {period}
              {data.isCurrentMonth ? ' so far' : ''}, across the accounts you track.
            </AppText>
            <View style={styles.lines}>
              {tally.openingMinor !== 0 || tally.startedMinor === 0 ? (
                <Line label={`Opening balances (start of ${monthLabel(data.month).split(' ')[0]})`} value={money(tally.openingMinor)} />
              ) : null}
              {tally.startedMinor !== 0 ? <Line label="Accounts that started this month" value={signed(tally.startedMinor, money)} /> : null}
              <Line label="Money in" value={signed(tally.cameInMinor, money)} />
              <Line label="Money spent" value={signed(-tally.spentMinor, money)} />
              {tally.movedMinor !== 0 ? <Line label="Moved or not counted" value={signed(tally.movedMinor, money)} /> : null}
              <Rule />
              <Line label="Expected total" value={money(tally.closingMinor)} bold />
            </View>
            {summary ? <CheckLines good={summary.good} lines={summary.lines} /> : null}
          </Card>
          <Button
            label="Check all balances"
            onPress={() => router.push({ pathname: '/check-all', params: { date: data.periodEnd } })}
          />
        </>
      ) : (
        <Card>
          <AppText variant="heading">Track where your money sits</AppText>
          <AppText>
            Give an account an opening balance and the app works out its balance from your transactions. You can then
            check it against your bank to make sure nothing is missing.
          </AppText>
        </Card>
      )}

      {data.cards.map((card) => (
        <AccountCardView
          key={card.account.id}
          card={card}
          money={money}
          periodLabel={period}
          isCurrentMonth={data.isCurrentMonth}
          periodEnd={data.periodEnd}
          onEdit={() => router.push({ pathname: '/account', params: { id: String(card.account.id) } })}
          onCheck={() =>
            router.push({ pathname: '/balance-check', params: { accountId: String(card.account.id), date: data.periodEnd } })
          }
        />
      ))}

      <Card>
        <AppText variant="heading">Moved between accounts</AppText>
        <AppText variant="caption">
          Cash withdrawals and transfers between your accounts. They change your balances, but they aren’t spending or income,
          so they never show up in Transactions.
        </AppText>
        {data.transfers.length === 0 ? (
          <AppText variant="caption">Nothing moved between accounts in {period}.</AppText>
        ) : (
          <View style={styles.moves}>
            {data.transfers.map((t) => (
              <MoveRow key={t.transferId} move={t} money={money} onDelete={() => confirmDeleteMove(t)} />
            ))}
          </View>
        )}
      </Card>

      <Button label="Add an account" onPress={() => router.push('/account')} />
      <Button
        label="Move money between accounts"
        variant="secondary"
        disabled={data.cards.length < 2}
        onPress={() => router.push('/transfer')}
      />
      {data.cards.length < 2 ? (
        <AppText variant="caption">Add a second account to move money between them, for example cash from the bank.</AppText>
      ) : null}
    </Screen>
  );
}

function Rule() {
  const { colors } = useTheme();
  return <View style={[styles.rule, { backgroundColor: colors.line }]} />;
}

function signed(minor: number, money: (m: number) => string): string {
  return minor > 0 ? `+${money(minor)}` : money(minor);
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText variant={bold ? 'bodyBold' : 'body'} style={styles.lineLabel}>
        {label}
      </AppText>
      <AppText variant={bold ? 'bodyBold' : 'body'}>{value}</AppText>
    </View>
  );
}

function MoveRow({ move, money, onDelete }: { move: TransferRow; money: (m: number) => string; onDelete: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.move}>
      <View style={styles.cardName}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {move.fromName} → {move.toName}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {longDateLabel(move.date)}
          {move.note ? ` · ${move.note}` : ''}
        </AppText>
      </View>
      <AppText variant="bodyBold">{money(move.amountMinor)}</AppText>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete the move from ${move.fromName} to ${move.toName}`}
        hitSlop={10}
        style={[styles.edit, { backgroundColor: colors.surface2 }]}>
        <Ionicons name="trash-outline" size={17} color={colors.ink2} />
      </Pressable>
    </View>
  );
}

function CheckLines({ good, lines }: { good: boolean; lines: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.checkBox, { backgroundColor: good ? colors.incomeSoft : colors.surface2 }]}>
      {lines.map((l, i) => (
        <AppText key={i} variant="caption" style={{ color: good ? colors.income : colors.ink2 }}>
          {l}
        </AppText>
      ))}
    </View>
  );
}

function AccountCardView({
  card,
  money,
  periodLabel,
  isCurrentMonth,
  periodEnd,
  onEdit,
  onCheck,
}: {
  card: AccountCard;
  money: (minor: number) => string;
  periodLabel: string;
  isCurrentMonth: boolean;
  periodEnd: string;
  onEdit: () => void;
  onCheck: () => void;
}) {
  const { colors } = useTheme();
  const { account, period, check } = card;
  return (
    <Card>
      <View style={styles.cardHead}>
        <View style={[styles.dot, { backgroundColor: account.color }]} />
        <View style={styles.cardName}>
          <AppText variant="bodyBold" numberOfLines={1}>
            {account.name}
          </AppText>
          <AppText variant="caption">{account.kind === 'cash' ? 'Cash' : account.isSavings ? 'Savings account' : 'Bank account'}</AppText>
        </View>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${account.name}`}
          hitSlop={10}
          style={[styles.edit, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="create-outline" size={18} color={colors.ink2} />
        </Pressable>
      </View>

      {period.status === 'untracked' ? (
        <>
          <AppText variant="caption">Balance not tracked.</AppText>
          <Button label="Track this balance" variant="secondary" onPress={onEdit} />
        </>
      ) : period.status === 'not-started' ? (
        <AppText variant="caption">Tracking starts on {longDateLabel(account.openingDate as string)}.</AppText>
      ) : (
        <>
          <AppText variant="number">{money(period.closingMinor as number)}</AppText>
          <AppText variant="caption">
            {isCurrentMonth ? 'Balance today' : `Balance at the end of ${periodLabel}`}
          </AppText>
          <View style={styles.lines}>
            {period.openingMinor !== null ? <Line label="Opening" value={money(period.openingMinor)} /> : null}
            {period.startedMinor !== 0 ? (
              <Line label={`Started on ${longDateLabel(account.openingDate as string)}`} value={money(period.startedMinor)} />
            ) : null}
            <Line label="Money in" value={signed(period.cameInMinor, money)} />
            <Line label="Money spent" value={signed(-period.spentMinor, money)} />
            {period.movedMinor !== 0 ? <Line label="Moved" value={signed(period.movedMinor, money)} /> : null}
          </View>
          {check ? (
            <View
              style={[
                styles.checkBox,
                { backgroundColor: check.differenceMinor === 0 ? colors.incomeSoft : colors.expenseSoft },
              ]}>
              <AppText
                variant="caption"
                style={{ color: check.differenceMinor === 0 ? colors.income : colors.expense }}>
                {`Checked on ${longDateLabel(check.date)}: your bank showed ${money(check.actualMinor)}. ${
                  check.differenceMinor === 0 ? '✓ ' : ''
                }${describeDifference(check.differenceMinor, money)}`}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption">Not checked against your bank this month.</AppText>
          )}
          <Button label={isCurrentMonth ? 'Check balance' : `Check balance on ${longDateLabel(periodEnd)}`} variant="secondary" onPress={onCheck} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.xs, marginTop: spacing.xs },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  lineLabel: { flex: 1 },
  rule: { height: 1, marginVertical: spacing.xs },
  checkBox: { padding: spacing.md - 4, borderRadius: radius.md, gap: 2 },
  moves: { gap: spacing.sm + 2, marginTop: spacing.xs },
  move: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  cardName: { flex: 1 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  edit: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
