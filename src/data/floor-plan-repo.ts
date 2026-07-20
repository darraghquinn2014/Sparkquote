/**
 * floor-plan-repo — persistence for floor plans (one image per floor), the
 * walls traced on them (belonging to a room), and the electrical symbols
 * tagged on those walls.
 *
 * WatermelonDB has no FK constraints, so cascades are manual here, mirroring
 * deleteLocation/deleteProject in project-repo.ts: gather child rows first,
 * destroy everything in one batch. File binaries (the plan image, wall
 * photos) are never touched by this repo — deleteFloorPlan/deleteWall return
 * the paths/ids so the caller does file cleanup, exactly how
 * photo-repo.deleteLocationPhoto only removes the DB row.
 */
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { database } from './database';
import { FloorPlanModel, WallModel, WallSymbolModel, PhotoModel } from './models';
import type { FloorPlan, Wall, WallSymbol } from '../domain/types';
import type { SymbolType } from '../media/annotation-service';

function toFloorPlan(r: FloorPlanModel): FloorPlan {
  const plan: FloorPlan = {
    id: r.id,
    projectId: r.projectId,
    locationId: r.locationId,
    filePath: r.filePath,
    width: r.width,
    height: r.height,
    createdAt: r.createdAt,
  };
  if (r.pxPerMeter != null) plan.pxPerMeter = r.pxPerMeter;
  return plan;
}

function toWall(r: WallModel): Wall {
  const wall: Wall = {
    id: r.id,
    floorPlanId: r.floorPlanId,
    locationId: r.locationId,
    start: { x: r.startX, y: r.startY },
    end: { x: r.endX, y: r.endY },
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
  };
  if (r.label != null) wall.label = r.label;
  if (r.photoId != null) wall.photoId = r.photoId;
  return wall;
}

function toWallSymbol(r: WallSymbolModel): WallSymbol {
  const symbol: WallSymbol = {
    id: r.id,
    wallId: r.wallId,
    type: r.type as SymbolType,
    positionAlongWall: r.positionAlongWall,
    photoY: r.photoY,
    createdAt: r.createdAt,
  };
  if (r.color != null) symbol.color = r.color;
  return symbol;
}

// ── Floor plans ──────────────────────────────────────────────────────────

export async function addFloorPlan(
  projectId: string,
  locationId: string,
  filePath: string,
  width: number,
  height: number,
): Promise<string> {
  let newId = '';
  await database.write(async () => {
    const row = await database.get<FloorPlanModel>('floor_plans').create((r) => {
      r.projectId = projectId;
      r.locationId = locationId;
      r.filePath = filePath;
      r.width = width;
      r.height = height;
      r.createdAt = Date.now();
    });
    newId = row.id;
  });
  return newId;
}

/** Patch a floor plan's file/dimensions once the picked image has been imported. */
export async function updateFloorPlanFile(
  id: string,
  filePath: string,
  width: number,
  height: number,
): Promise<void> {
  await database.write(async () => {
    const row = await database.get<FloorPlanModel>('floor_plans').find(id);
    await row.update((r) => {
      r.filePath = filePath;
      r.width = width;
      r.height = height;
    });
  });
}

/** Save a plan's real-world scale from a user calibration tap (pixels per metre). */
export async function setFloorPlanScale(id: string, pxPerMeter: number): Promise<void> {
  await database.write(async () => {
    const row = await database.get<FloorPlanModel>('floor_plans').find(id);
    await row.update((r) => { r.pxPerMeter = pxPerMeter; });
  });
}

/** A floor has at most one plan; returns null if none has been imported yet. */
export async function loadFloorPlanForLocation(locationId: string): Promise<FloorPlan | null> {
  const rows = await database
    .get<FloorPlanModel>('floor_plans')
    .query(Q.where('location_id', locationId))
    .fetch();
  return rows.length > 0 ? toFloorPlan(rows[0]!) : null;
}

/**
 * Cascade-delete a floor plan: destroys every wall on it (and each wall's
 * symbols/photo row), then the floor_plans row itself. Returns the file
 * paths the caller must delete from disk (this repo never touches
 * FileSystem directly).
 */
export async function deleteFloorPlan(
  id: string,
): Promise<{ deletedPhotoFilePaths: string[]; planFilePath: string }> {
  const plan = await database.get<FloorPlanModel>('floor_plans').find(id);
  const walls = await database
    .get<WallModel>('walls')
    .query(Q.where('floor_plan_id', id))
    .fetch();

  const deletedPhotoFilePaths: string[] = [];
  const batch: Model[] = [];

  for (const wall of walls) {
    const symbols = await database
      .get<WallSymbolModel>('wall_symbols')
      .query(Q.where('wall_id', wall.id))
      .fetch();
    batch.push(...symbols.map((s) => s.prepareDestroyPermanently()));

    if (wall.photoId != null) {
      const filePath = await destroyPhotoIfExists(wall.photoId, batch);
      if (filePath != null) deletedPhotoFilePaths.push(filePath);
    }
    batch.push(wall.prepareDestroyPermanently());
  }

  batch.push(plan.prepareDestroyPermanently());
  await database.write(async () => {
    await database.batch(...batch);
  });

  return { deletedPhotoFilePaths, planFilePath: plan.filePath };
}

// ── Walls ────────────────────────────────────────────────────────────────

export async function addWall(
  floorPlanId: string,
  locationId: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  label?: string,
): Promise<string> {
  const siblings = await database
    .get<WallModel>('walls')
    .query(Q.where('location_id', locationId))
    .fetch();
  let newId = '';
  await database.write(async () => {
    const row = await database.get<WallModel>('walls').create((r) => {
      r.floorPlanId = floorPlanId;
      r.locationId = locationId;
      r.startX = start.x;
      r.startY = start.y;
      r.endX = end.x;
      r.endY = end.y;
      r.label = label ?? null;
      r.photoId = null;
      r.sortOrder = siblings.length + 1;
      r.createdAt = Date.now();
    });
    newId = row.id;
  });
  return newId;
}

/** All walls on a plan, across every room on that floor. */
export async function loadWallsForFloorPlan(floorPlanId: string): Promise<Wall[]> {
  const rows = await database
    .get<WallModel>('walls')
    .query(Q.where('floor_plan_id', floorPlanId))
    .fetch();
  return rows.map(toWall).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Walls belonging to one room. */
export async function loadWallsForLocation(locationId: string): Promise<Wall[]> {
  const rows = await database
    .get<WallModel>('walls')
    .query(Q.where('location_id', locationId))
    .fetch();
  return rows.map(toWall).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function loadWall(id: string): Promise<Wall> {
  const row = await database.get<WallModel>('walls').find(id);
  return toWall(row);
}

export async function renameWall(id: string, label: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<WallModel>('walls').find(id);
    await row.update((r) => { r.label = label || null; });
  });
}

export async function setWallPhoto(wallId: string, photoId: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<WallModel>('walls').find(wallId);
    await row.update((r) => { r.photoId = photoId; });
  });
}

export async function clearWallPhoto(wallId: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<WallModel>('walls').find(wallId);
    await row.update((r) => { r.photoId = null; });
  });
}

/**
 * Cascade-delete a wall: destroys its symbols and the wall row itself.
 * Returns the photoId that WAS attached (if any) so the caller deletes that
 * photo row (photo-repo.deleteLocationPhoto) + file (camera-service.deletePhoto).
 */
export async function deleteWall(id: string): Promise<{ deletedPhotoId: string | null }> {
  const wall = await database.get<WallModel>('walls').find(id);
  const symbols = await database
    .get<WallSymbolModel>('wall_symbols')
    .query(Q.where('wall_id', id))
    .fetch();

  const batch: Model[] = symbols.map((s) => s.prepareDestroyPermanently());
  batch.push(wall.prepareDestroyPermanently());
  await database.write(async () => {
    await database.batch(...batch);
  });

  return { deletedPhotoId: wall.photoId };
}

// ── Wall symbols ─────────────────────────────────────────────────────────

export async function addWallSymbol(
  wallId: string,
  type: SymbolType,
  positionAlongWall: number,
  photoY: number,
  color?: string,
): Promise<string> {
  let newId = '';
  await database.write(async () => {
    const row = await database.get<WallSymbolModel>('wall_symbols').create((r) => {
      r.wallId = wallId;
      r.type = type;
      r.positionAlongWall = positionAlongWall;
      r.photoY = photoY;
      r.color = color ?? null;
      r.createdAt = Date.now();
    });
    newId = row.id;
  });
  return newId;
}

export async function loadWallSymbols(wallId: string): Promise<WallSymbol[]> {
  const rows = await database
    .get<WallSymbolModel>('wall_symbols')
    .query(Q.where('wall_id', wallId))
    .fetch();
  return rows.map(toWallSymbol);
}

/** All symbols across every wall on a floor plan. */
export async function loadWallSymbolsForFloorPlan(floorPlanId: string): Promise<WallSymbol[]> {
  const walls = await database
    .get<WallModel>('walls')
    .query(Q.where('floor_plan_id', floorPlanId))
    .fetch();
  if (walls.length === 0) return [];
  const rows = await database
    .get<WallSymbolModel>('wall_symbols')
    .query(Q.where('wall_id', Q.oneOf(walls.map((w) => w.id))))
    .fetch();
  return rows.map(toWallSymbol);
}

export async function updateWallSymbolPhotoY(id: string, photoY: number): Promise<void> {
  await database.write(async () => {
    const row = await database.get<WallSymbolModel>('wall_symbols').find(id);
    await row.update((r) => { r.photoY = photoY; });
  });
}

export async function deleteWallSymbol(id: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<WallSymbolModel>('wall_symbols').find(id);
    await row.destroyPermanently();
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Queue a photo row for destruction (as part of a larger batch) and return
 * its file path, or null if the photo row no longer exists.
 */
async function destroyPhotoIfExists(photoId: string, batch: Model[]): Promise<string | null> {
  try {
    const photo = await database.get<PhotoModel>('photos').find(photoId);
    batch.push(photo.prepareDestroyPermanently());
    return photo.filePath;
  } catch {
    return null;
  }
}
