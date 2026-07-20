/**
 * project-repo — persistence for projects and their locations (floors/rooms).
 * Locations form a tree via parentId: top-level = floor/area, nested = room.
 * Photos attach later (Phase 2).
 */
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { database } from './database';
import { ProjectModel, LocationModel, FloorPlanModel, WallModel, WallSymbolModel } from './models';
import type { Project, Location } from '../domain/types';

function toProject(r: ProjectModel): Project {
  const p: Project = { id: r.id, name: r.name, createdAt: r.createdAt.getTime() };
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
  if (r.heightMeters != null) loc.heightMeters = r.heightMeters;
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
  return rows.map(toProject).sort((a, b) => b.createdAt - a.createdAt);
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

export async function loadLocation(id: string): Promise<Location> {
  const row = await database.get<LocationModel>('locations').find(id);
  return toLocation(row);
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

/** Set (or clear, passing null) a room's manually-entered ceiling height in metres. */
export async function setLocationHeight(id: string, heightMeters: number | null): Promise<void> {
  await database.write(async () => {
    const row = await database.get<LocationModel>('locations').find(id);
    await row.update((r) => { r.heightMeters = heightMeters; });
  });
}

/**
 * Delete a location and any child locations under it. Also cascades any
 * walls/wall_symbols belonging to this location (if it's a room) and any
 * floor_plans/walls/wall_symbols belonging to this location (if it's a
 * floor) — WatermelonDB has no FK constraints, so this is manual, mirroring
 * the wall/floor-plan cascades in floor-plan-repo.ts. File cleanup (photo
 * binaries, floor-plan images) is out of scope here, matching this
 * function's existing behaviour of never touching FileSystem.
 */
export async function deleteLocation(id: string): Promise<void> {
  await database.write(async () => {
    const batch: Model[] = [];

    // Floor plans belonging to this location (only floors have one).
    const floorPlans = await database
      .get<FloorPlanModel>('floor_plans')
      .query(Q.where('location_id', id))
      .fetch();
    for (const plan of floorPlans) {
      const planWalls = await database
        .get<WallModel>('walls')
        .query(Q.where('floor_plan_id', plan.id))
        .fetch();
      for (const wall of planWalls) {
        const wallSymbols = await database
          .get<WallSymbolModel>('wall_symbols')
          .query(Q.where('wall_id', wall.id))
          .fetch();
        batch.push(...wallSymbols.map((s) => s.prepareDestroyPermanently()));
        batch.push(wall.prepareDestroyPermanently());
      }
      batch.push(plan.prepareDestroyPermanently());
    }

    // Walls belonging to this location (only rooms have these).
    const walls = await database
      .get<WallModel>('walls')
      .query(Q.where('location_id', id))
      .fetch();
    for (const wall of walls) {
      const wallSymbols = await database
        .get<WallSymbolModel>('wall_symbols')
        .query(Q.where('wall_id', wall.id))
        .fetch();
      batch.push(...wallSymbols.map((s) => s.prepareDestroyPermanently()));
      batch.push(wall.prepareDestroyPermanently());
    }

    const children = await database
      .get<LocationModel>('locations')
      .query(Q.where('parent_id', id))
      .fetch();
    batch.push(...children.map((c) => c.prepareDestroyPermanently()));

    const loc = await database.get<LocationModel>('locations').find(id);
    batch.push(loc.prepareDestroyPermanently());

    await database.batch(...batch);
  });
}
