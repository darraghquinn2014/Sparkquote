/**
 * Price parsing (spec §4.4 validation).
 *
 * Wholesaler cost columns are messy: "£12.50", "12,50" (EU decimal comma),
 * "1,250.00" (thousands), "  9.99 ", blanks, "POA". We parse to integer minor
 * units or report the cell as invalid — never silently coerce junk to 0, which
 * would under-price a job.
 */

export type PriceParseResult =
  | { ok: true; minor: number }
  | { ok: false; reason: string };

/**
 * Parse a raw cell value into integer minor units (pence/cent).
 * @param raw       the cell value (string or number)
 * @param decimalComma if true, treat comma as the decimal separator (EU files)
 */
export function parsePrice(raw: unknown, decimalComma = false): PriceParseResult {
  if (raw == null || raw === '') return { ok: false, reason: 'empty' };

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'not a finite number' };
    if (raw < 0) return { ok: false, reason: 'negative' };
    return { ok: true, minor: Math.round(raw * 100) };
  }

  if (typeof raw !== 'string') return { ok: false, reason: 'unsupported type' };

  let s = raw.trim();
  if (!s) return { ok: false, reason: 'empty' };

  // strip currency symbols and spaces
  s = s.replace(/[£€$\s]/g, '');

  if (decimalComma) {
    // EU style: dot is thousands, comma is decimal -> "1.250,00" => 1250.00
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // UK/IE style: comma is thousands -> "1,250.00" => 1250.00
    s = s.replace(/,/g, '');
  }

  if (!/^\d*\.?\d+$/.test(s)) return { ok: false, reason: `not a price: "${raw}"` };

  const value = parseFloat(s);
  if (!Number.isFinite(value)) return { ok: false, reason: `not a price: "${raw}"` };
  if (value < 0) return { ok: false, reason: 'negative' };

  return { ok: true, minor: Math.round(value * 100) };
}
