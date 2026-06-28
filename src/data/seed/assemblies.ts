/**
 * Seed assemblies + Quick-Quote pack + labor toggles (spec §3.2, §5, §7).
 *
 * ⚠️  SME SIGN-OFF REQUIRED (spec §13.2): component quantities, waste factors,
 * and base labor hours are indicative for development, not verified trade
 * norms. The real 200-item Quick-Quote pack must be authored/reviewed by a
 * qualified electrician.
 *
 * This file ships a representative SUBSET demonstrating the structure the full
 * pack follows: each Quick-Quote tile is backed by an Assembly so even a fast
 * "quick fix" carries correct materials + base labor (spec §3.2).
 */

import type { RawAssembly, RawAssemblyComponent, RawLaborToggle } from '../mappers';

export const seedAssemblies: RawAssembly[] = [
  {
    id: 'asm_lightswitch_1g', name: 'Install 1-Gang Light Switch', category: 'Lighting',
    base_labor_hours: 0.5, quick_quote_icon: 'toggle-left', quick_quote_rank: 1,
  },
  {
    id: 'asm_double_socket', name: 'Install Double Socket', category: 'Power',
    base_labor_hours: 0.4, quick_quote_icon: 'plug', quick_quote_rank: 2,
  },
  {
    id: 'asm_add_socket', name: 'Install Double Socket (new spur)', category: 'Power',
    base_labor_hours: 1.2, quick_quote_icon: 'plug-zap', quick_quote_rank: 3,
  },
  {
    id: 'asm_downlight', name: 'Install LED Downlight', category: 'Lighting',
    base_labor_hours: 0.75, quick_quote_icon: 'lightbulb', quick_quote_rank: 4,
  },
  {
    id: 'asm_cu_swap', name: 'Install Consumer Unit (10-way)', category: 'Distribution',
    base_labor_hours: 5.0, quick_quote_icon: 'layout-grid', quick_quote_rank: 5,
  },
  {
    id: 'asm_fcu', name: 'Install Switched FCU', category: 'Power',
    base_labor_hours: 0.6, quick_quote_icon: 'square-power', quick_quote_rank: 6,
  },
];

export const seedComponents: RawAssemblyComponent[] = [
  // 1-Way Light Switch: switch + box + 5m of 1.5mm² + connectors
  { id: 'cmp_ls_1', assembly_id: 'asm_lightswitch_1g', material_id: 'mat_sw1g', quantity: 1 },
  { id: 'cmp_ls_2', assembly_id: 'asm_lightswitch_1g', material_id: 'mat_bb25', quantity: 1 },
  { id: 'cmp_ls_3', assembly_id: 'asm_lightswitch_1g', material_id: 'mat_te15', quantity: 5, waste_factor: 1.1 },
  { id: 'cmp_ls_4', assembly_id: 'asm_lightswitch_1g', material_id: 'mat_terminal', quantity: 2 },

  // Replace Double Socket: just the socket + connectors (reuses existing box)
  { id: 'cmp_ds_1', assembly_id: 'asm_double_socket', material_id: 'mat_skt2g', quantity: 1 },
  { id: 'cmp_ds_2', assembly_id: 'asm_double_socket', material_id: 'mat_terminal', quantity: 2 },

  // Add Double Socket (spur): socket + box + 6m 2.5mm² + FCU + connectors
  { id: 'cmp_as_1', assembly_id: 'asm_add_socket', material_id: 'mat_skt2g', quantity: 1 },
  { id: 'cmp_as_2', assembly_id: 'asm_add_socket', material_id: 'mat_bb35', quantity: 1 },
  { id: 'cmp_as_3', assembly_id: 'asm_add_socket', material_id: 'mat_te25', quantity: 6, waste_factor: 1.1 },
  { id: 'cmp_as_4', assembly_id: 'asm_add_socket', material_id: 'mat_fcu', quantity: 1 },

  // LED Downlight: fitting + 4m 1.5mm² + connectors
  { id: 'cmp_dl_1', assembly_id: 'asm_downlight', material_id: 'mat_dl_led', quantity: 1 },
  { id: 'cmp_dl_2', assembly_id: 'asm_downlight', material_id: 'mat_te15', quantity: 4, waste_factor: 1.1 },
  { id: 'cmp_dl_3', assembly_id: 'asm_downlight', material_id: 'mat_terminal', quantity: 1 },

  // Consumer Unit swap: CU + 10 RCBOs + grommets
  { id: 'cmp_cu_1', assembly_id: 'asm_cu_swap', material_id: 'mat_cu_10way', quantity: 1 },
  { id: 'cmp_cu_2', assembly_id: 'asm_cu_swap', material_id: 'mat_rcbo_b16', quantity: 6 },
  { id: 'cmp_cu_3', assembly_id: 'asm_cu_swap', material_id: 'mat_rcbo_b32', quantity: 4 },
  { id: 'cmp_cu_4', assembly_id: 'asm_cu_swap', material_id: 'mat_grommet', quantity: 1 },

  // Switched FCU: unit + box + 2m 2.5mm² + connectors
  { id: 'cmp_fcu_1', assembly_id: 'asm_fcu', material_id: 'mat_fcu', quantity: 1 },
  { id: 'cmp_fcu_2', assembly_id: 'asm_fcu', material_id: 'mat_bb25', quantity: 1 },
  { id: 'cmp_fcu_3', assembly_id: 'asm_fcu', material_id: 'mat_te25', quantity: 2, waste_factor: 1.1 },
  { id: 'cmp_fcu_4', assembly_id: 'asm_fcu', material_id: 'mat_terminal', quantity: 2 },
];

/** The three toggles named in spec §6/§7, plus structure for adding more. */
export const seedLaborToggles: RawLaborToggle[] = [
  { id: 'tgl_height', label: 'High Working Height', toggle_type: 'percentage', value: 0.15, applies_to: 'line' },
  { id: 'tgl_ooh', label: 'Night / Out-of-Hours', toggle_type: 'flatMultiplier', value: 1.5, applies_to: 'estimate' },
  { id: 'tgl_occupied', label: 'Occupied Commercial Premises', toggle_type: 'timeBuffer', value: 0.10, applies_to: 'estimate' },
];
