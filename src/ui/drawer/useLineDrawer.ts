/**
 * useLineDrawer — drives the slide-up override drawer for ONE line (spec §6).
 *
 * Holds a working copy of the line being edited so the drawer can preview the
 * recomputed price live (via the engine) before the user commits. On save, the
 * working line replaces the original in the parent estimate; on cancel, nothing
 * changes. This keeps edits atomic — a half-typed unit cost never reaches the
 * stored estimate.
 */

import { useMemo, useState, useCallback } from 'react';
import type { LaborToggle, LineItem, MinorUnits } from '../../domain/types';
import { priceLine, type LinePriceBreakdown } from '../../domain/pricing';

export interface LineDrawerState {
  working: LineItem;
  preview: LinePriceBreakdown;
  setUnitCost: (minor: MinorUnits | undefined) => void;
  setMarkup: (pct: number | undefined) => void;
  setQuantity: (qty: number) => void;
  toggleLineToggle: (toggleId: string, on: boolean) => void;
  hasChanges: boolean;
}

export function useLineDrawer(
  original: LineItem,
  hourlyRateMinor: MinorUnits,
  toggles: LaborToggle[],
  estimateWideToggleIds: string[],
): LineDrawerState {
  const [working, setWorking] = useState<LineItem>(original);

  const toggleIndex = useMemo(() => new Map(toggles.map((t) => [t.id, t])), [toggles]);

  const patchOverrides = useCallback(
    (key: 'unitCostMinor' | 'markupPct', value: number | undefined) => {
      setWorking((prev) => {
        const current = { ...prev.overrides };
        if (value == null) {
          delete current[key];
        } else {
          current[key] = value;
        }
        const hasAny =
          current.unitCostMinor != null || current.markupPct != null || current.isCustom === true;
        if (!hasAny) {
          const { overrides: _drop, ...rest } = prev;
          return rest;
        }
        return { ...prev, overrides: current };
      });
    },
    [],
  );

  const setUnitCost = useCallback(
    (minor: MinorUnits | undefined) => patchOverrides('unitCostMinor', minor),
    [patchOverrides],
  );
  const setMarkup = useCallback(
    (pct: number | undefined) => patchOverrides('markupPct', pct),
    [patchOverrides],
  );
  const setQuantity = useCallback((qty: number) => {
    setWorking((prev) => ({ ...prev, quantity: Math.max(1, qty) }));
  }, []);

  const toggleLineToggle = useCallback((toggleId: string, on: boolean) => {
    setWorking((prev) => {
      const has = prev.appliedLaborToggleIds.includes(toggleId);
      if (on && !has) return { ...prev, appliedLaborToggleIds: [...prev.appliedLaborToggleIds, toggleId] };
      if (!on && has) return { ...prev, appliedLaborToggleIds: prev.appliedLaborToggleIds.filter((id) => id !== toggleId) };
      return prev;
    });
  }, []);

  const preview = useMemo(
    () => priceLine(working, hourlyRateMinor, toggleIndex, estimateWideToggleIds),
    [working, hourlyRateMinor, toggleIndex, estimateWideToggleIds],
  );

  const hasChanges = useMemo(
    () => JSON.stringify(working) !== JSON.stringify(original),
    [working, original],
  );

  return { working, preview, setUnitCost, setMarkup, setQuantity, toggleLineToggle, hasChanges };
}
