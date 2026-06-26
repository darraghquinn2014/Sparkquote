/**
 * Column mapping (spec §4.4) — the heart of the import engine.
 *
 * Wholesaler spreadsheets are wildly inconsistent: different column names,
 * orders, casing, and extra junk columns. A rigid importer fails on the second
 * file it meets. So we AUTO-SUGGEST a mapping by fuzzy-matching detected headers
 * against our canonical fields, then let the user confirm or correct (the UI
 * step). This module is the pure suggestion + scoring logic.
 */

/** The fields SparkQuote needs to build a Material. */
export type CanonicalField = 'sku' | 'description' | 'unitCost' | 'unit' | 'category';

export interface FieldSpec {
  field: CanonicalField;
  label: string;
  required: boolean;
  /** Lowercased aliases we expect to see in wholesaler headers. */
  aliases: string[];
}

export const FIELD_SPECS: FieldSpec[] = [
  {
    field: 'sku', label: 'SKU / Product code', required: true,
    aliases: ['sku', 'code', 'product code', 'item code', 'part number', 'part no', 'partno', 'ref', 'reference', 'catalogue no', 'cat no', 'stock code'],
  },
  {
    field: 'description', label: 'Description', required: true,
    aliases: ['description', 'desc', 'name', 'product', 'product name', 'item', 'item description', 'details'],
  },
  {
    field: 'unitCost', label: 'Unit cost', required: true,
    aliases: ['unit cost', 'cost', 'price', 'unit price', 'trade price', 'nett', 'net price', 'buy price', 'each', 'cost each', 'list price', 'amount'],
  },
  {
    field: 'unit', label: 'Unit of measure', required: false,
    aliases: ['unit', 'uom', 'unit of measure', 'measure', 'pack', 'pack size', 'per'],
  },
  {
    field: 'category', label: 'Category', required: false,
    aliases: ['category', 'cat', 'group', 'type', 'class', 'department', 'section'],
  },
];

/** Mapping from a canonical field to a column index in the sheet (or null). */
export type ColumnMapping = Record<CanonicalField, number | null>;

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[._\-/]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Score how well a header matches a field spec. 0 = no match, higher = better.
 *  - exact alias match scores highest
 *  - header contains an alias (or vice-versa) scores mid
 *  - token overlap scores low
 */
export function scoreHeader(header: string, spec: FieldSpec): number {
  const h = normalise(header);
  if (!h) return 0;

  for (const alias of spec.aliases) {
    if (h === alias) return 100;
  }
  for (const alias of spec.aliases) {
    if (h.includes(alias) || alias.includes(h)) return 60;
  }
  // token overlap
  const hTokens = new Set(h.split(' '));
  let overlap = 0;
  for (const alias of spec.aliases) {
    for (const tok of alias.split(' ')) {
      if (hTokens.has(tok)) overlap += 1;
    }
  }
  return overlap > 0 ? 20 + overlap : 0;
}

/**
 * Suggest a column mapping from detected headers.
 *
 * Greedy by descending score, and crucially each column maps to AT MOST one
 * field and each field to at most one column — so a "Price" column can't be
 * claimed by both unitCost and (wrongly) something else, and two columns don't
 * both fill unitCost.
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { sku: null, description: null, unitCost: null, unit: null, category: null };

  type Candidate = { field: CanonicalField; col: number; score: number };
  const candidates: Candidate[] = [];

  FIELD_SPECS.forEach((spec) => {
    headers.forEach((header, col) => {
      const score = scoreHeader(header, spec);
      if (score > 0) candidates.push({ field: spec.field, col, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  const usedCols = new Set<number>();
  const filledFields = new Set<CanonicalField>();

  for (const c of candidates) {
    if (filledFields.has(c.field) || usedCols.has(c.col)) continue;
    mapping[c.field] = c.col;
    filledFields.add(c.field);
    usedCols.add(c.col);
  }

  return mapping;
}

/** Which required fields are still unmapped. */
export function missingRequiredFields(mapping: ColumnMapping): CanonicalField[] {
  return FIELD_SPECS.filter((s) => s.required && mapping[s.field] == null).map((s) => s.field);
}
