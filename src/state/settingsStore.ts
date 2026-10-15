import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import type { Currency } from '@/src/domain/types';

interface SettingsData {
  hourlyRateMinor: number;
  vatRatePct: number;
  currency: Currency;
  catalogueUpdatedAt: number | null;
  showLaborBreakdown: boolean;
  /** Extra words the electrician added at voice setup (own name, brand
   * names, site nicknames) — merged into the recognizer's vocabulary hint
   * list alongside the catalogue/project names built at recognition time. */
  customVoiceWords: string[];
  /** Whether the first-run voice vocabulary setup screen has been completed
   * or explicitly skipped. */
  voiceSetupComplete: boolean;
  /** Master switch for the in-app hint bubbles (Settings > Show hints).
   * Turning this off both stops auto-play on unseen screens and hides the
   * per-screen "?" replay button — a full opt-out for users adept with the app. */
  hintsEnabled: boolean;
  /** Group ids (one per screen's walkthrough) that have already auto-played
   * once, so returning to a screen doesn't replay it uninvited. */
  seenHintGroups: string[];
  /** Whether the first-run setup (business, rate, VAT, prices) has been
   * finished or skipped. Re-runnable from Settings. */
  firstRunSetupComplete: boolean;
  /** Price list (material catalogueId) the Material Picker opens filtered
   * to. null = show every installed price list. */
  preferredSupplierId: string | null;
  /** Simple mode is the default: Tools, voice, the shopping list, project
   * Documents and the less-used Settings rows stay hidden until this is on. */
  advancedMode: boolean;
}

const DEFAULTS: SettingsData = {
  hourlyRateMinor: 5000,
  vatRatePct: 20,
  currency: 'GBP',
  catalogueUpdatedAt: null,
  showLaborBreakdown: true,
  customVoiceWords: [],
  voiceSetupComplete: false,
  hintsEnabled: true,
  seenHintGroups: [],
  firstRunSetupComplete: false,
  preferredSupplierId: null,
  advancedMode: false,
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
  setCustomVoiceWords: (words: string[]) => void;
  setVoiceSetupComplete: (complete: boolean) => void;
  setHintsEnabled: (enabled: boolean) => void;
  markHintGroupSeen: (groupId: string) => void;
  resetHints: () => void;
  setFirstRunSetupComplete: (complete: boolean) => void;
  setPreferredSupplierId: (id: string | null) => void;
  setAdvancedMode: (on: boolean) => void;
}

function snapshot(s: SettingsStore): SettingsData {
  return {
    hourlyRateMinor: s.hourlyRateMinor,
    vatRatePct: s.vatRatePct,
    currency: s.currency,
    catalogueUpdatedAt: s.catalogueUpdatedAt,
    showLaborBreakdown: s.showLaborBreakdown,
    customVoiceWords: s.customVoiceWords,
    voiceSetupComplete: s.voiceSetupComplete,
    hintsEnabled: s.hintsEnabled,
    seenHintGroups: s.seenHintGroups,
    firstRunSetupComplete: s.firstRunSetupComplete,
    preferredSupplierId: s.preferredSupplierId,
    advancedMode: s.advancedMode,
  };
}

/**
 * The Settings defaults a brand-new estimate (quick or project) starts from.
 * Read at creation time, so existing estimates keep whatever they were
 * created with — changing Settings never reprices a quote already made.
 */
export function newEstimateDefaults(): Pick<SettingsData, 'currency' | 'hourlyRateMinor' | 'vatRatePct'> {
  const s = useSettingsStore.getState();
  return { currency: s.currency, hourlyRateMinor: s.hourlyRateMinor, vatRatePct: s.vatRatePct };
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

  setCustomVoiceWords: (words) => {
    set({ customVoiceWords: words });
    saveToDisk({ ...snapshot(get()), customVoiceWords: words });
  },

  setVoiceSetupComplete: (complete) => {
    set({ voiceSetupComplete: complete });
    saveToDisk({ ...snapshot(get()), voiceSetupComplete: complete });
  },

  setHintsEnabled: (enabled) => {
    set({ hintsEnabled: enabled });
    saveToDisk({ ...snapshot(get()), hintsEnabled: enabled });
  },

  markHintGroupSeen: (groupId) => {
    if (get().seenHintGroups.includes(groupId)) return;
    const seenHintGroups = [...get().seenHintGroups, groupId];
    set({ seenHintGroups });
    saveToDisk({ ...snapshot(get()), seenHintGroups });
  },

  resetHints: () => {
    set({ seenHintGroups: [] });
    saveToDisk({ ...snapshot(get()), seenHintGroups: [] });
  },

  setFirstRunSetupComplete: (complete) => {
    set({ firstRunSetupComplete: complete });
    saveToDisk({ ...snapshot(get()), firstRunSetupComplete: complete });
  },

  setPreferredSupplierId: (id) => {
    set({ preferredSupplierId: id });
    saveToDisk({ ...snapshot(get()), preferredSupplierId: id });
  },

  setAdvancedMode: (on) => {
    set({ advancedMode: on });
    saveToDisk({ ...snapshot(get()), advancedMode: on });
  },
}));
