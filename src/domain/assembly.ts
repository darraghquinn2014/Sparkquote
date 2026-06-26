/**
 * AssemblyResolver (spec §5.3).
 *
 * An assembly's material cost is ALWAYS derived from its components against
 * current material prices — it is never stored. This is what makes a price
 * change cascade everywhere a material is used, with no batch job:
 *
 *   assemblyMaterialCost = Σ (qty × wasteFactor × material.unitCostMinor)
 *
 * The resolver is pure: hand it an assembly and a way to look up materials,
 * get back an integer minor-unit cost.
 */

import type { Assembly, Material, MinorUnits } from './types';
import { roundMinor, sumMinor } from './money';

/** A read-only view over the material catalogue. */
export type MaterialLookup = (materialId: string) => Material | undefined;

/** Build a lookup from an array of materials. */
export function materialLookupFrom(materials: Material[]): MaterialLookup {
  const byId = new Map(materials.map((m) => [m.id, m]));
  return (id) => byId.get(id);
}

export class MissingMaterialError extends Error {
  constructor(public readonly materialId: string, public readonly assemblyId: string) {
    super(
      `Assembly "${assemblyId}" references material "${materialId}" which is not in the catalogue.`,
    );
    this.name = 'MissingMaterialError';
  }
}

/**
 * Resolve the total per-unit MATERIAL cost of one assembly.
 * Throws MissingMaterialError if a component's material is absent — we fail
 * loudly rather than silently pricing a job at zero for a missing line.
 */
export function resolveAssemblyMaterialCost(
  assembly: Assembly,
  lookup: MaterialLookup,
): MinorUnits {
  const componentCosts = assembly.components.map((c) => {
    const material = lookup(c.materialId);
    if (!material) {
      throw new MissingMaterialError(c.materialId, assembly.id);
    }
    const waste = c.wasteFactor ?? 1;
    // Round each component's contribution so totals are penny-exact and
    // independent of summation order.
    return roundMinor(material.unitCostMinor * c.quantity * waste);
  });

  return sumMinor(componentCosts);
}
