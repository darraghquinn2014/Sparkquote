import { useEffect } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTabBarHeightStore } from '../state/tabBarHeightStore';

/**
 * Renders inside a tab screen (where useBottomTabBarHeight is actually
 * available — GlobalVoiceControl's mic FAB is mounted at the root layout,
 * outside the tab navigator, so it can't call the hook directly) and reports
 * the tab bar's real height to the shared store.
 */
export function TabBarHeightReporter() {
  const height = useBottomTabBarHeight();
  const setHeight = useTabBarHeightStore((s) => s.setHeight);
  useEffect(() => { setHeight(height); }, [height, setHeight]);
  return null;
}
