/**
 * PDF HTML template (spec §10).
 *
 * Produces the single-column, client-facing HTML that expo-print renders to a
 * PDF. Pure string output from a ClientEstimate, so the layout, escaping, and
 * signature embedding are unit-tested without a print engine.
 *
 * The template can ONLY render a ClientEstimate — it has no access to internal
 * costs or photos, because those aren't in the type. Margin protection is
 * structural, not a matter of remembering to omit a column here.
 */

import type { ClientEstimate } from './client-view-model';
import { formatMoney } from '../domain/money';

/** Escape user/text content for safe HTML embedding. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SignatureBlock {
  /** base64 PNG data URI of the finger signature. */
  dataUri: string;
  signedByName?: string;
  signedDateIso?: string;
}

function money(estimate: ClientEstimate, minor: number): string {
  return formatMoney(minor, estimate.currency);
}

/** Build the client PDF HTML. Signature block is appended only when provided. */
export function renderEstimateHtml(
  estimate: ClientEstimate,
  signature?: SignatureBlock,
): string {
  const rows = estimate.lines
    .map(
      (l) => `
      <tr>
        <td class="desc">${escapeHtml(l.description)}</td>
        <td class="qty">${escapeHtml(l.quantityLabel)}</td>
        <td class="amt">${money(estimate, l.lineTotalMinor)}</td>
      </tr>`,
    )
    .join('');

  const vatRow =
    estimate.vatRatePct > 0
      ? `<tr><td class="sum-label">VAT (${estimate.vatRatePct}%)</td><td class="sum-amt">${money(estimate, estimate.vatAmountMinor)}</td></tr>`
      : '';
  const laborNote =
    estimate.laborTotalMinor != null
      ? `<tr class="labor-note"><td class="sum-label">Includes labour</td><td class="sum-amt">${money(estimate, estimate.laborTotalMinor)}</td></tr>`
      : '';

  const headerMeta = [
    estimate.reference ? `Ref ${escapeHtml(estimate.reference)}` : '',
    estimate.dateIso ? escapeHtml(formatDate(estimate.dateIso)) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const signatureHtml = signature
    ? `
    <section class="signature">
      <div class="sig-label">Accepted &amp; signed</div>
      <img class="sig-img" src="${signature.dataUri}" alt="Signature" />
      <div class="sig-meta">
        ${signature.signedByName ? escapeHtml(signature.signedByName) : ''}
        ${signature.signedDateIso ? ' · ' + escapeHtml(formatDate(signature.signedDateIso)) : ''}
      </div>
    </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; font-size: 13px; line-height: 1.5; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .business { font-size: 20px; font-weight: 700; }
  .doc-title { text-transform: uppercase; letter-spacing: 2px; font-size: 11px; color: #666; }
  .meta { text-align: right; font-size: 12px; color: #555; }
  .client { margin-bottom: 24px; }
  .client-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; }
  .client-name { font-size: 15px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #ddd; padding: 8px 0; }
  thead th.amt, thead th.qty { text-align: right; }
  tbody td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  td.qty, td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.qty { width: 70px; color: #555; }
  td.amt { width: 110px; font-weight: 600; }
  .summary { margin-top: 16px; margin-left: auto; width: 260px; }
  .summary table { width: 100%; }
  .summary td { padding: 6px 0; }
  .sum-label { color: #555; }
  .sum-amt { text-align: right; font-variant-numeric: tabular-nums; }
  .grand td { border-top: 2px solid #1a1a1a; padding-top: 10px; font-size: 16px; font-weight: 700; }
  .labor-note td { font-size: 11px; color: #888; font-style: italic; font-weight: 400; padding-top: 6px; border-top: none; }
  .signature { margin-top: 48px; border-top: 1px solid #ddd; padding-top: 16px; }
  .sig-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }
  .sig-img { max-width: 240px; max-height: 100px; }
  .sig-meta { font-size: 12px; color: #555; margin-top: 4px; }
</style>
</head>
<body>
  <div class="doc-head">
    <div>
      <div class="business">${escapeHtml(estimate.businessName ?? 'Estimate')}</div>
      <div class="doc-title">Estimate</div>
    </div>
    <div class="meta">${headerMeta}</div>
  </div>

  ${estimate.clientName ? `<div class="client"><div class="client-label">Prepared for</div><div class="client-name">${escapeHtml(estimate.clientName)}</div></div>` : ''}

  <table>
    <thead>
      <tr><th class="desc">Description</th><th class="qty">Qty</th><th class="amt">Amount</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <div class="summary">
    <table>
      <tr><td class="sum-label">Subtotal</td><td class="sum-amt">${money(estimate, estimate.subtotalMinor)}</td></tr>
      ${vatRow}
      <tr class="grand"><td>Total</td><td class="sum-amt">${money(estimate, estimate.grandTotalMinor)}</td></tr>
      ${laborNote}
    </table>
  </div>

  ${signatureHtml}
</body>
</html>`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
