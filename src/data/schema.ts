/**
 * WatermelonDB schema (spec §1.2, §3.4, §5.2).
 *
 * Tables mirror the domain model. Note the deliberate choices:
 *  - money columns are integer minor units (SQLite INTEGER), never floats.
 *  - photos store a file PATH only; binaries live on the filesystem (spec §8).
 *  - line_items carry resolved_material_cost_minor — the snapshot (spec §5.4).
 *
 * This file is a plain data description and is unit-tested for structural
 * correctness without a running database.
 */

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 9,
  tables: [
    // ── Catalogue ────────────────────────────────────────────────────────
    tableSchema({
      name: 'materials',
      columns: [
        { name: 'sku', type: 'string', isIndexed: true },
        { name: 'description', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'unit_cost_minor', type: 'number' }, // integer minor units
        { name: 'catalogue_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── Assemblies & their components ────────────────────────────────────
    tableSchema({
      name: 'assemblies',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'base_labor_hours', type: 'number' },
        // Quick-Quote pack metadata (spec §3.2): which tiles surface this assembly
        { name: 'quick_quote_icon', type: 'string', isOptional: true },
        { name: 'quick_quote_rank', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'assembly_components',
      columns: [
        { name: 'assembly_id', type: 'string', isIndexed: true },
        { name: 'material_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'waste_factor', type: 'number', isOptional: true },
      ],
    }),

    // ── Labor toggles (spec §7) ──────────────────────────────────────────
    tableSchema({
      name: 'labor_toggles',
      columns: [
        { name: 'label', type: 'string' },
        { name: 'toggle_type', type: 'string' }, // percentage | flatMultiplier | timeBuffer
        { name: 'value', type: 'number' },
        { name: 'applies_to', type: 'string' }, // line | estimate
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── Projects & physical locations (spec §3.3) ────────────────────────
    tableSchema({
      name: 'projects',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'client_name', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'parent_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'sort_order', type: 'number' },
      ],
    }),

    // ── Estimates & line items ───────────────────────────────────────────
    tableSchema({
      name: 'estimates',
      columns: [
        { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'mode', type: 'string' }, // quick | project
        { name: 'status', type: 'string' }, // draft | sent | signed
        { name: 'currency', type: 'string' },
        { name: 'hourly_rate_minor', type: 'number' },
        { name: 'vat_rate_pct', type: 'number' },
        { name: 'show_labor_breakdown', type: 'boolean', isOptional: true },
        // estimate-wide toggle ids, JSON-encoded array of strings
        { name: 'applied_labor_toggle_ids', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'line_items',
      columns: [
        { name: 'estimate_id', type: 'string', isIndexed: true },
        { name: 'source_assembly_id', type: 'string', isOptional: true },
        { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'description', type: 'string' },
        { name: 'quantity', type: 'number', isOptional: true },
        { name: 'quantity_meters', type: 'number', isOptional: true },
        { name: 'resolved_material_cost_minor', type: 'number' }, // snapshot, §5.4
        { name: 'labor_base_hours', type: 'number' },
        // overrides, JSON-encoded (null when none)
        { name: 'overrides_json', type: 'string', isOptional: true },
        // line-level toggle ids, JSON-encoded array
        { name: 'applied_labor_toggle_ids', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── Internal media (spec §8): PATH only, never the binary ────────────
    tableSchema({
      name: 'photos',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'line_item_id', type: 'string', isOptional: true },
        { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'file_path', type: 'string' },
        { name: 'quality', type: 'string' }, // low | medium | high
        { name: 'visibility', type: 'string' }, // always 'internal' — never in client PDF
        { name: 'captured_at', type: 'number' },
        { name: 'caption', type: 'string', isOptional: true },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'stage', type: 'string', isOptional: true },
      ],
    }),

    // ── Floor plans, traced walls, and tagged electrical symbols ─────────
    tableSchema({
      name: 'floor_plans',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isIndexed: true }, // the FLOOR (top-level location)
        { name: 'file_path', type: 'string' },
        { name: 'width', type: 'number' },
        { name: 'height', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'walls',
      columns: [
        { name: 'floor_plan_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isIndexed: true }, // the ROOM
        { name: 'start_x', type: 'number' }, // normalized 0-1, fraction of plan image width
        { name: 'start_y', type: 'number' },
        { name: 'end_x', type: 'number' },
        { name: 'end_y', type: 'number' },
        { name: 'label', type: 'string', isOptional: true },
        { name: 'photo_id', type: 'string', isOptional: true, isIndexed: true }, // the ONE reference photo
        { name: 'sort_order', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'wall_symbols',
      columns: [
        { name: 'wall_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' }, // SymbolType
        { name: 'position_along_wall', type: 'number' }, // 0-1, shared plan/photo horizontal
        { name: 'photo_y', type: 'number' }, // 0-1, photo-only vertical
        { name: 'color', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Snag items: punch list per project ───────────────────────────────
    tableSchema({
      name: 'snag_items',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isOptional: true, isIndexed: true }, // floor or room
        { name: 'description', type: 'string' },
        { name: 'resolved', type: 'boolean' },
        { name: 'photo_path', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── Sync queue (spec §9): outbound backup operations ─────────────────
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'entity_type', type: 'string', isIndexed: true }, // estimate | project | photo
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'operation', type: 'string' }, // upsert | delete
        { name: 'content_hash', type: 'string' }, // idempotency key
        { name: 'payload_json', type: 'string', isOptional: true },
        { name: 'file_path', type: 'string', isOptional: true }, // for photo binaries
        { name: 'status', type: 'string', isIndexed: true }, // pending | inflight | done | failed
        { name: 'attempts', type: 'number' },
        { name: 'next_attempt_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
