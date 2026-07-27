/**
 * Electrical Installation Certificate (EIC) — PDF HTML template.
 *
 * Field layout follows the standard BS7671 Model Form 1 structure, simplified
 * per the caveat on EicFields in src/domain/types.ts: one combined
 * declaration (not separate Design/Construction/Inspection & Testing
 * signatories), and the Schedule of Test Results only (no Schedule of
 * Inspections checklist yet). Each circuit renders as its own card rather
 * than a giant multi-column table — more legible on an A4 print than a
 * cramped spreadsheet-style row would be.
 *
 * NOT yet reviewed by a qualified electrician — see the caveat in
 * src/domain/types.ts before relying on generated certificates as compliant.
 */

import type { EicCertificate } from '../domain/types';
import { escapeHtml } from './render-html';
import type { SignatureBlock } from './render-html';
import type { CertificateMeta } from './render-certificate';

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

function installationTypeLabel(t: EicCertificate['fields']['installationType']): string {
  switch (t) {
    case 'new': return 'New installation';
    case 'alteration': return 'Alteration';
    case 'addition': return 'Addition';
    default: return '—';
  }
}

export function renderEicCertificateHtml(
  cert: EicCertificate,
  meta: CertificateMeta,
  signature?: SignatureBlock,
): string {
  const f = cert.fields;
  const roles = [
    f.declarationRoles.design && 'Design',
    f.declarationRoles.construction && 'Construction',
    f.declarationRoles.inspectionAndTesting && 'Inspection & Testing',
  ].filter(Boolean) as string[];

  const circuitCards = f.circuits
    .map(
      (c, i) => `
    <div class="circuit-card">
      <div class="circuit-head">Circuit ${escapeHtml(c.circuitNumber || String(i + 1))} — ${escapeHtml(c.description || 'Untitled')}</div>
      <div class="grid">
        <div class="field"><div class="field-label">Wiring type</div><div class="field-value">${escapeHtml(c.wiringType || '—')}</div></div>
        <div class="field"><div class="field-label">CSA — Line / CPC</div><div class="field-value">${c.csaLineMm2 != null ? `${c.csaLineMm2} mm²` : '—'} / ${c.csaCpcMm2 != null ? `${c.csaCpcMm2} mm²` : '—'}</div></div>
        <div class="field"><div class="field-label">Protective device</div><div class="field-value">${escapeHtml(c.protectiveDeviceType || '—')}${c.protectiveDeviceRatingA != null ? `, ${c.protectiveDeviceRatingA}A` : ''}</div></div>
        <div class="field"><div class="field-label">Max permitted Zs</div><div class="field-value">${num(c.maxPermittedZsOhms, 'Ω')}</div></div>
        <div class="field"><div class="field-label">Continuity (R1+R2/R2)</div><div class="field-value">${num(c.continuityOhms, 'Ω')}</div></div>
        <div class="field"><div class="field-label">Insulation resistance</div><div class="field-value">${num(c.insulationResistanceMOhms, 'MΩ')}</div></div>
        <div class="field"><div class="field-label">Polarity</div><div class="field-value">${yesNo(c.polaritySatisfactory)}</div></div>
        <div class="field"><div class="field-label">Measured Zs</div><div class="field-value">${num(c.measuredZsOhms, 'Ω')}</div></div>
        <div class="field"><div class="field-label">RCD Iδn / disconnection</div><div class="field-value">${num(c.rcdRatedMa, 'mA')} / ${num(c.rcdDisconnectionTimeMs, 'ms')}</div></div>
      </div>
    </div>`,
    )
    .join('');

  const signatureHtml = signature
    ? `
    <section class="signature">
      <div class="sig-label">Signed by the person(s) responsible for the checked role(s) above</div>
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
  .circuit-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .circuit-head { font-size: 12.5px; font-weight: 700; margin-bottom: 6px; }
  .roles { font-size: 12px; margin-bottom: 6px; }
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
      <div class="doc-title">Electrical Installation Certificate</div>
    </div>
    <div class="meta">
      ${installationTypeLabel(f.installationType)}<br/>
      ${escapeHtml(formatDate(f.dateCompleted))}
    </div>
  </div>

  <section class="part">
    <div class="part-title">Part 1 — Client &amp; installation</div>
    <div class="grid">
      <div class="field"><div class="field-label">Client</div><div class="field-value">${escapeHtml(f.clientName || '—')}</div></div>
      <div class="field"><div class="field-label">Client address</div><div class="field-value">${escapeHtml(f.clientAddress || meta.projectAddress || '—')}</div></div>
      <div class="field full"><div class="field-label">Installation address (if different)</div><div class="field-value">${escapeHtml(f.installationAddress || '—')}</div></div>
      <div class="field full"><div class="field-label">Description of the installation covered by this certificate</div><div class="field-value">${escapeHtml(f.descriptionOfInstallation || '—')}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Part 2 — Supply characteristics</div>
    <div class="grid">
      <div class="field"><div class="field-label">System earthing arrangement</div><div class="field-value">${escapeHtml(f.supply.systemEarthing || '—')}</div></div>
      <div class="field"><div class="field-label">Live conductors</div><div class="field-value">${escapeHtml(f.supply.numberAndTypeOfLiveConductors || '—')}</div></div>
      <div class="field"><div class="field-label">Nominal voltage / frequency</div><div class="field-value">${num(f.supply.nominalVoltageV, 'V')} / ${num(f.supply.nominalFrequencyHz, 'Hz')}</div></div>
      <div class="field"><div class="field-label">Prospective fault current</div><div class="field-value">${num(f.supply.prospectiveFaultCurrentKa, 'kA')}</div></div>
      <div class="field"><div class="field-label">External loop impedance (Ze)</div><div class="field-value">${num(f.supply.externalLoopImpedanceZeOhms, 'Ω')}</div></div>
      <div class="field"><div class="field-label">Supply protective device</div><div class="field-value">${escapeHtml(f.supply.supplyProtectiveDeviceType || '—')}${f.supply.supplyProtectiveDeviceRatingA != null ? `, ${f.supply.supplyProtectiveDeviceRatingA}A` : ''}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Part 3 — Particulars of installation at the origin</div>
    <div class="grid">
      <div class="field"><div class="field-label">Means of earthing</div><div class="field-value">${escapeHtml(f.origin.meansOfEarthing || '—')}</div></div>
      <div class="field"><div class="field-label">Maximum demand</div><div class="field-value">${num(f.origin.maximumDemandA, 'A')}</div></div>
      <div class="field"><div class="field-label">Main switch</div><div class="field-value">${escapeHtml(f.origin.mainSwitchType || '—')}${f.origin.mainSwitchRatingA != null ? `, ${f.origin.mainSwitchRatingA}A` : ''}</div></div>
      <div class="field"><div class="field-label">Earthing conductor CSA</div><div class="field-value">${num(f.origin.earthingConductorCsaMm2, 'mm²')}</div></div>
      <div class="field"><div class="field-label">Main bonding conductors CSA</div><div class="field-value">${num(f.origin.mainBondingConductorsCsaMm2, 'mm²')}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Part 4 — Schedule of test results (${f.circuits.length} circuit${f.circuits.length === 1 ? '' : 's'})</div>
    ${circuitCards || '<div class="field-value">No circuits recorded.</div>'}
  </section>

  ${f.comments ? `<section class="part"><div class="part-title">Comments</div><div class="field-value">${escapeHtml(f.comments)}</div></section>` : ''}

  <section class="part">
    <div class="part-title">Declaration</div>
    <div class="roles"><strong>Role(s) covered by this signature:</strong> ${roles.length ? escapeHtml(roles.join(', ')) : '—'}</div>
    <div class="declaration">
      I/We, being the person(s) responsible for the role(s) indicated above, certify that the work covered by
      this certificate has been designed, constructed, inspected and tested in accordance with BS 7671, and
      that the said work, to the best of my/our knowledge and belief, is in accordance with BS 7671, as
      amended, except as detailed above.
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
