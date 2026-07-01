/**
 * WatermelonDB model classes (Approach 2: thin storage layer).
 *
 * One class per schema table — WatermelonDB requires this to manage rows. They
 * carry just enough decorated fields to read/write. All Raw<->domain
 * translation stays in the existing tested mappers; these models are only the
 * SQLite storage surface. Decorators work via tsconfig experimentalDecorators
 * (no Babel plugin on SDK 54).
 */
import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

export class MaterialModel extends Model {
  static table = 'materials';
  @text('sku') sku!: string;
  @text('description') description!: string;
  @text('unit') unit!: string;
  @field('unit_cost_minor') unitCostMinor!: number;
  @text('catalogue_id') catalogueId!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class AssemblyModel extends Model {
  static table = 'assemblies';
  @text('name') name!: string;
  @text('category') category!: string;
  @field('base_labor_hours') baseLaborHours!: number;
  @text('quick_quote_icon') quickQuoteIcon!: string | null;
  @field('quick_quote_rank') quickQuoteRank!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class AssemblyComponentModel extends Model {
  static table = 'assembly_components';
  @text('assembly_id') assemblyId!: string;
  @text('material_id') materialId!: string;
  @field('quantity') quantity!: number;
  @field('waste_factor') wasteFactor!: number | null;
}

export class LaborToggleModel extends Model {
  static table = 'labor_toggles';
  @text('label') label!: string;
  @text('toggle_type') toggleType!: string;
  @field('value') value!: number;
  @text('applies_to') appliesTo!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class ProjectModel extends Model {
  static table = 'projects';
  @text('name') name!: string;
  @text('client_name') clientName!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class LocationModel extends Model {
  static table = 'locations';
  @text('project_id') projectId!: string;
  @text('parent_id') parentId!: string | null;
  @text('name') name!: string;
  @field('sort_order') sortOrder!: number;
}

export class EstimateModel extends Model {
  static table = 'estimates';
  @text('project_id') projectId!: string | null;
  @text('mode') mode!: string;
  @text('status') status!: string;
  @text('currency') currency!: string;
  @field('hourly_rate_minor') hourlyRateMinor!: number;
  @field('vat_rate_pct') vatRatePct!: number;
  @field('show_labor_breakdown') showLaborBreakdown!: boolean | null;
  @text('applied_labor_toggle_ids') appliedLaborToggleIds!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class LineItemModel extends Model {
  static table = 'line_items';
  @text('estimate_id') estimateId!: string;
  @text('source_assembly_id') sourceAssemblyId!: string | null;
  @text('location_id') locationId!: string | null;
  @text('description') description!: string;
  @field('quantity') quantity!: number | null;
  @field('quantity_meters') quantityMeters!: number | null;
  @field('resolved_material_cost_minor') resolvedMaterialCostMinor!: number;
  @field('labor_base_hours') laborBaseHours!: number;
  @text('overrides_json') overridesJson!: string | null;
  @text('applied_labor_toggle_ids') appliedLaborToggleIds!: string;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

export class PhotoModel extends Model {
  static table = 'photos';
  @text('project_id') projectId!: string;
  @text('line_item_id') lineItemId!: string | null;
  @text('location_id') locationId!: string | null;
  @text('file_path') filePath!: string;
  @text('quality') quality!: string;
  @text('visibility') visibility!: string;
  @field('captured_at') capturedAt!: number;
  @text('caption') caption!: string | null;
  @text('note') note!: string | null;
  @text('stage') stage!: string | null;
}

export class SyncQueueModel extends Model {
  static table = 'sync_queue';
  @text('entity_type') entityType!: string;
  @text('entity_id') entityId!: string;
  @text('operation') operation!: string;
  @text('content_hash') contentHash!: string;
  @text('payload_json') payloadJson!: string | null;
  @text('file_path') filePath!: string | null;
  @text('status') status!: string;
  @field('attempts') attempts!: number;
  @field('next_attempt_at') nextAttemptAt!: number;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
