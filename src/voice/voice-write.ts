/**
 * The single write path for voice-added items — reuses the exact same
 * domain functions (lineFromMaterial, addLine) and persistence function
 * (saveProjectEstimate) that the manual MaterialPicker flow in
 * app/project/quote/[id].tsx uses. No parallel write logic.
 */
import { loadProjectEstimate, saveProjectEstimate } from '../data/project-estimate-repo';
import { addLine, lineFromLabour, lineFromMaterial } from '../data/estimate-service';
import type { Estimate, Material } from '../domain/types';

function emptyProjectEstimate(): Estimate {
  return {
    id: '',
    mode: 'project',
    status: 'draft',
    currency: 'GBP',
    hourlyRateMinor: 5000,
    vatRatePct: 20,
    appliedLaborToggleIds: [],
    lineItems: [],
  };
}

/** Adds a material line on a project's estimate, optionally tagged to a room (locationId). */
export async function addMaterialToProjectByVoice(
  projectId: string,
  material: Material,
  amount: number,
  locationId?: string,
): Promise<void> {
  const estimate = (await loadProjectEstimate(projectId)) ?? emptyProjectEstimate();
  const updated = addLine(estimate, { ...lineFromMaterial(material, amount), locationId });
  await saveProjectEstimate(projectId, updated);
}

/** Adds a standalone labour line (hours or flat amount) to a project's estimate, optionally tagged to a room. */
export async function addLabourToProjectByVoice(
  projectId: string,
  opts: { hours?: number; flatMinor?: number },
  locationId?: string,
): Promise<void> {
  const estimate = (await loadProjectEstimate(projectId)) ?? emptyProjectEstimate();
  const updated = addLine(estimate, { ...lineFromLabour(opts), locationId });
  await saveProjectEstimate(projectId, updated);
}
