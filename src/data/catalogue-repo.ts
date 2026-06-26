/**
 * Catalogue repository (Approach 2 bridge).
 *
 * Writes seed rows into SQLite on first launch, and reads raw rows back through
 * the EXISTING tested mappers (toMaterial/toAssembly/toLaborToggle) into domain
 * objects. WatermelonDB is pure storage here; all translation stays in the
 * proven mapper layer.
 */
import { Q, Model } from '@nozbe/watermelondb';
import { database } from './database';
import {
  MaterialModel,
  AssemblyModel,
  AssemblyComponentModel,
  LaborToggleModel,
} from './models';
import { toMaterial, toAssembly, toLaborToggle } from './mappers';
import { seedMaterials } from './seed/materials';
import { seedAssemblies, seedComponents, seedLaborToggles } from './seed/assemblies';
import type { Assembly, LaborToggle, Material } from '../domain/types';

/** True if the catalogue tables already hold data. */
export async function isSeeded(): Promise<boolean> {
  const count = await database.get<MaterialModel>('materials').query().fetchCount();
  return count > 0;
}

/** Load all seed data into the DB once, in a single transaction. */
export async function seedIfEmpty(): Promise<void> {
  if (await isSeeded()) return;

  await database.write(async () => {
    const materials = database.get<MaterialModel>('materials');
    const assemblies = database.get<AssemblyModel>('assemblies');
    const components = database.get<AssemblyComponentModel>('assembly_components');
    const toggles = database.get<LaborToggleModel>('labor_toggles');

    const batch: Model[] = [];

    for (const m of seedMaterials) {
      batch.push(
        materials.prepareCreate((r) => {
          r._raw.id = m.id;
          r.sku = m.sku;
          r.description = m.description;
          r.unit = m.unit;
          r.unitCostMinor = m.unit_cost_minor;
          r.catalogueId = m.catalogue_id;
        }),
      );
    }
    for (const a of seedAssemblies) {
      batch.push(
        assemblies.prepareCreate((r) => {
          r._raw.id = a.id;
          r.name = a.name;
          r.category = a.category;
          r.baseLaborHours = a.base_labor_hours;
          r.quickQuoteIcon = a.quick_quote_icon ?? null;
          r.quickQuoteRank = a.quick_quote_rank ?? null;
        }),
      );
    }
    for (const c of seedComponents) {
      batch.push(
        components.prepareCreate((r) => {
          r._raw.id = c.id;
          r.assemblyId = c.assembly_id;
          r.materialId = c.material_id;
          r.quantity = c.quantity;
          r.wasteFactor = c.waste_factor ?? null;
        }),
      );
    }
    for (const t of seedLaborToggles) {
      batch.push(
        toggles.prepareCreate((r) => {
          r._raw.id = t.id;
          r.label = t.label;
          r.toggleType = t.toggle_type;
          r.value = t.value;
          r.appliesTo = t.applies_to;
        }),
      );
    }

    await database.batch(...batch);
  });
}

/** Read the catalogue back out as domain objects via the existing mappers. */
export async function loadCatalogue(): Promise<{
  materials: Material[];
  assemblies: Assembly[];
  toggles: LaborToggle[];
}> {
  const matRows = await database.get<MaterialModel>('materials').query().fetch();
  const asmRows = await database.get<AssemblyModel>('assemblies').query().fetch();
  const compRows = await database.get<AssemblyComponentModel>('assembly_components').query().fetch();
  const togRows = await database.get<LaborToggleModel>('labor_toggles').query().fetch();

  const materials = matRows.map((r) =>
    toMaterial({
      id: r.id,
      sku: r.sku,
      description: r.description,
      unit: r.unit,
      unit_cost_minor: r.unitCostMinor,
      catalogue_id: r.catalogueId,
    }),
  );

  const assemblies = asmRows.map((r) =>
    toAssembly(
      {
        id: r.id,
        name: r.name,
        category: r.category,
        base_labor_hours: r.baseLaborHours,
        quick_quote_icon: r.quickQuoteIcon,
        quick_quote_rank: r.quickQuoteRank,
      },
      compRows
        .filter((c) => c.assemblyId === r.id)
        .map((c) => ({
          id: c.id,
          assembly_id: c.assemblyId,
          material_id: c.materialId,
          quantity: c.quantity,
          waste_factor: c.wasteFactor,
        })),
    ),
  );

  const toggles = togRows.map((r) =>
    toLaborToggle({
      id: r.id,
      label: r.label,
      toggle_type: r.toggleType,
      value: r.value,
      applies_to: r.appliesTo,
    }),
  );

  return { materials, assemblies, toggles };
}

// ── Import commit (implements the CatalogueRepository interface) ────────────
import type { CatalogueRepository } from '../import/commit';
import { EstimateModel as EstModel, LineItemModel as LineModel } from './models';
import { lineItemToRaw } from './mappers';
import type { RawLineItem } from './mappers';

/**
 * WatermelonDB implementation of the import CatalogueRepository.
 * Upserts materials by SKU and persists refreshed draft estimates atomically.
 */
export const dbCatalogueRepo: CatalogueRepository = {
  async commitImport({ materials, refreshedDrafts }) {
    await database.write(async () => {
      const matTable = database.get<MaterialModel>('materials');
      const batch: Model[] = [];

      // Upsert materials by SKU: update existing, insert new.
      const existing = await matTable.query().fetch();
      const bySku = new Map(existing.map((m) => [m.sku, m]));

      for (const m of materials) {
        const row = bySku.get(m.sku);
        if (row) {
          batch.push(
            row.prepareUpdate((r) => {
              r.description = m.description;
              r.unit = m.unit;
              r.unitCostMinor = m.unit_cost_minor;
              r.catalogueId = m.catalogue_id;
            }),
          );
        } else {
          batch.push(
            matTable.prepareCreate((r) => {
              r._raw.id = m.id;
              r.sku = m.sku;
              r.description = m.description;
              r.unit = m.unit;
              r.unitCostMinor = m.unit_cost_minor;
              r.catalogueId = m.catalogue_id;
            }),
          );
        }
      }

      // Persist refreshed draft estimates' line items (new resolved costs).
      for (const draft of refreshedDrafts) {
        const lineTable = database.get<LineModel>('line_items');
        const existingLines = await lineTable
          .query(Q.where('estimate_id', draft.id))
          .fetch();
        const linesById = new Map(existingLines.map((l) => [l.id, l]));
        for (const line of draft.lineItems) {
          const row = linesById.get(line.id);
          const raw = lineItemToRaw(line, draft.id) as RawLineItem;
          if (row) {
            batch.push(
              row.prepareUpdate((r) => {
                r.resolvedMaterialCostMinor = raw.resolved_material_cost_minor;
              }),
            );
          }
        }
      }

      await database.batch(...batch);
    });
  },
};
