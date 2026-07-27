/**
 * Minor Electrical Installation Works Certificate — PDF HTML template.
 *
 * Field layout follows the standard BS7671 Model Form 3 structure (client
 * details, description of works, installation particulars, essential tests,
 * declaration). This is a first pass, NOT yet reviewed by a qualified
 * electrician — see the caveat on `Certificate`/`MinorWorksFields` in
 * src/domain/types.ts before relying on generated certificates as compliant.
 */

import type { MinorWorksCertificate } from '../domain/types';
import { escapeHtml } from './render-html';
import type { SignatureBlock } from './render-html';

export interface CertificateMeta {
  businessName?: string;
  logoDataUri?: string;
  projectName: string;
  projectAddress?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function yesNo(v: boolean | undefined): string {
  if (v === true) return 'Satisfactory';
  if (v === false) return 'Not satisfactory';
  return '—';
}

function num(v: number | undefined, unit: string): string {
  return v != null ? `${v} ${unit}` : '—';
}

export function renderMinorWorksCertificateHtml(
  cert: MinorWorksCertificate,
  meta: CertificateMeta,
  signature?: SignatureBlock,
): string {
  const f = cert.fields;
  const t = f.testResults;

  const signatureHtml = signature
    ? `
    <section class="signature">
      <div class="sig-label">Signed by the person responsible for this work</div>
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
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; font-size: 12.5px; line-height: 1.5; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px; }
  .logo { max-height: 56px; max-width: 180px; object-fit: contain; display: block; margin-bottom: 8px; }
  .business { font-size: 18px; font-weight: 700; }
  .doc-title { text-transform: uppercase; letter-spacing: 1.4px; font-size: 13px; font-weight: 700; margin-top: 4px; }
  .doc-subtitle { font-size: 10.5px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .meta { text-align: right; font-size: 11px; color: #555; }
  section.part { margin-bottom: 18px; }
  .part-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; }
  .field { padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
  .field.full { grid-column: 1 / -1; }
  .field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  .field-value { font-size: 13px; margin-top: 1px; }
  .test-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .test-table td { padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
  .test-table td.label { color: #555; }
  .test-table td.val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .declaration { font-size: 11.5px; color: #333; background: #f7f7f7; padding: 12px 14px; border-radius: 6px; }
  .signature { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 14px; }
  .sig-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }
  .sig-img { max-width: 220px; max-height: 90px; }
  .sig-meta { font-size: 11px; color: #555; margin-top: 4px; }
  .footer-note { margin-top: 28px; font-size: 9.5px; color: #aaa; text-align: center; }
</style>
</head>
<body>
  <div class="doc-head">
    <div>
      ${meta.logoDataUri ? `<img class="logo" src="${meta.logoDataUri}" alt="Logo" />` : ''}
      <div class="business">${escapeHtml(meta.businessName ?? '')}</div>
      <div class="doc-subtitle">BS 7671</div>
      <div class="doc-title">Minor Electrical Installation Works Certificate</div>
    </div>
    <div class="meta">
      ${meta.projectAddress ? escapeHtml(meta.projectAddress) + '<br/>' : ''}
      ${escapeHtml(formatDate(f.dateCompleted))}
    </div>
  </div>

  <section class="part">
    <div class="part-title">Part 1 — Description of the minor works</div>
    <div class="grid">
      <div class="field"><div class="field-label">Client</div><div class="field-value">${escapeHtml(f.clientName || '—')}</div></div>
      <div class="field"><div class="field-label">Client address</div><div class="field-value">${escapeHtml(f.clientAddress || meta.projectAddress || '—')}</div></div>
      <div class="field full"><div class="field-label">Description of the minor works</div><div class="field-value">${escapeHtml(f.descriptionOfWork || '—')}</div></div>
      <div class="field"><div class="field-label">Date completed</div><div class="field-value">${escapeHtml(formatDate(f.dateCompleted))}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Part 2 — Installation details</div>
    <div class="grid">
      <div class="field"><div class="field-label">System earthing arrangement</div><div class="field-value">${escapeHtml(f.systemEarthing || '—')}</div></div>
      <div class="field"><div class="field-label">Protective device</div><div class="field-value">${escapeHtml(f.protectiveDeviceType || '—')}${f.protectiveDeviceRatingA != null ? `, ${f.protectiveDeviceRatingA}A` : ''}</div></div>
      <div class="field full"><div class="field-label">Comments on existing installation</div><div class="field-value">${escapeHtml(f.existingInstallationComments || '—')}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Part 3 — Essential tests</div>
    <table class="test-table">
      <tr><td class="label">Continuity of protective conductors</td><td class="val">${num(t.continuityOhms, 'Ω')}</td></tr>
      <tr><td class="label">Insulation resistance — Line/Neutral</td><td class="val">${num(t.insulationResistanceLNMOhms, 'MΩ')}</td></tr>
      <tr><td class="label">Insulation resistance — Line/Earth</td><td class="val">${num(t.insulationResistanceLEMOhms, 'MΩ')}</td></tr>
      <tr><td class="label">Insulation resistance — Neutral/Earth</td><td class="val">${num(t.insulationResistanceNEMOhms, 'MΩ')}</td></tr>
      <tr><td class="label">Polarity</td><td class="val">${yesNo(t.polaritySatisfactory)}</td></tr>
      <tr><td class="label">Earth fault loop impedance (Zs)</td><td class="val">${num(t.zsOhms, 'Ω')}</td></tr>
      <tr><td class="label">RCD rated residual operating current</td><td class="val">${num(t.rcdRatedMa, 'mA')}</td></tr>
      <tr><td class="label">RCD disconnection time</td><td class="val">${num(t.rcdDisconnectionTimeMs, 'ms')}</td></tr>
    </table>
  </section>

  ${f.comments ? `<section class="part"><div class="part-title">Comments</div><div class="field-value">${escapeHtml(f.comments)}</div></section>` : ''}

  <section class="part">
    <div class="part-title">Part 4 — Declaration</div>
    <div class="declaration">
      I/We, being the person(s) responsible for the above work, certify that the work covered by this
      certificate has been designed, constructed, inspected and tested in accordance with BS 7671, and that
      the said work, to the best of my/our knowledge and belief, is in accordance with BS 7671, as amended,
      except as detailed above.
    </div>
    <div class="grid" style="margin-top: 10px;">
      <div class="field"><div class="field-label">Name</div><div class="field-value">${escapeHtml(f.signedByName || '—')}</div></div>
      <div class="field"><div class="field-label">For</div><div class="field-value">${escapeHtml(f.signedForCompany || meta.businessName || '—')}</div></div>
      ${f.nextInspectionRecommendedYears != null ? `<div class="field"><div class="field-label">Recommended next inspection</div><div class="field-value">${f.nextInspectionRecommendedYears} year${f.nextInspectionRecommendedYears === 1 ? '' : 's'}</div></div>` : ''}
    </div>
  </section>

  ${signatureHtml}

  <div class="footer-note">Generated with SparkQuote — ${escapeHtml(meta.projectName)}</div>
</body>
</html>`;
}
