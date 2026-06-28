/**
 * useQuickQuote — the application-layer hook for the Quick-Quote screen.
 *
 * Now reads/writes the SHARED estimate store (Zustand) instead of private
 * state, so the same estimate is visible to the Review screen. Still contains
 * NO pricing math — it orchestrates engine calls and delegates mutations to
 * the store. The return shape is unchanged, so QuickQuoteScreen is untouched.
 */
import { useMemo, useCallback } from 'react';
import type { Assembly, Estimate, LaborToggle, Material } from '../../domain/types';
import { materialLookupFrom } from '../../domain/assembly';
import { priceEstimate, type EstimatePriceBreakdown } from '../../domain/pricing';
import { useEstimateStore } from '../../state/estimateStore';

export interface QuickQuoteState {
  estimate: Estimate;
  pricing: EstimatePriceBreakdown;
  lineCount: number;
  addAssembly: (assembly: Assembly) => void;
  removeAssembly: (assemblyId: string) => void;
  remove: (lineId: string) => void;
  clear: () => void;
}

export interface QuickQuoteConfig {
  currency: Estimate['currency'];
  hourlyRateMinor: number;
  vatRatePct: number;
}

export function useQuickQuote(
  materials: Material[],
  toggles: LaborToggle[],
  _config: QuickQuoteConfig,
): QuickQuoteState {
  const estimate = useEstimateStore((s) => s.estimate);
  const storeAdd = useEstimateStore((s) => s.addAssembly);
  const storeRemove = useEstimateStore((s) => s.remove);
  const storeReplace = useEstimateStore((s) => s.replaceLine);
  const storeClear = useEstimateStore((s) => s.clear);

  const lookup = useMemo(() => materialLookupFrom(materials), [materials]);

  const addAssembly = useCallback(
    (assembly: Assembly) => storeAdd(assembly, lookup),
    [storeAdd, lookup],
  );

  const removeAssembly = useCallback(
    (assemblyId: string) => {
      const line = estimate.lineItems.find(
        (l) => l.sourceAssemblyId === assemblyId && !l.overrides,
      );
      if (!line) return;
      if ((line.quantity ?? 1) <= 1) {
        storeRemove(line.id);
      } else {
        storeReplace({ ...line, quantity: (line.quantity ?? 1) - 1 });
      }
    },
    [estimate.lineItems, storeRemove, storeReplace],
  );

  const remove = useCallback((lineId: string) => storeRemove(lineId), [storeRemove]);
  const clear = useCallback(() => storeClear(), [storeClear]);

  // Live pricing: recomputed by the engine whenever the estimate changes.
  const pricing = useMemo(() => priceEstimate(estimate, toggles), [estimate, toggles]);

  return {
    estimate,
    pricing,
    lineCount: estimate.lineItems.length,
    addAssembly,
    removeAssembly,
    remove,
    clear,
  };
}
