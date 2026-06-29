/**
 * Internal project report HTML template.
 *
 * Produces a per-room breakdown with reference photos and line items.
 * This is an INTERNAL document — never shown to clients. It is safe to
 * include photos here because the type has no path into the client PDF.
 */

import { formatMoney } from '../domain/money';
import { escapeHtml } from './render-html';

export interface ReportPhoto {
  dataUri: string;
  caption?: string;
  note?: string;
}

export interface ReportLineItem {
  description: string;
  quantityLabel: string;
  lineTotalMinor: number;
}

export interface ReportRoom {
  name: string;
  lineItems: ReportLineItem[];
  roomTotalMinor: number;
  photos: ReportPhoto[];
}

export interface ReportFloor {
  name: string;
  rooms: ReportRoom[];
  floorTotalMinor: number;
}

export interface ProjectReportInput {
  projectName: string;
  clientName?: string;
  businessName?: string;
  logoDataUri?: string;
  dateIso: string;
  currency: string;
  floors: ReportFloor[];
  subtotalMinor: number;
  vatRatePct: number;
  vatAmountMinor: number;
  grandTotalMinor: number;
}

function money(minor: number, currency: string): string {
  return formatMoney(minor, currency as 'GBP' | 'EUR');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderPhotos(photos: ReportPhoto[]): string {
  if (photos.length === 0) return '';
  const items = photos.map((p) => `
    <div class="photo-item">
      <img class="photo-img" src="${p.dataUri}" alt="${p.caption ? escapeHtml(p.caption) : 'Photo'}" />
      ${p.caption ? `<div class="photo-caption">${escapeHtml(p.caption)}</div>` : ''}
      ${p.note ? `<div class="photo-note">${escapeHtml(p.note)}</div>` : ''}
    </div>`).join('');
  return `<div class="photo-grid">${items}</div>`;
}

function renderLineItems(items: ReportLineItem[], currency: string): string {
  if (items.length === 0) {
    return `<p class="no-items">No line items for this room.</p>`;
  }
  const rows = items.map((l) => `
    <tr>
      <td class="td-desc">${escapeHtml(l.description)}</td>
      <td class="td-qty">${escapeHtml(l.quantityLabel)}</td>
      <td class="td-amt">${money(l.lineTotalMinor, currency)}</td>
    </tr>`).join('');
  return `
    <table>
      <thead>
        <tr>
          <th class="th-desc">Description</th>
          <th class="th-qty">Qty</th>
          <th class="th-amt">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRoom(room: ReportRoom, currency: string): string {
  const totalLabel = room.roomTotalMinor > 0
    ? `<span class="room-total">${money(room.roomTotalMinor, currency)}</span>`
    : '';
  return `
    <div class="room">
      <div class="room-heading">
        <span class="room-name">${escapeHtml(room.name)}</span>
        ${totalLabel}
      </div>
      ${renderPhotos(room.photos)}
      ${renderLineItems(room.lineItems, currency)}
    </div>`;
}

function renderFloor(floor: ReportFloor, currency: string): string {
  const totalLabel = floor.floorTotalMinor > 0
    ? `<span class="floor-total">${money(floor.floorTotalMinor, currency)}</span>`
    : '';
  const rooms = floor.rooms.map((r) => renderRoom(r, currency)).join('');
  return `
    <div class="floor">
      <div class="floor-heading">
        <span>${escapeHtml(floor.name)}</span>
        ${totalLabel}
      </div>
      ${rooms}
    </div>`;
}

export function renderProjectReportHtml(report: ProjectReportInput): string {
  const headerMeta = [
    report.clientName ? `Client: ${escapeHtml(report.clientName)}` : '',
    formatDate(report.dateIso),
  ].filter(Boolean).join('<br/>');

  const logoHtml = report.logoDataUri
    ? `<img class="logo" src="${report.logoDataUri}" alt="Logo" />`
    : '';

  const vatRow = report.vatRatePct > 0
    ? `<div class="sum-row"><span class="sum-label">VAT (${report.vatRatePct}%)</span><span class="sum-val">${money(report.vatAmountMinor, report.currency)}</span></div>`
    : '';

  const floorsHtml = report.floors.map((f) => renderFloor(f, report.currency)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 28px; font-size: 13px; line-height: 1.5; }

  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 24px; }
  .logo { max-height: 56px; max-width: 180px; object-fit: contain; display: block; margin-bottom: 6px; }
  .business { font-size: 18px; font-weight: 700; }
  .doc-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-top: 3px; }
  .meta { text-align: right; font-size: 12px; color: #555; line-height: 1.7; }
  .project-name { font-size: 14px; font-weight: 700; color: #1a1a1a; }

  .floor { margin-bottom: 28px; }
  .floor-heading { display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; color: #fff; padding: 7px 12px; border-radius: 5px; margin-bottom: 10px; font-size: 13px; font-weight: 700; page-break-after: avoid; }
  .floor-total { font-variant-numeric: tabular-nums; font-weight: 400; opacity: 0.8; }

  .room { margin-bottom: 16px; padding: 12px; border: 1px solid #e8e8e8; border-radius: 6px; page-break-inside: avoid; }
  .room-heading { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .room-name { font-size: 14px; font-weight: 700; }
  .room-total { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }

  .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .photo-item { width: calc(33.33% - 6px); }
  .photo-img { width: 100%; height: 110px; object-fit: cover; border-radius: 4px; display: block; }
  .photo-caption { font-size: 9px; font-weight: 700; color: #333; margin-top: 3px; }
  .photo-note { font-size: 9px; color: #777; margin-top: 1px; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; border-bottom: 1px solid #e0e0e0; padding: 5px 0; }
  td { padding: 7px 0; border-bottom: 1px solid #f3f3f3; vertical-align: top; }
  .th-qty, .td-qty { text-align: right; width: 60px; }
  .th-amt, .td-amt { text-align: right; width: 90px; }
  .td-qty { color: #666; }
  .td-amt { font-weight: 600; font-variant-numeric: tabular-nums; }
  .no-items { color: #bbb; font-size: 12px; font-style: italic; margin: 0; }

  .summary { margin-top: 24px; margin-left: auto; width: 260px; }
  .sum-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
  .sum-label { color: #555; }
  .sum-val { font-variant-numeric: tabular-nums; }
  .sum-grand { border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: 700; }
</style>
</head>
<body>
  <div class="doc-head">
    <div>
      ${logoHtml}
      <div class="business">${escapeHtml(report.businessName ?? 'Project Report')}</div>
      <div class="doc-title">Internal Project Report</div>
    </div>
    <div class="meta">
      <div class="project-name">${escapeHtml(report.projectName)}</div>
      ${headerMeta}
    </div>
  </div>

  ${floorsHtml}

  <div class="summary">
    <div class="sum-row"><span class="sum-label">Subtotal</span><span class="sum-val">${money(report.subtotalMinor, report.currency)}</span></div>
    ${vatRow}
    <div class="sum-row sum-grand"><span>Total</span><span>${money(report.grandTotalMinor, report.currency)}</span></div>
  </div>
</body>
</html>`;
}
