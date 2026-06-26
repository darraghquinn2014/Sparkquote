import { describe, it, expect, vi } from 'vitest';
import { validateRows } from '../validate';
import { planImport, commitImport, type CatalogueRepository } from '../commit';
import { suggestMapping } from '../column-mapping';
import type { RawMaterial } from '../../data/mappers';
import type { Assembly, Estimate, Material } from '../../domain/types';

describe('validateRows', () => {
  const mapping = suggestMapping(['SKU', 'Description', 'Price', 'Unit']);
  const opts = { catalogueId: 'wholesale-x' };

  it('produces valid materials from clean rows', () => {
    const rows: unknown[][] = [
      ['SW1', '1-gang switch', '1.80', 'each'],
      ['SKT2', 'Double socket', '3.20', 'each'],
    ];
    const r = validateRows(rows, mapping, opts);
    expect(r.valid).toHaveLength(2);
    expect(r.valid[0]).toMatchObject({ sku: 'SW1', unit_cost_minor: 180, catalogue_id: 'wholesale-x' });
    expect(r.issues).toHaveLength(0);
  });

  it('flags bad rows with user-facing row numbers, does not drop silently', () => {
    const rows: unknown[][] = [
      ['SW1', '1-gang switch', '1.80', 'each'], // row 2 ok
      ['', 'no sku', '2.00', 'each'],           // row 3 missing sku
      ['SW3', '', '3.00', 'each'],              // row 4 missing description
      ['SW4', 'bad price', 'POA', 'each'],      // row 5 bad price
    ];
    const r = validateRows(rows, mapping, opts);
    expect(r.valid).toHaveLength(1);
    expect(r.issues).toEqual([
      { rowNumber: 3, field: 'sku', message: 'Missing SKU / product code' },
      { rowNumber: 4, field: 'description', message: 'Missing description' },
      { rowNumber: 5, field: 'unitCost', message: expect.stringContaining('Invalid unit cost') },
    ]);
  });

  it('detects duplicate SKUs within the file', () => {
    const rows: unknown[][] = [
      ['SW1', 'first', '1.80', 'each'],
      ['SW1', 'dupe', '1.90', 'each'],
    ];
    const r = validateRows(rows, mapping, opts);
    expect(r.valid).toHaveLength(1);
    expect(r.issues[0]!.message).toContain('Duplicate SKU');
  });

  it('skips fully blank rows without flagging them', () => {
    const rows: unknown[][] = [
      ['SW1', 'switch', '1.80', 'each'],
      ['', '', '', ''],
    ];
    const r = validateRows(rows, mapping, opts);
    expect(r.valid).toHaveLength(1);
    expect(r.blankRowsSkipped).toBe(1);
    expect(r.issues).toHaveLength(0);
  });

  it('defaults unit and category when unmapped', () => {
    const m2 = suggestMapping(['SKU', 'Description', 'Price']); // no unit/category
    const r = validateRows([['SW1', 'switch', '1.80']], m2, opts);
    expect(r.valid[0]!.unit).toBe('each');
  });

  it('reports correct row numbers when headers are below a title row', () => {
    // header detected on sheet row index 2 -> first data row is sheet row 4
    const r = validateRows([['', 'no sku', '2.00', 'each']], mapping, opts, 2);
    expect(r.issues[0]!.rowNumber).toBe(4);
  });
});

describe('planImport + commitImport (cascade)', () => {
  const cable: Material = { id: 'mat_te25', sku: 'TE25', description: 'T&E 2.5', unit: 'm', unitCostMinor: 95, catalogueId: 'c1' };
  const sw: Material = { id: 'mat_sw', sku: 'SW1', description: 'switch', unit: 'each', unitCostMinor: 180, catalogueId: 'c1' };
  const existing = [cable, sw];

  const assembly: Assembly = {
    id: 'a1', name: 'Switch', category: 'Lighting', baseLaborHours: 0.5,
    components: [
      { materialId: 'mat_sw', quantity: 1 },
      { materialId: 'mat_te25', quantity: 5 },
    ],
  };

  // snapshot when added: 180 + 95×5 = 655
  function estimate(status: Estimate['status'], id = 'e1'): Estimate {
    return {
      id, mode: 'quick', status, currency: 'GBP', hourlyRateMinor: 5000, vatRatePct: 20,
      appliedLaborToggleIds: [],
      lineItems: [{
        id: `${id}_l1`, description: 'Switch', sourceAssemblyId: 'a1',
        resolvedMaterialCostMinor: 655, laborBaseHours: 0.5, quantity: 1, appliedLaborToggleIds: [],
      }],
    };
  }

  // new price file: cable rises 95 -> 120 (assembly now 180 + 120×5 = 780)
  const newRaw: RawMaterial[] = [
    { id: 'mat_te25', sku: 'TE25', description: 'T&E 2.5', unit: 'm', unit_cost_minor: 120, catalogue_id: 'c1' },
  ];

  it('plans added/updated counts and retains omitted materials', () => {
    const plan = planImport(newRaw, existing, [assembly], []);
    expect(plan.updated).toBe(1);   // cable price changed
    expect(plan.added).toBe(0);
    expect(plan.retained).toBe(1);  // SW1 not in new file, kept
  });

  it('reports draft impact and freezes sent/signed', () => {
    const plan = planImport(newRaw, existing, [assembly], [
      estimate('draft', 'd1'),
      estimate('sent', 's1'),
      estimate('signed', 'g1'),
    ]);
    expect(plan.draftImpacts).toHaveLength(1);
    expect(plan.draftImpacts[0]!.drifts[0]).toMatchObject({ snapshotMinor: 655, liveMinor: 780 });
    expect(plan.frozenImpacts).toHaveLength(2); // sent + signed reported but frozen
  });

  it('commit refreshes drafts and never touches sent/signed', async () => {
    const repo: CatalogueRepository = { commitImport: vi.fn().mockResolvedValue(undefined) };
    const estimates = [estimate('draft', 'd1'), estimate('sent', 's1')];

    const result = await commitImport(repo, newRaw, existing, [assembly], estimates, true);

    expect(result.refreshedDraftIds).toEqual(['d1']);
    const calls = (repo.commitImport as ReturnType<typeof vi.fn>).mock.calls;
    const callArg = calls[0]![0];
    expect(callArg.materials).toBe(newRaw);
    expect(callArg.refreshedDrafts).toHaveLength(1);
    expect(callArg.refreshedDrafts[0].id).toBe('d1');
    expect(callArg.refreshedDrafts[0].lineItems[0].resolvedMaterialCostMinor).toBe(780);
  });

  it('with autoRefresh off, no drafts are refreshed (UI will prompt)', async () => {
    const repo: CatalogueRepository = { commitImport: vi.fn().mockResolvedValue(undefined) };
    const result = await commitImport(repo, newRaw, existing, [assembly], [estimate('draft', 'd1')], false);
    expect(result.refreshedDraftIds).toEqual([]);
  });
});
