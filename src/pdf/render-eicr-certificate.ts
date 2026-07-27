/**
 * Electrical Installation Condition Report (EICR) — PDF HTML template.
 *
 * Third and last of the three certificate types (Minor Works -> EIC -> EICR).
 * Reuses the circuit-card rendering approach from the EIC template since the
 * Schedule of Test Results is the same shape. The observations list (C1/C2/C3/FI)
 * is the part with real legal/safety weight — see the caveat on EicrFields in
 * src/domain/types.ts before relying on generated reports as compliant.
 */

import type { EicrCertificate, ObservationCode } from '../domain/types';
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

const REASON_LABEL: Record<NonNullable<EicrCertificate['fields']['reasonForReport']>, string> = {
  periodic: 'Periodic/routine inspection',
  changeOfOccupancy: 'Change of occupancy',
  preSaleOrPurchase: 'Prior to sale/purchase',
  other: 'Other',
};

const CODE_COLOR: Record<ObservationCode, string> = {
  C1: '#C62828',
  C2: '#E65100',
  C3: '#F9A825',
  FI: '#1565C0',
};

const CODE_MEANING: Record<ObservationCode, string> = {
  C1: 'Danger present',
  C2: 'Potentially dangerous',
  C3: 'Improvement recommended',
  FI: 'Further investigation required',
};

export function renderEicrCertificateHtml(
  cert: EicrCertificate,
  meta: CertificateMeta,
  signature?: SignatureBlock,
): string {
  const f = cert.fields;
  const assessmentColor = f.overallAssessment === 'unsatisfactory' ? '#C62828' : f.overallAssessment === 'satisfactory' ? '#2E7D32' : '#888';
  const assessmentLabel = f.overallAssessment === 'unsatisfactory' ? 'UNSATISFACTORY' : f.overallAssessment === 'satisfactory' ? 'SATISFACTORY' : 'Not assessed';

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

  const observationRows = f.observations
    .map(
      (o, i) => `
    <tr>
      <td class="obs-num">${escapeHtml(o.itemNumber || String(i + 1))}</td>
      <td class="obs-desc">${escapeHtml(o.description || '—')}</td>
      <td class="obs-code"><span style="background:${CODE_COLOR[o.code]}22;color:${CODE_COLOR[o.code]}">${o.code}</span><div class="obs-code-meaning">${CODE_MEANING[o.code]}</div></td>
    </tr>`,
    )
    .join('');

  const signatureHtml = signature
    ? `
    <section class="signature">
      <div class="sig-label">Inspected and tested by</div>
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
  .assessment-banner { text-align: center; padding: 14px; border-radius: 8px; margin-bottom: 18px; font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  .obs-table { width: 100%; border-collapse: collapse; }
  .obs-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; border-bottom: 1px solid #ddd; padding: 6px 8px; }
  .obs-table td { padding: 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; font-size: 12.5px; }
  .obs-num { width: 30px; color: #888; }
  .obs-code { width: 60px; text-align: center; }
  .obs-code span { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 12px; }
  .obs-code-meaning { font-size: 9px; color: #888; margin-top: 3px; }
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
      <div class="doc-title">Electrical Installation Condition Report</div>
    </div>
    <div class="meta">
      ${f.reasonForReport ? REASON_LABEL[f.reasonForReport] : '—'}<br/>
      ${escapeHtml(formatDate(f.dateOfLastInspection))}
    </div>
  </div>

  <div class="assessment-banner" style="background:${assessmentColor}18;color:${assessmentColor}">${assessmentLabel}</div>

  <section class="part">
    <div class="part-title">Client &amp; installation</div>
    <div class="grid">
      <div class="field"><div class="field-label">Client</div><div class="field-value">${escapeHtml(f.clientName || '—')}</div></div>
      <div class="field"><div class="field-label">Client address</div><div class="field-value">${escapeHtml(f.clientAddress || meta.projectAddress || '—')}</div></div>
      <div class="field full"><div class="field-label">Installation address (if different)</div><div class="field-value">${escapeHtml(f.installationAddress || '—')}</div></div>
      <div class="field"><div class="field-label">Estimated age of installation</div><div class="field-value">${num(f.estimatedAgeYears, 'years')}</div></div>
      <div class="field"><div class="field-label">Evidence of alterations</div><div class="field-value">${yesNo(f.evidenceOfAlterations)}</div></div>
      <div class="field full"><div class="field-label">Extent and limitations of inspection</div><div class="field-value">${escapeHtml(f.extentAndLimitations || '—')}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Supply characteristics</div>
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
    <div class="part-title">Particulars of installation at the origin</div>
    <div class="grid">
      <div class="field"><div class="field-label">Means of earthing</div><div class="field-value">${escapeHtml(f.origin.meansOfEarthing || '—')}</div></div>
      <div class="field"><div class="field-label">Maximum demand</div><div class="field-value">${num(f.origin.maximumDemandA, 'A')}</div></div>
      <div class="field"><div class="field-label">Main switch</div><div class="field-value">${escapeHtml(f.origin.mainSwitchType || '—')}${f.origin.mainSwitchRatingA != null ? `, ${f.origin.mainSwitchRatingA}A` : ''}</div></div>
      <div class="field"><div class="field-label">Earthing conductor CSA</div><div class="field-value">${num(f.origin.earthingConductorCsaMm2, 'mm²')}</div></div>
      <div class="field"><div class="field-label">Main bonding conductors CSA</div><div class="field-value">${num(f.origin.mainBondingConductorsCsaMm2, 'mm²')}</div></div>
    </div>
  </section>

  <section class="part">
    <div class="part-title">Schedule of test results (${f.circuits.length} circuit${f.circuits.length === 1 ? '' : 's'})</div>
    ${circuitCards || '<div class="field-value">No circuits recorded.</div>'}
  </section>

  <section class="part">
    <div class="part-title">Observations (${f.observations.length})</div>
    ${f.observations.length > 0 ? `
    <table class="obs-table">
      <thead><tr><th>Item</th><th>Observation</th><th>Code</th></tr></thead>
      <tbody>${observationRows}</tbody>
    </table>` : '<div class="field-value">No observations recorded.</div>'}
  </section>

  ${f.generalCondition ? `<section class="part"><div class="part-title">General condition</div><div class="field-value">${escapeHtml(f.generalCondition)}</div></section>` : ''}
  ${f.comments ? `<section class="part"><div class="part-title">Comments</div><div class="field-value">${escapeHtml(f.comments)}</div></section>` : ''}

  <section class="part">
    <div class="part-title">Declaration</div>
    <div class="declaration">
      I/We declare that the inspection and testing of the installation covered by this report has been carried
      out in accordance with BS 7671, and the observations recorded above represent the condition of the
      installation at the time of the inspection, to the best of my/our knowledge and belief.
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
