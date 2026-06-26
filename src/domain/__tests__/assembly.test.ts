import { describe, it, expect } from 'vitest';
import {
  resolveAssemblyMaterialCost,
  materialLookupFrom,
  MissingMaterialError,
} from '../assembly';
import type { Assembly, Material } from '../types';

const gridSwitch: Material = { id: 'm1', sku: 'SW1', description: '1-gang switch', unit: 'each', unitCostMinor: 250, catalogueId: 'c1' };
const backbox: Material = { id: 'm2', sku: 'BB1', description: 'Galv backbox', unit: 'each', unitCostMinor: 180, catalogueId: 'c1' };
const tande: Material = { id: 'm3', sku: 'TE25', description: 'T&E 2.5mm', unit: 'm', unitCostMinor: 95, catalogueId: 'c1' };

const lightSwitch: Assembly = {
  id: 'a1',
  name: '1-Way Light Switch',
  category: 'Lighting',
  baseLaborHours: 0.5,
  components: [
    { materialId: 'm1', quantity: 1 },
    { materialId: 'm2', quantity: 1 },
    { materialId: 'm3', quantity: 5 }, // 5m of T&E
  ],
};

describe('AssemblyResolver', () => {
  it('computes material cost from live component prices', () => {
    const lookup = materialLookupFrom([gridSwitch, backbox, tande]);
    // 250 + 180 + (95×5=475) = 905
    expect(resolveAssemblyMaterialCost(lightSwitch, lookup)).toBe(905);
  });

  it('applies waste factor per component, rounded', () => {
    const lookup = materialLookupFrom([tande]);
    const cableRun: Assembly = {
      id: 'a2', name: 'Cable run', category: 'Cabling', baseLaborHours: 0,
      components: [{ materialId: 'm3', quantity: 10, wasteFactor: 1.1 }], // 95×10×1.1 = 1045
    };
    expect(resolveAssemblyMaterialCost(cableRun, lookup)).toBe(1045);
  });

  it('CASCADE: raising a material price raises the assembly cost automatically', () => {
    // The core §5.3 guarantee: cost is computed, so a new price reflects instantly.
    const dearerCable: Material = { ...tande, unitCostMinor: 120 };
    const lookup = materialLookupFrom([gridSwitch, backbox, dearerCable]);
    // 250 + 180 + (120×5=600) = 1030
    expect(resolveAssemblyMaterialCost(lightSwitch, lookup)).toBe(1030);
  });

  it('throws loudly if a component material is missing', () => {
    const lookup = materialLookupFrom([gridSwitch, backbox]); // no cable
    expect(() => resolveAssemblyMaterialCost(lightSwitch, lookup)).toThrow(MissingMaterialError);
  });
});
