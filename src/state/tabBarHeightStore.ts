import { create } from 'zustand';

/**
 * The bottom tab bar's real rendered height, reported by TabBarHeightReporter
 * (which renders inside a tab screen, where useBottomTabBarHeight is actually
 * available) so the global mic FAB — mounted at the root layout, outside the
 * tab navigator, where that hook can't be called — can sit just above it
 * instead of guessing a fixed value. A plain module variable wouldn't work
 * here: GlobalVoiceControl needs to actually re-render when this updates, not
 * just read a stale value from whenever it last happened to render.
 */
interface TabBarHeightState {
  height: number;
  setHeight: (height: number) => void;
}

export const useTabBarHeightStore = create<TabBarHeightState>((set) => ({
  height: 56,
  setHeight: (height) => set({ height }),
}));
