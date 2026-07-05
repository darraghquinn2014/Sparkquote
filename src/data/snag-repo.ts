import { Q } from '@nozbe/watermelondb';
import { database } from './database';
import { SnagItemModel } from './models';
import type { SnagItem } from '../domain/types';

function toSnagItem(r: SnagItemModel): SnagItem {
  const item: SnagItem = {
    id: r.id,
    projectId: r.projectId,
    description: r.description,
    resolved: r.resolved,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
  };
  if (r.locationId != null) item.locationId = r.locationId;
  if (r.photoPath != null) item.photoPath = r.photoPath;
  return item;
}

export async function snagItemsForProject(projectId: string): Promise<SnagItem[]> {
  const rows = await database
    .get<SnagItemModel>('snag_items')
    .query(Q.where('project_id', projectId))
    .fetch();
  return rows.map(toSnagItem).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export async function createSnagItem(
  projectId: string,
  description: string,
  locationId?: string,
): Promise<SnagItem> {
  const existing = await database
    .get<SnagItemModel>('snag_items')
    .query(Q.where('project_id', projectId))
    .fetchCount();
  let newItem!: SnagItemModel;
  await database.write(async () => {
    newItem = await database.get<SnagItemModel>('snag_items').create((r) => {
      r.projectId = projectId;
      r.locationId = locationId ?? null;
      r.description = description;
      r.resolved = false;
      r.sortOrder = existing;
      r.createdAt = Date.now();
    });
  });
  return toSnagItem(newItem);
}

/** Patch a snag item's photo path once a captured/picked image has been imported. */
export async function updateSnagItemPhoto(id: string, photoPath: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<SnagItemModel>('snag_items').find(id);
    await row.update((r) => { r.photoPath = photoPath; });
  });
}

export async function toggleSnagItem(id: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<SnagItemModel>('snag_items').find(id);
    await row.update((r) => { r.resolved = !r.resolved; });
  });
}

export async function setSnagResolved(id: string, resolved: boolean): Promise<void> {
  await database.write(async () => {
    const row = await database.get<SnagItemModel>('snag_items').find(id);
    await row.update((r) => { r.resolved = resolved; });
  });
}

export async function deleteSnagItem(id: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<SnagItemModel>('snag_items').find(id);
    await row.destroyPermanently();
  });
}

export async function deleteSnagItemsForProject(projectId: string): Promise<void> {
  await database.write(async () => {
    const rows = await database
      .get<SnagItemModel>('snag_items')
      .query(Q.where('project_id', projectId))
      .fetch();
    for (const row of rows) await row.destroyPermanently();
  });
}
