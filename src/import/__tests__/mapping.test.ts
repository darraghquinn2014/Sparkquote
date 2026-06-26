import { describe, it, expect } from 'vitest';
import { suggestMapping, scoreHeader, missingRequiredFields, FIELD_SPECS } from '../column-mapping';
import { parsePrice } from '../parse-price';
import { detectHeaderRow } from '../parse-sheet';

describe('column mapping', () => {
  it('maps a clean wholesaler header row', () => {
    const m = suggestMapping(['SKU', 'Description', 'Trade Price', 'Unit', 'Category']);
    expect(m.sku).toBe(0);
    expect(m.description).toBe(1);
    expect(m.unitCost).toBe(2);
    expect(m.unit).toBe(3);
    expect(m.category).toBe(4);
  });

  it('handles reordered and aliased headers', () => {
    const m = suggestMapping(['Product Name', 'Net Price', 'Part No']);
    expect(m.description).toBe(0);
    expect(m.unitCost).toBe(1);
    expect(m.sku).toBe(2);
  });

  it('never maps two fields to the same column', () => {
    // "price" could tempt both; only unitCost should claim it
    const m = suggestMapping(['code', 'price']);
    const cols = [m.sku, m.description, m.unitCost, m.unit, m.category].filter((c) => c != null);
    expect(new Set(cols).size).toBe(cols.length);
  });

  it('leaves unmatched fields null and reports missing required', () => {
    const m = suggestMapping(['Mystery1', 'Mystery2']);
    expect(missingRequiredFields(m).sort()).toEqual(['description', 'sku', 'unitCost']);
  });

  it('scores exact match above partial above token overlap', () => {
    const unitCostSpec = FIELD_SPECS.find((s) => s.field === 'unitCost')!;
    const exact = scoreHeader('unit cost', unitCostSpec);
    const partial = scoreHeader('unit cost (ex vat)', unitCostSpec);
    const none = scoreHeader('colour', unitCostSpec);
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(none);
    expect(none).toBe(0);
  });
});

describe('parsePrice', () => {
  it('parses plain decimals', () => {
    expect(parsePrice('12.50')).toEqual({ ok: true, minor: 1250 });
    expect(parsePrice('9.99')).toEqual({ ok: true, minor: 999 });
  });
  it('parses numbers directly', () => {
    expect(parsePrice(12.5)).toEqual({ ok: true, minor: 1250 });
  });
  it('strips currency symbols and spaces', () => {
    expect(parsePrice(' £12.50 ')).toEqual({ ok: true, minor: 1250 });
    expect(parsePrice('€8.00')).toEqual({ ok: true, minor: 800 });
  });
  it('handles UK thousands separators', () => {
    expect(parsePrice('1,250.00')).toEqual({ ok: true, minor: 125000 });
  });
  it('handles EU decimal comma when flagged', () => {
    expect(parsePrice('1.250,00', true)).toEqual({ ok: true, minor: 125000 });
    expect(parsePrice('12,50', true)).toEqual({ ok: true, minor: 1250 });
  });
  it('rejects junk, blanks, and negatives', () => {
    expect(parsePrice('POA').ok).toBe(false);
    expect(parsePrice('').ok).toBe(false);
    expect(parsePrice(null).ok).toBe(false);
    expect(parsePrice('-5.00').ok).toBe(false);
  });
});

describe('detectHeaderRow', () => {
  it('finds headers below a title/logo row', () => {
    const rows: unknown[][] = [
      ['ACME Electrical Wholesale', '', ''],       // title row
      ['SKU', 'Description', 'Price'],              // real headers
      ['SW1', '1g switch', '1.80'],
    ];
    expect(detectHeaderRow(rows)).toBe(1);
  });
  it('defaults to row 0 for a clean file', () => {
    const rows: unknown[][] = [
      ['SKU', 'Description', 'Price'],
      ['SW1', '1g switch', '1.80'],
    ];
    expect(detectHeaderRow(rows)).toBe(0);
  });
});
