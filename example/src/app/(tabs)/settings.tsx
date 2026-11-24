import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/useTheme';

export default function SettingsScreen() {
  const { isDark } = useTheme();
  return (
    <Screen title="Settings" subtitle="Make the app yours">
      <Card>
        <AppText variant="heading">Appearance</AppText>
        <AppText>
          The app follows your phone’s light or dark setting. Right now it is in{' '}
          <AppText variant="bodyBold">{isDark ? 'dark' : 'light'}</AppText> mode.
        </AppText>
      </Card>
      <Card>
        <AppText variant="heading">Coming later</AppText>
        <AppText>
          Currency, budgets, your own categories, export and backup, and an app lock will be
          added here.
        </AppText>
      </Card>
    </Screen>
  );
}
