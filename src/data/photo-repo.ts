/**
 * photo-repo — persist and query reference photos attached to a room (location).
 *
 * File binaries live on disk (managed by camera-service). This repo handles only
 * the DB rows. Deletion of the file is the caller's responsibility — use
 * camera-service.deletePhoto(photo) after removing the row.
 */
import { Q } from '@nozbe/watermelondb';
import { database } from './database';
import { PhotoModel } from './models';
import type { ImageQuality, Photo } from '../media/media-types';

function toPhoto(r: PhotoModel): Photo {
  const photo: Photo = {
    id: r.id,
    projectId: r.projectId,
    filePath: r.filePath,
    quality: (['low', 'medium', 'high'] as const).includes(r.quality as ImageQuality)
      ? (r.quality as ImageQuality)
      : 'medium',
    visibility: 'internal',
    capturedAt: r.capturedAt,
  };
  if (r.lineItemId != null) photo.lineItemId = r.lineItemId;
  if (r.locationId != null) photo.locationId = r.locationId;
  return photo;
}

/** Persist a captured photo row for a room. Returns the WatermelonDB-assigned id. */
export async function addLocationPhoto(
  projectId: string,
  locationId: string,
  filePath: string,
  quality: ImageQuality,
  capturedAt: number,
): Promise<string> {
  let newId = '';
  await database.write(async () => {
    const row = await database.get<PhotoModel>('photos').create((r) => {
      r.projectId = projectId;
      r.locationId = locationId;
      r.filePath = filePath;
      r.quality = quality;
      r.visibility = 'internal';
      r.capturedAt = capturedAt;
    });
    newId = row.id;
  });
  return newId;
}

/** Load all photos for a room, newest first. */
export async function photosForLocation(locationId: string): Promise<Photo[]> {
  const rows = await database
    .get<PhotoModel>('photos')
    .query(Q.where('location_id', locationId))
    .fetch();
  return rows.map(toPhoto).sort((a, b) => b.capturedAt - a.capturedAt);
}

/** Remove the DB row. Call camera-service.deletePhoto(photo) separately to remove the file. */
export async function deleteLocationPhoto(id: string): Promise<void> {
  await database.write(async () => {
    const row = await database.get<PhotoModel>('photos').find(id);
    await row.destroyPermanently();
  });
}
