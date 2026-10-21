import { describe, it, expect } from 'vitest';
import { toClientEstimate, roomLabels } from '../client-view-model';
import { renderEstimateHtml, escapeHtml } from '../render-html';
import { priceEstimate } from '../../domain/pricing';
import type { Estimate, LaborToggle, LineItem, Location } from '../../domain/types';

const toggles: LaborToggle[] = [
  { id: 'tgl_height', label: 'Working Height', type: 'percentage', value: 0.15, appliesTo: 'line' },
];

function line(over: Partial<LineItem> = {}): LineItem {
  return {
    id: 'l1', description: 'Replace double socket', sourceAssemblyId: 'a1',
    resolvedMaterialCostMinor: 410, laborBaseHours: 0.4, quantity: 1,
    appliedLaborToggleIds: [], ...over,
  };
}

function estimate(lines: LineItem[]): Estimate {
  return {
    id: 'e1', mode: 'quick', status: 'draft', currency: 'GBP',
    hourlyRateMinor: 5000, vatRatePct: 20, appliedLaborToggleIds: [], lineItems: lines,
  };
}

describe('toClientEstimate', () => {
  it('exposes only client-safe fields', () => {
    const est = estimate([line({ overrides: { markupPct: 30 } })]);
    const priced = priceEstimate(est, toggles);
    const client = toClientEstimate(est, priced);

    expect(client.lines[0]).toEqual({
      description: 'Replace double socket',
      quantityLabel: '1',
      lineTotalMinor: priced.lines[0]!.lineTotalMinor,
    });
    // structurally cannot contain internal numbers
    expect(client.lines[0]).not.toHaveProperty('materialTotalMinor');
    expect(client.lines[0]).not.toHaveProperty('markupAmountMinor');
    expect(client.lines[0]).not.toHaveProperty('labor');
  });

  it('labels linear containment quantities in metres', () => {
    const { quantity, ...rest } = line({ id: 'l2', description: 'PVC trunking', resolvedMaterialCostMinor: 540 });
    const trunking: LineItem = { ...rest, quantityMeters: 12 };
    const est = estimate([trunking]);
    const client = toClientEstimate(est, priceEstimate(est, toggles));
    expect(client.lines[0]!.quantityLabel).toBe('12 m');
  });

  it('carries totals and metadata', () => {
    const est = estimate([line()]);
    const client = toClientEstimate(est, priceEstimate(est, toggles), {
      businessName: 'Watts Electrical', clientName: 'Acme Ltd', reference: 'Q-1001',
    });
    expect(client.businessName).toBe('Watts Electrical');
    expect(client.clientName).toBe('Acme Ltd');
    expect(client.grandTotalMinor).toBeGreaterThan(0);
  });
});

describe('per-room sections', () => {
  const loc = (id: string, name: string, parentId?: string): Location =>
    ({ id, projectId: 'p1', name, parentId, createdAt: 0 }) as unknown as Location;
  const oneFloor = [loc('f1', 'Ground Floor'), loc('kit', 'Kitchen', 'f1'), loc('liv', 'Living Room', 'f1')];

  it('labels rooms by name, prefixing the floor only when there are several', () => {
    expect([...roomLabels(oneFloor).values()]).toEqual(['Kitchen', 'Living Room']);
    const twoFloors = [...oneFloor, loc('f2', 'First Floor'), loc('bed', 'Bedroom', 'f2')];
    expect([...roomLabels(twoFloors).values()]).toEqual([
      'Ground Floor · Kitchen', 'Ground Floor · Living Room', 'First Floor · Bedroom',
    ]);
  });

  it('groups lines by room in room order with subtotals, unassigned lines last under General', () => {
    const est = estimate([
      line({ id: 'a', description: 'Living socket', locationId: 'liv' }),
      line({ id: 'b', description: 'Callout', locationId: undefined }),
      line({ id: 'c', description: 'Kitchen socket', locationId: 'kit' }),
      line({ id: 'd', description: 'Kitchen light', locationId: 'kit' }),
    ]);
    const priced = priceEstimate(est, toggles);
    const total = (id: string) => priced.lines.find((l) => l.lineId === id)!.lineTotalMinor;
    const client = toClientEstimate(est, priced, { roomLabels: roomLabels(oneFloor) });

    expect(client.sections!.map((s) => s.title)).toEqual(['Kitchen', 'Living Room', 'General']);
    expect(client.sections![0]!.lines.map((l) => l.description)).toEqual(['Kitchen socket', 'Kitchen light']);
    expect(client.sections![0]!.subtotalMinor).toBe(total('c') + total('d'));
    // flat list is unchanged
    expect(client.lines).toHaveLength(4);
  });

  it('keeps same-named rooms as separate sections', () => {
    const rooms = [loc('f1', 'Ground Floor'), loc('b1', 'Bedroom', 'f1'), loc('b2', 'Bedroom', 'f1')];
    const est = estimate([line({ id: 'x', locationId: 'b1' }), line({ id: 'y', locationId: 'b2' })]);
    const client = toClientEstimate(est, priceEstimate(est, toggles), { roomLabels: roomLabels(rooms) });
    expect(client.sections).toHaveLength(2);
  });

  it('quick quotes stay a flat list', () => {
    const est = estimate([line()]);
    expect(toClientEstimate(est, priceEstimate(est, toggles)).sections).toBeUndefined();
  });

  it('renders a heading and total per room', () => {
    const est = estimate([line({ id: 'c', description: 'Kitchen socket', locationId: 'kit' })]);
    const html = renderEstimateHtml(toClientEstimate(est, priceEstimate(est, toggles), { roomLabels: roomLabels(oneFloor) }));
    expect(html).toContain('<tr class="section-head"><td colspan="3">Kitchen</td></tr>');
    expect(html).toContain('Kitchen total');
    expect(html).not.toContain('Living Room');
  });
});

describe('renderEstimateHtml — NO LEAK guarantee', () => {
  it('never renders internal cost numbers, markup, or labour breakdown', () => {
    // line with a big markup and override so internal numbers are distinctive
    const est = estimate([
      line({ overrides: { unitCostMinor: 999, markupPct: 75 }, appliedLaborToggleIds: ['tgl_height'] }),
    ]);
    const priced = priceEstimate(est, toggles);
    const client = toClientEstimate(est, priced);
    const html = renderEstimateHtml(client);

    const b = priced.lines[0]!;
    // the internal figures, as pence strings, must not appear anywhere
    const internalPence = [
      String(b.unitMaterialCostMinor),
      String(b.markupAmountMinor),
      String(b.materialTotalMinor),
      String(b.labor.costMinor),
    ];
    for (const n of internalPence) {
      // guard against trivial matches: only meaningful for multi-digit values
      if (n.length >= 3) expect(html).not.toContain(n);
    }
    // the client line total SHOULD be present (formatted)
    expect(html).toContain('Replace double socket');
  });

  it('renders a single-column structure with summary and total', () => {
    const est = estimate([line(), line({ id: 'l2', description: 'Add lighting point' })]);
    const client = toClientEstimate(est, priceEstimate(est, toggles), { businessName: 'Watts Electrical' });
    const html = renderEstimateHtml(client);
    expect(html).toContain('Watts Electrical');
    expect(html).toContain('Subtotal');
    expect(html).toContain('VAT (20%)');
    expect(html).toContain('Total');
    expect(html).toContain('Add lighting point');
  });

  it('omits the VAT row when rate is zero', () => {
    const est = { ...estimate([line()]), vatRatePct: 0 };
    const client = toClientEstimate(est, priceEstimate(est, toggles));
    expect(renderEstimateHtml(client)).not.toContain('VAT (');
  });

  it('embeds a signature block only when provided', () => {
    const est = estimate([line()]);
    const client = toClientEstimate(est, priceEstimate(est, toggles));
    const without = renderEstimateHtml(client);
    expect(without).not.toContain('Accepted');

    const withSig = renderEstimateHtml(client, {
      dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANS',
      signedByName: 'J. Client', signedDateIso: '2026-06-23',
    });
    expect(withSig).toContain('Accepted');
    expect(withSig).toContain('data:image/png;base64,iVBORw0KGgoAAAANS');
    expect(withSig).toContain('J. Client');
  });
});

describe('escapeHtml', () => {
  it('escapes injection characters in descriptions', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });

  it('a malicious line description cannot inject markup', () => {
    const est = estimate([line({ description: '<img src=x onerror=alert(1)>' })]);
    const client = toClientEstimate(est, priceEstimate(est, toggles));
    const html = renderEstimateHtml(client);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
