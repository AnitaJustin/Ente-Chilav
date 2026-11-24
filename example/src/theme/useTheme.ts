import { useColorScheme } from 'react-native';

import { dark, light, type Palette } from './tokens';

// Returns the colours for the phone's current light or dark setting.
export function useTheme(): { colors: Palette; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? dark : light, isDark };
}
