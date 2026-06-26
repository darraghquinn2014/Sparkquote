/**
 * Spreadsheet parser (spec §4.4 step 1).
 *
 * Thin wrapper over SheetJS. Reads the first sheet, finds the most likely
 * header row (the first row with several non-empty text cells — wholesaler
 * files often have a title/logo row above the real headers), and returns the
 * headers plus the data rows beneath. Pure given the SheetJS workbook, so the
 * header-detection heuristic is unit-tested with hand-built row arrays.
 */

import * as XLSX from 'xlsx';

export interface ParsedSheet {
  headers: string[];
  rows: unknown[][];
  /** 0-based index of the detected header row in the original sheet. */
  headerRowIndex: number;
}

/** Score a row's likelihood of being the header (text-heavy, few blanks). */
function headerScore(row: unknown[]): number {
  let textCells = 0;
  let numberCells = 0;
  for (const c of row) {
    if (c == null || String(c).trim() === '') continue;
    if (typeof c === 'number' || /^[£€$]?[\d.,\s]+$/.test(String(c))) numberCells += 1;
    else textCells += 1;
  }
  // headers are mostly short text labels, not numbers
  return textCells - numberCells * 0.5;
}

/** Find the header row among the first several rows. */
export function detectHeaderRow(allRows: unknown[][]): number {
  const limit = Math.min(allRows.length, 10);
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < limit; i++) {
    const s = headerScore(allRows[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/** Parse a workbook (already loaded) into headers + data rows. */
export function parseWorkbook(workbook: XLSX.WorkBook): ParsedSheet {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [], headerRowIndex: 0 };
  }
  const sheet = workbook.Sheets[firstSheetName]!;
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

  if (allRows.length === 0) return { headers: [], rows: [], headerRowIndex: 0 };

  const headerRowIndex = detectHeaderRow(allRows);
  const headers = (allRows[headerRowIndex] ?? []).map((c) => String(c ?? '').trim());
  const rows = allRows.slice(headerRowIndex + 1);

  return { headers, rows, headerRowIndex };
}

/** Parse raw file bytes (xlsx/xls/csv) into a sheet. */
export function parseFileBytes(data: ArrayBuffer | Uint8Array): ParsedSheet {
  const workbook = XLSX.read(data, { type: 'array' });
  return parseWorkbook(workbook);
}
