import { describe, expect, it } from 'vitest';
import { matchAssemblies, matchLines, matchLocations, matchMaterials, matchProjects, matchSnags } from '../matcher';
import type { Assembly, LineItem, Location, Material, Project, SnagItem } from '../../domain/types';

const materials: Material[] = [
  { id: 'm1', sku: 'TE25', description: 'Twin & Earth Cable 2.5mm Grey', unit: 'm', unitCostMinor: 120, catalogueId: 'seed' },
  { id: 'm2', sku: 'TE15', description: 'Twin & Earth Cable 1.5mm Grey', unit: 'm', unitCostMinor: 90, catalogueId: 'seed' },
  { id: 'm3', sku: 'RCBO32', description: '32A RCBO Single Pole', unit: 'each', unitCostMinor: 1899, catalogueId: 'seed' },
  { id: 'm4', sku: 'MCB20', description: '20A MCB Type B', unit: 'each', unitCostMinor: 599, catalogueId: 'seed' },
];

const projects: Project[] = [
  { id: 'p1', name: 'Smith Rewire', clientName: 'John Smith', createdAt: 0 },
  { id: 'p2', name: 'Jones Extension', clientName: 'Sarah Jones', createdAt: 0 },
];

describe('matchMaterials', () => {
  it('matches electrician shorthand for cable', () => {
    const results = matchMaterials('2.5 twin and earth', materials);
    expect(results[0]?.material.id).toBe('m1');
  });

  it('matches shorthand amp rating for a breaker', () => {
    const results = matchMaterials('32 amp rcbo', materials);
    expect(results[0]?.material.id).toBe('m3');
  });

  it('returns empty on no query', () => {
    expect(matchMaterials('', materials)).toEqual([]);
  });
});

describe('matchProjects', () => {
  it('matches a project by partial spoken name', () => {
    const results = matchProjects('Smith', projects);
    expect(results[0]?.project.id).toBe('p1');
  });
});

const assemblies: Assembly[] = [
  { id: 'a1', name: 'Install 32A RCBO', category: 'Distribution', baseLaborHours: 0.5, components: [] },
  { id: 'a2', name: 'Install 1-Gang Light Switch', category: 'Lighting', baseLaborHours: 0.5, components: [] },
];

describe('matchAssemblies', () => {
  it('matches an assembly by partial spoken name', () => {
    const results = matchAssemblies('RCBO', assemblies);
    expect(results[0]?.assembly.id).toBe('a1');
  });

  it('returns empty on no query', () => {
    expect(matchAssemblies('', assemblies)).toEqual([]);
  });
});

const locations: Location[] = [
  { id: 'f1', projectId: 'p1', name: 'Ground Floor', sortOrder: 0 },
  { id: 'f2', projectId: 'p1', name: 'First Floor', sortOrder: 1 },
  { id: 'r1', projectId: 'p1', parentId: 'f1', name: 'Kitchen', sortOrder: 0 },
  { id: 'r2', projectId: 'p1', parentId: 'f1', name: 'Lounge', sortOrder: 1 },
];

describe('matchLocations', () => {
  it('matches a floor by partial name', () => {
    const results = matchLocations('ground', locations.filter((l) => l.parentId == null));
    expect(results[0]?.location.id).toBe('f1');
  });

  it('matches a room by partial name', () => {
    const results = matchLocations('kitchen', locations.filter((l) => l.parentId != null));
    expect(results[0]?.location.id).toBe('r1');
  });
});

const snags: SnagItem[] = [
  { id: 's1', projectId: 'p1', description: 'Loose socket in the kitchen', resolved: false, sortOrder: 0, createdAt: 0 },
  { id: 's2', projectId: 'p1', description: 'Broken light switch in the lounge', resolved: false, sortOrder: 1, createdAt: 0 },
];

describe('matchSnags', () => {
  it('matches a snag by partial description', () => {
    const results = matchSnags('loose socket', snags);
    expect(results[0]?.snag.id).toBe('s1');
  });
});

const lines: LineItem[] = [
  { id: 'l1', description: '32A RCBO Single Pole', resolvedMaterialCostMinor: 1899, laborBaseHours: 0, quantity: 2, appliedLaborToggleIds: [] },
  { id: 'l2', description: 'Twin & Earth Cable 2.5mm Grey', resolvedMaterialCostMinor: 120, laborBaseHours: 0, quantityMeters: 50, appliedLaborToggleIds: [] },
];

describe('matchLines', () => {
  it('matches a line by partial description', () => {
    const results = matchLines('RCBO', lines);
    expect(results[0]?.line.id).toBe('l1');
  });
});
