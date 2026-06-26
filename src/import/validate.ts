/**
 * Import validation (spec §4.4).
 *
 * Turns raw sheet rows + a confirmed column mapping into validated Material
 * rows, plus a report of problems. The rule from the spec: flag issues for the
 * user to fix, never silently drop a row — a missing line in a price file means
 * a missing line in a quote.
 */

import type { RawMaterial } from '../data/mappers';
import type { ColumnMapping } from './column-mapping';
import { parsePrice } from './parse-price';

export interface RowIssue {
  /** 1-based row number as the user sees it in the spreadsheet. */
  rowNumber: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  /** Rows that passed and will be imported. */
  valid: RawMaterial[];
  /** Problems for the user to review. */
  issues: RowIssue[];
  /** Rows skipped as completely blank (not surfaced as errors). */
  blankRowsSkipped: number;
}

export interface ValidateOptions {
  catalogueId: string;
  decimalComma?: boolean;
  /** SKU prefix to detect duplicates within the same file. */
}

function cell(row: unknown[], col: number | null): unknown {
  if (col == null) return undefined;
  return row[col];
}

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => c == null || String(c).trim() === '');
}

/** Build a stable material id from catalogue + sku. */
function materialId(catalogueId: string, sku: string): string {
  return `mat_${catalogueId}_${sku.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

/**
 * Validate data rows (excluding the header row) against a mapping.
 *
 * @param rows      data rows (each an array of cell values)
 * @param mapping   confirmed column mapping
 * @param headerRowIndex 0-based index of the header row in the original sheet,
 *                  used to report user-facing row numbers correctly.
 */
export function validateRows(
  rows: unknown[][],
  mapping: ColumnMapping,
  options: ValidateOptions,
  headerRowIndex = 0,
): ValidationResult {
  const valid: RawMaterial[] = [];
  const issues: RowIssue[] = [];
  let blankRowsSkipped = 0;
  const seenSkus = new Map<string, number>(); // sku -> first row number

  rows.forEach((row, i) => {
    // user-facing row number: header row + offset + 1 (1-based) + 1 (data starts after header)
    const rowNumber = headerRowIndex + i + 2;

    if (isBlankRow(row)) {
      blankRowsSkipped += 1;
      return;
    }

    const sku = asString(cell(row, mapping.sku));
    const description = asString(cell(row, mapping.description));
    const unit = asString(cell(row, mapping.unit)) || 'each';
    const category = asString(cell(row, mapping.category)) || 'Uncategorised';

    let rowOk = true;

    if (!sku) {
      issues.push({ rowNumber, field: 'sku', message: 'Missing SKU / product code' });
      rowOk = false;
    }
    if (!description) {
      issues.push({ rowNumber, field: 'description', message: 'Missing description' });
      rowOk = false;
    }

    const priceResult = parsePrice(cell(row, mapping.unitCost), options.decimalComma);
    if (!priceResult.ok) {
      issues.push({
        rowNumber, field: 'unitCost',
        message: `Invalid unit cost (${priceResult.reason})`,
      });
      rowOk = false;
    }

    if (sku) {
      const firstSeen = seenSkus.get(sku);
      if (firstSeen != null) {
        issues.push({
          rowNumber, field: 'sku',
          message: `Duplicate SKU "${sku}" (first seen on row ${firstSeen})`,
        });
        rowOk = false;
      } else {
        seenSkus.set(sku, rowNumber);
      }
    }

    if (rowOk && priceResult.ok) {
      valid.push({
        id: materialId(options.catalogueId, sku),
        sku,
        description,
        unit,
        unit_cost_minor: priceResult.minor,
        catalogue_id: options.catalogueId,
      });
    }
  });

  return { valid, issues, blankRowsSkipped };
}
