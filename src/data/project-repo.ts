/**
 * project-repo — persistence for projects and their locations (floors/rooms).
 * Locations form a tree via parentId: top-level = floor/area, nested = room.
 * Photos attach later (Phase 2).
 */
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { database } from './database';
import { ProjectModel, LocationModel } from './models';
import type { Project, Location } from '../domain/types';

function toProject(r: ProjectModel): Project {
  const p: Project = { id: r.id, name: r.name };
  if (r.clientName != null) p.clientName = r.clientName;
  return p;
}

function toLocation(r: LocationModel): Location {
  const loc: Location = {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    sortOrder: r.sortOrder,
  };
  if (r.parentId != null) loc.parentId = r.parentId;
  return loc;
}

// ── Projects ───────────────────────────────────────────────────────────────

export async function createProject(name: string, clientName?: string): Promise<string> {
  let newId = '';
  await database.write(async () => {
    const row = await database.get<ProjectModel>('projects').create((r) => {
      r.name = name;
      r.clientName = clientName ?? null;
    });
    newId = row.id;
  });
  return newId;
}

export async function loadProjects(): Promise<Project[]> {
  const rows = await database.get<ProjectModel>('projects').query().fetch();
  return rows.map(toProject).sort((a, b) => a.name.localeCompare(b.name));
}

export async function renameProject(id: string, name: string, clientName?: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<ProjectModel>('projects').find(id);
    await row.update((r) => {
      r.name = name;
      if (clientName !== undefined) r.clientName = clientName || null;
    });
  });
}

/** Delete a project and all its locations. */
export async function deleteProject(id: string): Promise<void> {
  await database.write(async () => {
    const locs = await database
      .get<LocationModel>('locations')
      .query(Q.where('project_id', id))
      .fetch();
    const batch: Model[] = locs.map((l) => l.prepareDestroyPermanently());
    const proj = await database.get<ProjectModel>('projects').find(id);
    batch.push(proj.prepareDestroyPermanently());
    await database.batch(...batch);
  });
}

// ── Locations (floors / rooms) ───────────────────────────────────────────────

export async function addLocation(
  projectId: string,
  name: string,
  parentId?: string,
): Promise<string> {
  // sortOrder = count of existing siblings (same parent), so new items append.
  const all = await database
    .get<LocationModel>('locations')
    .query(Q.where('project_id', projectId))
    .fetch();
  const siblings = all.filter((l) => (l.parentId ?? null) === (parentId ?? null));
  let newId = '';
  await database.write(async () => {
    const row = await database.get<LocationModel>('locations').create((r) => {
      r.projectId = projectId;
      r.parentId = parentId ?? null;
      r.name = name;
      r.sortOrder = siblings.length + 1;
    });
    newId = row.id;
  });
  return newId;
}

export async function loadLocations(projectId: string): Promise<Location[]> {
  const rows = await database
    .get<LocationModel>('locations')
    .query(Q.where('project_id', projectId))
    .fetch();
  return rows.map(toLocation).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function renameLocation(id: string, name: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<LocationModel>('locations').find(id);
    await row.update((r) => { r.name = name; });
  });
}

/** Delete a location and any child locations under it. */
export async function deleteLocation(id: string): Promise<void> {
  await database.write(async () => {
    const children = await database
      .get<LocationModel>('locations')
      .query(Q.where('parent_id', id))
      .fetch();
    const batch: Model[] = children.map((c) => c.prepareDestroyPermanently());
    const loc = await database.get<LocationModel>('locations').find(id);
    batch.push(loc.prepareDestroyPermanently());
    await database.batch(...batch);
  });
}
