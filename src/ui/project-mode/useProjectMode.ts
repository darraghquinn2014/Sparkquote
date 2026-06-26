/**
 * useProjectMode — application-layer hook for the Project Mode screen.
 *
 * Holds the project estimate and its location tree, and derives per-location
 * roll-ups by pricing through the engine then aggregating with rollUpTotals.
 * No money math lives here — it orchestrates the pure functions.
 */

import { useCallback, useMemo, useState } from 'react';
import type { Estimate, LaborToggle, Location, Material } from '../../domain/types';
import { priceEstimate } from '../../domain/pricing';
import { buildLocationTree, rollUpTotals, type RollUpResult, type LocationNode } from '../../domain/location';
import {
  containmentLine,
  addProjectLine,
  setMeters,
  assignToLocation,
} from '../../data/project-service';

export interface ProjectModeState {
  estimate: Estimate;
  tree: LocationNode[];
  rollUp: RollUpResult;
  grandTotalMinor: number;
  vatAmountMinor: number;
  addContainment: (material: Material, meters: number, locationId: string) => void;
  updateMeters: (lineId: string, meters: number) => void;
  moveLine: (lineId: string, locationId: string | undefined) => void;
}

export function useProjectMode(
  initialEstimate: Estimate,
  locations: Location[],
  toggles: LaborToggle[],
): ProjectModeState {
  const [estimate, setEstimate] = useState<Estimate>(initialEstimate);

  const tree = useMemo(() => buildLocationTree(locations), [locations]);

  const addContainment = useCallback(
    (material: Material, meters: number, locationId: string) => {
      setEstimate((prev) => addProjectLine(prev, containmentLine(material, meters, locationId)));
    },
    [],
  );

  const updateMeters = useCallback((lineId: string, meters: number) => {
    setEstimate((prev) => setMeters(prev, lineId, meters));
  }, []);

  const moveLine = useCallback((lineId: string, locationId: string | undefined) => {
    setEstimate((prev) => assignToLocation(prev, lineId, locationId));
  }, []);

  const pricing = useMemo(() => priceEstimate(estimate, toggles), [estimate, toggles]);

  const rollUp = useMemo(() => {
    const locById = new Map(estimate.lineItems.map((l) => [l.id, l.locationId]));
    return rollUpTotals(tree, pricing.lines, (id) => locById.get(id));
  }, [tree, pricing.lines, estimate.lineItems]);

  return {
    estimate,
    tree,
    rollUp,
    grandTotalMinor: pricing.grandTotalMinor,
    vatAmountMinor: pricing.vatAmountMinor,
    addContainment,
    updateMeters,
    moveLine,
  };
}
