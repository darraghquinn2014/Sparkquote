/**
 * Seed material catalogue — UK baseline pack (spec §2, §4.3).
 *
 * ⚠️  PROVENANCE / SME SIGN-OFF REQUIRED (spec §13.2)
 * These are PLACEHOLDER indicative figures to make the app functional for
 * development and demo. They are NOT verified trade prices. Before any release,
 * a qualified UK electrician / wholesaler price file must replace these, and
 * BS 7671 / EICR terminology must be reviewed for accuracy.
 *
 * Prices are integer minor units (pence). Currency is set per workspace.
 * SKUs use a SPARK- dev prefix to make placeholder origin obvious in the UI.
 */

import type { RawMaterial } from '../mappers';

export const UK_CATALOGUE_ID = 'baseline-uk';

export const seedMaterials: RawMaterial[] = [
  // Accessories
  { id: 'mat_sw1g', sku: 'SPARK-SW1G', description: '1-gang 1-way switch, white moulded', unit: 'each', unit_cost_minor: 180, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_sw2g', sku: 'SPARK-SW2G', description: '2-gang 2-way switch, white moulded', unit: 'each', unit_cost_minor: 260, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_skt2g', sku: 'SPARK-SKT2G', description: 'Double socket 13A, white moulded', unit: 'each', unit_cost_minor: 320, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_skt2g_usb', sku: 'SPARK-SKT2G-USB', description: 'Double socket 13A with USB-A/C', unit: 'each', unit_cost_minor: 1450, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_fcu', sku: 'SPARK-FCU', description: 'Switched fused connection unit 13A', unit: 'each', unit_cost_minor: 480, catalogue_id: UK_CATALOGUE_ID },

  // Back boxes / containment fixings
  { id: 'mat_bb25', sku: 'SPARK-BB25', description: 'Galv steel back box 25mm', unit: 'each', unit_cost_minor: 120, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bb35', sku: 'SPARK-BB35', description: 'Galv steel back box 35mm', unit: 'each', unit_cost_minor: 150, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bbdry', sku: 'SPARK-BBDRY', description: 'Dry-lining box 35mm', unit: 'each', unit_cost_minor: 95, catalogue_id: UK_CATALOGUE_ID },

  // Cable (per metre)
  { id: 'mat_te15', sku: 'SPARK-TE15', description: 'Twin & Earth 6242Y 1.5mm²', unit: 'm', unit_cost_minor: 78, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_te25', sku: 'SPARK-TE25', description: 'Twin & Earth 6242Y 2.5mm²', unit: 'm', unit_cost_minor: 110, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_te6', sku: 'SPARK-TE6', description: 'Twin & Earth 6242Y 6.0mm²', unit: 'm', unit_cost_minor: 245, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_swa25_3', sku: 'SPARK-SWA25-3', description: 'SWA armoured 2.5mm² 3-core', unit: 'm', unit_cost_minor: 320, catalogue_id: UK_CATALOGUE_ID },

  // Containment (per metre) — the linear-tracked items (spec §3.3)
  { id: 'mat_trunk_pvc50', sku: 'SPARK-TRK-PVC50', description: 'PVC trunking 50×50mm', unit: 'm', unit_cost_minor: 540, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_trunk_met50', sku: 'SPARK-TRK-MET50', description: 'Galv metal trunking 50×50mm', unit: 'm', unit_cost_minor: 980, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_tray_med', sku: 'SPARK-TRAY-300', description: 'Cable tray 300mm medium duty', unit: 'm', unit_cost_minor: 1420, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_basket_100', sku: 'SPARK-BSK-100', description: 'Wire basket 100mm', unit: 'm', unit_cost_minor: 760, catalogue_id: UK_CATALOGUE_ID },

  // Protection / distribution
  { id: 'mat_rcbo_b16', sku: 'SPARK-RCBO-B16', description: 'RCBO Type B 16A 30mA', unit: 'each', unit_cost_minor: 1850, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rcbo_b32', sku: 'SPARK-RCBO-B32', description: 'RCBO Type B 32A 30mA', unit: 'each', unit_cost_minor: 1950, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cu_10way', sku: 'SPARK-CU-10', description: 'Consumer unit 10-way metal, dual RCD', unit: 'each', unit_cost_minor: 8900, catalogue_id: UK_CATALOGUE_ID },

  // Lighting
  { id: 'mat_dl_led', sku: 'SPARK-DL-LED', description: 'LED downlight fire-rated IP65', unit: 'each', unit_cost_minor: 890, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_pendant', sku: 'SPARK-PEND', description: 'Pendant set with ceiling rose', unit: 'each', unit_cost_minor: 420, catalogue_id: UK_CATALOGUE_ID },

  // Sundries
  { id: 'mat_terminal', sku: 'SPARK-WAGO', description: 'Lever connector 3-way (pack rate each)', unit: 'each', unit_cost_minor: 45, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_grommet', sku: 'SPARK-GROM', description: 'Rubber grommet strip (per box)', unit: 'each', unit_cost_minor: 30, catalogue_id: UK_CATALOGUE_ID },
];
