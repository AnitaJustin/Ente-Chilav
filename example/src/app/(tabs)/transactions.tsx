import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';

export default function TransactionsScreen() {
  return (
    <Screen title="Transactions" subtitle="Everything you’ve spent and received">
      <Card>
        <AppText variant="heading">Nothing here yet</AppText>
        <AppText>
          Once we build the add-a-transaction form, your entries will be listed here, newest
          first, with search and filters.
        </AppText>
      </Card>
    </Screen>
  );
}
