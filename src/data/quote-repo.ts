/**
 * quote-repo — the Quotes list: saved quick quotes plus project quotes that
 * have left draft.
 *
 * A quick quote is saved by snapshotting the active estimate into its own
 * estimate row (new ids for it and its lines) when it's sent or signed; the
 * active quick quote is then cleared for the next job. Project quotes stay in
 * their per-project row and just have their status updated.
 */
import { Q, Model } from '@nozbe/watermelondb';
import { database } from './database';
import { EstimateModel, LineItemModel, ProjectModel } from './models';
import { toEstimate, lineItemToRaw } from './mappers';
import { estimateRowToRaw, lineRowToRaw } from './estimate-rows';
import { ACTIVE_ID } from './estimate-repo';
import type { Client, Estimate, EstimateStatus, LineItem } from '../domain/types';
import { statusChange } from '../domain/quotes';

export interface QuoteSummary {
  estimate: Estimate;
  /** Set for project quotes. */
  projectId?: string;
  projectName?: string;
  /** The quote's client — its own for quick quotes, the project's otherwise. */
  clientId?: string;
  clientName?: string;
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function applyLine(r: LineItemModel, line: LineItem, estimateId: string) {
  const raw = lineItemToRaw(line, estimateId);
  r.estimateId = estimateId;
  r.sourceAssemblyId = raw.source_assembly_id ?? null;
  r.locationId = raw.location_id ?? null;
  r.description = raw.description;
  r.quantity = raw.quantity ?? null;
  r.quantityMeters = raw.quantity_meters ?? null;
  r.resolvedMaterialCostMinor = raw.resolved_material_cost_minor;
  r.laborBaseHours = raw.labor_base_hours;
  r.overridesJson = raw.overrides_json ?? null;
  r.appliedLaborToggleIds = raw.applied_labor_toggle_ids;
}

/** Save a copy of a quick quote to the Quotes list with the given status. Returns its id. */
export async function saveQuickQuote(
  estimate: Estimate,
  opts: { status: EstimateStatus; client: Client | null },
): Promise<string> {
  const id = newId('quote');
  const now = Date.now();
  const change = statusChange({}, opts.status, now);
  await database.write(async () => {
    const ops: Model[] = [
      database.get<EstimateModel>('estimates').prepareCreate((r) => {
        r._raw.id = id;
        r.projectId = null;
        r.mode = 'quick';
        r.status = change.status;
        r.currency = estimate.currency;
        r.hourlyRateMinor = estimate.hourlyRateMinor;
        r.vatRatePct = estimate.vatRatePct;
        r.showLaborBreakdown = estimate.showLaborBreakdown ?? true;
        r.appliedLaborToggleIds = JSON.stringify(estimate.appliedLaborToggleIds);
        r.clientId = opts.client?.id ?? null;
        r.clientName = opts.client?.name ?? null;
        r.sentAt = change.sentAt ?? null;
        r.statusChangedAt = change.statusChangedAt;
      }),
      ...estimate.lineItems.map((line) =>
        database.get<LineItemModel>('line_items').prepareCreate((r) => {
          r._raw.id = newId('line');
          applyLine(r, line, id);
        }),
      ),
    ];
    await database.batch(ops);
  });
  return id;
}

/** Move a quote (quick or project) to a new status. */
export async function setQuoteStatus(estimateId: string, next: EstimateStatus): Promise<void> {
  await database.write(async () => {
    const row = await database.get<EstimateModel>('estimates').find(estimateId);
    const change = statusChange({ sentAt: row.sentAt ?? undefined }, next, Date.now());
    await row.update((r) => {
      r.status = change.status;
      r.statusChangedAt = change.statusChangedAt;
      r.sentAt = change.sentAt ?? null;
    });
  });
}

/** Set or clear the client on a saved quick quote. */
export async function setQuoteClient(estimateId: string, client: Client | null): Promise<void> {
  await database.write(async () => {
    const row = await database.get<EstimateModel>('estimates').find(estimateId);
    await row.update((r) => {
      r.clientId = client?.id ?? null;
      r.clientName = client?.name ?? null;
    });
  });
}

/** Permanently delete a saved quick quote and its lines. */
export async function deleteQuote(estimateId: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<EstimateModel>('estimates').find(estimateId);
    const lines = await database.get<LineItemModel>('line_items').query(Q.where('estimate_id', estimateId)).fetch();
    await database.batch([...lines.map((l) => l.prepareDestroyPermanently()), row.prepareDestroyPermanently()]);
  });
}

function summarise(row: EstimateModel, lines: LineItemModel[], projects: Map<string, ProjectModel>): QuoteSummary {
  const estimate = toEstimate(estimateRowToRaw(row), lines.map(lineRowToRaw));
  const project = row.projectId ? projects.get(row.projectId) : undefined;
  const s: QuoteSummary = { estimate };
  if (project) {
    s.projectId = project.id;
    s.projectName = project.name;
    if (project.clientId) s.clientId = project.clientId;
    if (project.clientName) s.clientName = project.clientName;
  } else {
    if (estimate.clientId) s.clientId = estimate.clientId;
    if (estimate.clientName) s.clientName = estimate.clientName;
  }
  return s;
}

/** Every saved quick quote, plus project quotes that are no longer drafts — newest first. */
export async function loadQuotes(): Promise<QuoteSummary[]> {
  const rows = (await database.get<EstimateModel>('estimates').query().fetch())
    .filter((r) => r.id !== ACTIVE_ID && (r.projectId == null || r.status !== 'draft'));
  if (rows.length === 0) return [];
  const [lineRows, projectRows] = await Promise.all([
    database.get<LineItemModel>('line_items').query(Q.where('estimate_id', Q.oneOf(rows.map((r) => r.id)))).fetch(),
    database.get<ProjectModel>('projects').query().fetch(),
  ]);
  const linesByEstimate = new Map<string, LineItemModel[]>();
  for (const l of lineRows) {
    const list = linesByEstimate.get(l.estimateId) ?? [];
    list.push(l);
    linesByEstimate.set(l.estimateId, list);
  }
  const projects = new Map(projectRows.map((p) => [p.id, p]));
  return rows
    .map((r) => summarise(r, linesByEstimate.get(r.id) ?? [], projects))
    .sort((a, b) => (b.estimate.sentAt ?? b.estimate.createdAt ?? 0) - (a.estimate.sentAt ?? a.estimate.createdAt ?? 0));
}

export async function loadQuote(estimateId: string): Promise<QuoteSummary | null> {
  let row: EstimateModel;
  try { row = await database.get<EstimateModel>('estimates').find(estimateId); } catch { return null; }
  const [lines, projectRows] = await Promise.all([
    database.get<LineItemModel>('line_items').query(Q.where('estimate_id', estimateId)).fetch(),
    row.projectId ? database.get<ProjectModel>('projects').query(Q.where('id', row.projectId)).fetch() : Promise.resolve([]),
  ]);
  return summarise(row, lines, new Map(projectRows.map((p) => [p.id, p])));
}
