/**
 * useImportWizard — drives the column-mapping wizard (spec §4.4).
 *
 * Holds the parsed sheet and the in-progress mapping, and derives a LIVE
 * preview (first few rows mapped to materials) plus a validation summary that
 * both update as the user adjusts the mapping. All the heavy logic is the pure
 * import modules; this hook is orchestration + React state.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ParsedSheet } from '../../import/parse-sheet';
import {
  suggestMapping, missingRequiredFields,
  type CanonicalField, type ColumnMapping,
} from '../../import/column-mapping';
import { validateRows, type ValidationResult } from '../../import/validate';
import type { RawMaterial } from '../../data/mappers';

export interface ImportWizardState {
  headers: string[];
  mapping: ColumnMapping;
  setColumn: (field: CanonicalField, col: number | null) => void;
  /** First N rows mapped to materials, for the live preview table. */
  previewRows: RawMaterial[];
  validation: ValidationResult;
  missingRequired: CanonicalField[];
  canCommit: boolean;
  decimalComma: boolean;
  setDecimalComma: (on: boolean) => void;
}

const PREVIEW_LIMIT = 5;

export function useImportWizard(
  sheet: ParsedSheet,
  catalogueId: string,
): ImportWizardState {
  const [mapping, setMapping] = useState<ColumnMapping>(() => suggestMapping(sheet.headers));
  const [decimalComma, setDecimalComma] = useState(false);

  const setColumn = useCallback((field: CanonicalField, col: number | null) => {
    setMapping((prev) => {
      const next = { ...prev, [field]: col };
      // keep columns unique: if another field already used this col, clear it
      if (col != null) {
        for (const k of Object.keys(next) as CanonicalField[]) {
          if (k !== field && next[k] === col) next[k] = null;
        }
      }
      return next;
    });
  }, []);

  const validation = useMemo(
    () => validateRows(sheet.rows, mapping, { catalogueId, decimalComma }, sheet.headerRowIndex),
    [sheet.rows, sheet.headerRowIndex, mapping, catalogueId, decimalComma],
  );

  const previewRows = useMemo(
    () => validateRows(sheet.rows.slice(0, PREVIEW_LIMIT), mapping, { catalogueId, decimalComma }, sheet.headerRowIndex).valid,
    [sheet.rows, sheet.headerRowIndex, mapping, catalogueId, decimalComma],
  );

  const missingRequired = useMemo(() => missingRequiredFields(mapping), [mapping]);
  const canCommit = missingRequired.length === 0 && validation.valid.length > 0;

  return {
    headers: sheet.headers,
    mapping,
    setColumn,
    previewRows,
    validation,
    missingRequired,
    canCommit,
    decimalComma,
    setDecimalComma,
  };
}
