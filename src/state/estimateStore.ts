/**
 * Shared estimate store (Zustand) — now DB-backed.
 *
 * Holds the current estimate in memory (synchronous, so screens are unchanged)
 * and persists every change to SQLite via the estimate-repo. On startup,
 * hydrate() loads the saved estimate. A guard prevents saving the empty default
 * before hydrate runs (which would wipe the saved data).
 */
import { create } from 'zustand';
import type { Assembly, Estimate, LineItem, Material } from '@/src/domain/types';
import type { MaterialLookup } from '@/src/domain/assembly';
import { addAssemblyToEstimate, removeLine, lineFromMaterial, lineFromLabour, addLine } from '@/src/data/estimate-service';
import {
  saveActiveEstimate,
  loadActiveEstimate,
  clearActiveEstimate,
} from '@/src/data/estimate-repo';

interface EstimateStore {
  estimate: Estimate;
  hydrated: boolean;
  savedEstimate: Estimate | null;
  hydrate: () => Promise<void>;
  restoreSaved: () => void;
  dismissSaved: () => void;
  addAssembly: (assembly: Assembly, lookup: MaterialLookup) => void;
  addMaterial: (material: Material, amount: number) => void;
  addLabour: (opts: { hours?: number; flatMinor?: number }) => void;
  remove: (lineId: string) => void;
  replaceLine: (updated: LineItem) => void;
  reloadEstimate: () => Promise<void>;

  clear: () => void;
  setHourlyRate: (rateMinor: number) => void;
  setShowLaborBreakdown: (show: boolean) => void;
}

function emptyEstimate(): Estimate {
  return {
    id: `est_${Date.now().toString(36)}`,
    mode: 'quick',
    status: 'draft',
    currency: 'GBP',
    hourlyRateMinor: 5000,
    vatRatePct: 20,
    showLaborBreakdown: true,
    appliedLaborToggleIds: [],
    lineItems: [],
  };
}

/** Fire-and-forget persist; never blocks the UI. */
function persist(estimate: Estimate, hydrated: boolean) {
  if (!hydrated) return; // don't overwrite saved data before load
  saveActiveEstimate(estimate).catch((e) => console.error('save estimate failed', e));
}

export const useEstimateStore = create<EstimateStore>((set, get) => ({
  estimate: emptyEstimate(),
  hydrated: false,
  savedEstimate: null,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const saved = await loadActiveEstimate();
      if (saved && saved.lineItems.length > 0) {
        set({ savedEstimate: saved });
      }
    } catch (e) {
      console.error('hydrate failed', e);
    } finally {
      set({ hydrated: true });
    }
  },

  restoreSaved: () =>
    set((s) => {
      if (!s.savedEstimate) return {};
      const estimate = s.savedEstimate;
      persist(estimate, s.hydrated);
      return { estimate, savedEstimate: null };
    }),

  dismissSaved: () => set({ savedEstimate: null }),

  addAssembly: (assembly, lookup) =>
    set((s) => {
      const estimate = addAssemblyToEstimate(s.estimate, assembly, lookup);
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  addMaterial: (material, amount) =>
    set((s) => {
      const estimate = addLine(s.estimate, lineFromMaterial(material, amount));
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  addLabour: (opts) =>
    set((s) => {
      const estimate = addLine(s.estimate, lineFromLabour(opts));
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  remove: (lineId) =>
    set((s) => {
      const estimate = removeLine(s.estimate, lineId);
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  replaceLine: (updated) =>
    set((s) => {
      const estimate = {
        ...s.estimate,
        lineItems: s.estimate.lineItems.map((l) => (l.id === updated.id ? updated : l)),
      };
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  reloadEstimate: async () => {
    try {
      const saved = await loadActiveEstimate();
      if (saved) set({ estimate: saved });
    } catch (e) {
      console.error('reloadEstimate failed', e);
    }
  },

  setHourlyRate: (rateMinor) =>
    set((s) => {
      const estimate = { ...s.estimate, hourlyRateMinor: rateMinor };
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  setShowLaborBreakdown: (show) =>
    set((s) => {
      const estimate = { ...s.estimate, showLaborBreakdown: show };
      persist(estimate, s.hydrated);
      return { estimate };
    }),

  clear: () =>
    set((s) => {
      const estimate = emptyEstimate();
      if (s.hydrated) clearActiveEstimate().catch((e) => console.error('clear failed', e));
      return { estimate, savedEstimate: null };
    }),
}));
