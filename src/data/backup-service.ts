/**
 * Backup and restore service — ZIP-based, includes photos.
 *
 * Exports all user data + reference photos as a single .zip file that can
 * be saved anywhere (Google Drive, email, iCloud, etc.) via the system
 * share sheet. Restore picks a previously exported zip and replaces all
 * DB data and photo files.
 *
 * ZIP structure:
 *   backup.json          — all DB rows (projects, rooms, estimates, etc.)
 *   photos/<id>.jpg      — one file per reference photo
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Model } from '@nozbe/watermelondb';
import JSZip from 'jszip';
import { database } from './database';
import {
  ProjectModel,
  LocationModel,
  EstimateModel,
  LineItemModel,
  AssemblyModel,
  AssemblyComponentModel,
  PhotoModel,
} from './models';

const BACKUP_VERSION = 2;

type RawRow = Record<string, unknown>;

export interface BackupFile {
  version: number;
  createdAt: string;
  projects: RawRow[];
  locations: RawRow[];
  estimates: RawRow[];
  lineItems: RawRow[];
  assemblies: RawRow[];
  assemblyComponents: RawRow[];
  photos: RawRow[];
}

// ── Row mappers ────────────────────────────────────────────────────────────

function rowProject(r: ProjectModel): RawRow {
  return { id: r.id, name: r.name, client_name: r.clientName };
}
function rowLocation(r: LocationModel): RawRow {
  return { id: r.id, project_id: r.projectId, parent_id: r.parentId, name: r.name, sort_order: r.sortOrder };
}
function rowEstimate(r: EstimateModel): RawRow {
  return {
    id: r.id, project_id: r.projectId, mode: r.mode, status: r.status,
    currency: r.currency, hourly_rate_minor: r.hourlyRateMinor,
    vat_rate_pct: r.vatRatePct, show_labor_breakdown: r.showLaborBreakdown,
    applied_labor_toggle_ids: r.appliedLaborToggleIds,
  };
}
function rowLineItem(r: LineItemModel): RawRow {
  return {
    id: r.id, estimate_id: r.estimateId, source_assembly_id: r.sourceAssemblyId,
    location_id: r.locationId, description: r.description, quantity: r.quantity,
    quantity_meters: r.quantityMeters,
    resolved_material_cost_minor: r.resolvedMaterialCostMinor,
    labor_base_hours: r.laborBaseHours, overrides_json: r.overridesJson,
    applied_labor_toggle_ids: r.appliedLaborToggleIds,
  };
}
function rowAssembly(r: AssemblyModel): RawRow {
  return {
    id: r.id, name: r.name, category: r.category,
    base_labor_hours: r.baseLaborHours, quick_quote_icon: r.quickQuoteIcon,
    quick_quote_rank: r.quickQuoteRank,
  };
}
function rowAssemblyComponent(r: AssemblyComponentModel): RawRow {
  return { id: r.id, assembly_id: r.assemblyId, material_id: r.materialId, quantity: r.quantity, waste_factor: r.wasteFactor };
}
function rowPhoto(r: PhotoModel): RawRow {
  return {
    id: r.id, project_id: r.projectId, line_item_id: r.lineItemId,
    location_id: r.locationId, file_path: r.filePath, quality: r.quality,
    visibility: r.visibility, captured_at: r.capturedAt,
    caption: r.caption, note: r.note,
  };
}

// ── Export ─────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const [projects, locations, estimates, lineItems, assemblies, assemblyComponents, photos] =
    await Promise.all([
      database.get<ProjectModel>('projects').query().fetch(),
      database.get<LocationModel>('locations').query().fetch(),
      database.get<EstimateModel>('estimates').query().fetch(),
      database.get<LineItemModel>('line_items').query().fetch(),
      database.get<AssemblyModel>('assemblies').query().fetch(),
      database.get<AssemblyComponentModel>('assembly_components').query().fetch(),
      database.get<PhotoModel>('photos').query().fetch(),
    ]);

  const backup: BackupFile = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    projects: projects.map(rowProject),
    locations: locations.map(rowLocation),
    estimates: estimates.map(rowEstimate),
    lineItems: lineItems.map(rowLineItem),
    assemblies: assemblies.map(rowAssembly),
    assemblyComponents: assemblyComponents.map(rowAssemblyComponent),
    photos: photos.map(rowPhoto),
  };

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(backup, null, 2));

  // Add each photo file into photos/ folder in the zip
  let photoCount = 0;
  for (const photo of photos) {
    try {
      const b64 = await FileSystem.readAsStringAsync(photo.filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const filename = photo.id + '.jpg';
      zip.folder('photos')!.file(filename, b64, { base64: true });
      photoCount++;
    } catch {
      // Skip photos whose files no longer exist
    }
  }

  const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const date = new Date().toISOString().slice(0, 10);
  const path = `${FileSystem.cacheDirectory}sparkquote-backup-${date}.zip`;
  await FileSystem.writeAsStringAsync(path, zipBase64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(path, {
    mimeType: 'application/zip',
    dialogTitle: 'Save SparkQuote backup',
    UTI: 'public.zip-archive',
  });

  void photoCount; // used above — suppress lint
}

// ── Restore ────────────────────────────────────────────────────────────────

export async function pickAndRestoreBackup(): Promise<{ restored: boolean; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || result.assets.length === 0) {
    return { restored: false, message: 'Cancelled.' };
  }

  const uri = result.assets[0].uri;
  const name = result.assets[0].name ?? '';
  const isZip = name.endsWith('.zip') || result.assets[0].mimeType?.includes('zip');

  let backup: BackupFile;

  if (isZip) {
    // Read zip, extract backup.json and photos
    const zipBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });

    const jsonFile = zip.file('backup.json');
    if (!jsonFile) return { restored: false, message: 'No backup.json found in zip.' };

    const jsonText = await jsonFile.async('string');
    try { backup = JSON.parse(jsonText) as BackupFile; }
    catch { return { restored: false, message: 'backup.json is not valid JSON.' }; }

    // Restore photo files
    const photosFolder = zip.folder('photos');
    if (photosFolder && backup.photos?.length) {
      for (const photoRow of backup.photos) {
        const filename = String(photoRow.id) + '.jpg';
        const photoFile = photosFolder.file(filename);
        if (!photoFile) continue;
        try {
          const destPath = String(photoRow.file_path);
          // Ensure directory exists
          const dir = destPath.substring(0, destPath.lastIndexOf('/'));
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          const photoB64 = await photoFile.async('base64');
          await FileSystem.writeAsStringAsync(destPath, photoB64, { encoding: FileSystem.EncodingType.Base64 });
        } catch {
          // Continue even if one photo fails to restore
        }
      }
    }
  } else {
    // Legacy plain JSON backup (version 1)
    const raw = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    try { backup = JSON.parse(raw) as BackupFile; }
    catch { return { restored: false, message: 'File is not valid JSON.' }; }
  }

  if (!backup.version || !backup.projects || !backup.estimates) {
    return { restored: false, message: 'File does not look like a SparkQuote backup.' };
  }

  // Restore DB
  await database.write(async () => {
    const tables = ['projects', 'locations', 'estimates', 'line_items', 'assemblies', 'assembly_components', 'photos'] as const;
    const deletes: Model[] = [];
    for (const table of tables) {
      const rows = await database.get(table).query().fetch();
      rows.forEach((r) => deletes.push((r as Model).prepareDestroyPermanently()));
    }
    await database.batch(...deletes);

    const creates: Model[] = [];

    for (const row of backup.projects) {
      creates.push(database.get<ProjectModel>('projects').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.name = String(row.name ?? '');
        r.clientName = row.client_name != null ? String(row.client_name) : null;
      }));
    }
    for (const row of backup.locations) {
      creates.push(database.get<LocationModel>('locations').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.projectId = String(row.project_id ?? '');
        r.parentId = row.parent_id != null ? String(row.parent_id) : null;
        r.name = String(row.name ?? '');
        r.sortOrder = Number(row.sort_order ?? 0);
      }));
    }
    for (const row of backup.estimates) {
      creates.push(database.get<EstimateModel>('estimates').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.projectId = row.project_id != null ? String(row.project_id) : null;
        r.mode = String(row.mode ?? 'quick');
        r.status = String(row.status ?? 'draft');
        r.currency = String(row.currency ?? 'GBP');
        r.hourlyRateMinor = Number(row.hourly_rate_minor ?? 0);
        r.vatRatePct = Number(row.vat_rate_pct ?? 20);
        r.showLaborBreakdown = Boolean(row.show_labor_breakdown ?? false);
        r.appliedLaborToggleIds = String(row.applied_labor_toggle_ids ?? '[]');
      }));
    }
    for (const row of backup.lineItems) {
      creates.push(database.get<LineItemModel>('line_items').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.estimateId = String(row.estimate_id ?? '');
        r.sourceAssemblyId = row.source_assembly_id != null ? String(row.source_assembly_id) : null;
        r.locationId = row.location_id != null ? String(row.location_id) : null;
        r.description = String(row.description ?? '');
        r.quantity = row.quantity != null ? Number(row.quantity) : null;
        r.quantityMeters = row.quantity_meters != null ? Number(row.quantity_meters) : null;
        r.resolvedMaterialCostMinor = Number(row.resolved_material_cost_minor ?? 0);
        r.laborBaseHours = Number(row.labor_base_hours ?? 0);
        r.overridesJson = row.overrides_json != null ? String(row.overrides_json) : null;
        r.appliedLaborToggleIds = String(row.applied_labor_toggle_ids ?? '[]');
      }));
    }
    for (const row of backup.assemblies ?? []) {
      creates.push(database.get<AssemblyModel>('assemblies').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.name = String(row.name ?? '');
        r.category = String(row.category ?? '');
        r.baseLaborHours = Number(row.base_labor_hours ?? 0);
        r.quickQuoteIcon = row.quick_quote_icon != null ? String(row.quick_quote_icon) : null;
        r.quickQuoteRank = row.quick_quote_rank != null ? Number(row.quick_quote_rank) : null;
      }));
    }
    for (const row of backup.assemblyComponents ?? []) {
      creates.push(database.get<AssemblyComponentModel>('assembly_components').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.assemblyId = String(row.assembly_id ?? '');
        r.materialId = String(row.material_id ?? '');
        r.quantity = Number(row.quantity ?? 0);
        r.wasteFactor = row.waste_factor != null ? Number(row.waste_factor) : null;
      }));
    }
    for (const row of (backup.photos ?? [])) {
      creates.push(database.get<PhotoModel>('photos').prepareCreate((r) => {
        r._raw.id = String(row.id);
        r.projectId = String(row.project_id ?? '');
        r.lineItemId = row.line_item_id != null ? String(row.line_item_id) : null;
        r.locationId = row.location_id != null ? String(row.location_id) : null;
        r.filePath = String(row.file_path ?? '');
        r.quality = String(row.quality ?? 'medium');
        r.visibility = 'internal';
        r.capturedAt = Number(row.captured_at ?? 0);
        r.caption = row.caption != null ? String(row.caption) : null;
        r.note = row.note != null ? String(row.note) : null;
      }));
    }

    await database.batch(...creates);
  });

  const pc = backup.projects.length;
  const ec = backup.estimates.length;
  const phc = (backup.photos ?? []).length;
  return {
    restored: true,
    message: `Restored ${pc} project${pc !== 1 ? 's' : ''}, ${ec} estimate${ec !== 1 ? 's' : ''}, ${phc} photo${phc !== 1 ? 's' : ''}.`,
  };
}
