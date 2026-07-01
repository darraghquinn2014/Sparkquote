import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import type { Currency } from '@/src/domain/types';

interface SettingsData {
  hourlyRateMinor: number;
  vatRatePct: number;
  currency: Currency;
  catalogueUpdatedAt: number | null;
  showLaborBreakdown: boolean;
}

const DEFAULTS: SettingsData = {
  hourlyRateMinor: 5000,
  vatRatePct: 20,
  currency: 'GBP',
  catalogueUpdatedAt: null,
  showLaborBreakdown: true,
};

const settingsPath = () =>
  `${FileSystem.documentDirectory ?? ''}sparkquote-settings.json`;

async function loadFromDisk(): Promise<SettingsData> {
  try {
    const raw = await FileSystem.readAsStringAsync(settingsPath());
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsData>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveToDisk(data: SettingsData): void {
  FileSystem.writeAsStringAsync(settingsPath(), JSON.stringify(data)).catch((e) =>
    console.error('settings save failed', e),
  );
}

interface SettingsStore extends SettingsData {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setHourlyRate: (minor: number) => void;
  setVatRate: (pct: number) => void;
  setCurrency: (c: Currency) => void;
  setCatalogueUpdatedAt: (ts: number) => void;
  setShowLaborBreakdown: (show: boolean) => void;
}

function snapshot(s: SettingsStore): SettingsData {
  return {
    hourlyRateMinor: s.hourlyRateMinor,
    vatRatePct: s.vatRatePct,
    currency: s.currency,
    catalogueUpdatedAt: s.catalogueUpdatedAt,
    showLaborBreakdown: s.showLaborBreakdown,
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const saved = await loadFromDisk();
    set({ ...saved, hydrated: true });
  },

  setHourlyRate: (minor) => {
    set({ hourlyRateMinor: minor });
    saveToDisk({ ...snapshot(get()), hourlyRateMinor: minor });
  },

  setVatRate: (pct) => {
    set({ vatRatePct: pct });
    saveToDisk({ ...snapshot(get()), vatRatePct: pct });
  },

  setCurrency: (c) => {
    set({ currency: c });
    saveToDisk({ ...snapshot(get()), currency: c });
  },

  setCatalogueUpdatedAt: (ts) => {
    set({ catalogueUpdatedAt: ts });
    saveToDisk({ ...snapshot(get()), catalogueUpdatedAt: ts });
  },

  setShowLaborBreakdown: (show) => {
    set({ showLaborBreakdown: show });
    saveToDisk({ ...snapshot(get()), showLaborBreakdown: show });
  },
}));
