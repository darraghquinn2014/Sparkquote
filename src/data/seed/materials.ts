/**
 * Seed material catalogue — UK/Ireland baseline trade cost prices.
 *
 * Prices are trade/wholesale COST in minor units (pence/cents).
 * The app applies your markup % on top when quoting.
 *
 * Last reviewed: June 2026. Cable prices track copper — recheck quarterly.
 * SKUs use SPARK- prefix; swap with your wholesaler's SKUs via Settings → Import.
 */

import type { RawMaterial } from '../mappers';

export const UK_CATALOGUE_ID = 'baseline-uk';

export const seedMaterials: RawMaterial[] = [
  // ── Wiring accessories ────────────────────────────────────────────────────
  { id: 'mat_sw1g',       sku: 'SPARK-SW1G',      description: '1-gang 1-way switch, white moulded',        unit: 'each', unit_cost_minor:  185, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_sw2g',       sku: 'SPARK-SW2G',      description: '2-gang 2-way switch, white moulded',        unit: 'each', unit_cost_minor:  280, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_sw1g_2w',    sku: 'SPARK-SW1G-2W',   description: '1-gang 2-way switch, white moulded',        unit: 'each', unit_cost_minor:  195, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_skt1g',      sku: 'SPARK-SKT1G',     description: 'Single socket 13A, white moulded',          unit: 'each', unit_cost_minor:  220, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_skt2g',      sku: 'SPARK-SKT2G',     description: 'Double socket 13A, white moulded',          unit: 'each', unit_cost_minor:  380, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_skt2g_usb',  sku: 'SPARK-SKT2G-USB', description: 'Double socket 13A with USB-A/C',            unit: 'each', unit_cost_minor: 1400, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_fcu',        sku: 'SPARK-FCU',        description: 'Switched fused connection unit 13A',        unit: 'each', unit_cost_minor:  550, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_fcu_uns',    sku: 'SPARK-FCU-U',      description: 'Unswitched fused connection unit 13A',      unit: 'each', unit_cost_minor:  480, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cooker_sw',  sku: 'SPARK-CKR-SW',    description: 'Cooker switch 45A DP, white',               unit: 'each', unit_cost_minor:  650, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_shaver',     sku: 'SPARK-SHVR',       description: 'Shaver socket dual voltage, white',         unit: 'each', unit_cost_minor:  950, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_skt_ext',    sku: 'SPARK-EXT-SKT',    description: 'Weatherproof outdoor socket 13A IP66',      unit: 'each', unit_cost_minor:  890, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_flex_out',   sku: 'SPARK-FLEX',       description: 'Flex outlet plate, white',                  unit: 'each', unit_cost_minor:  180, catalogue_id: UK_CATALOGUE_ID },

  // ── Back boxes / pattresses ───────────────────────────────────────────────
  { id: 'mat_bb25',       sku: 'SPARK-BB25',       description: 'Galv steel back box 25mm 1-gang',           unit: 'each', unit_cost_minor:  100, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bb35',       sku: 'SPARK-BB35',       description: 'Galv steel back box 35mm 1-gang',           unit: 'each', unit_cost_minor:  120, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bb25_2g',    sku: 'SPARK-BB25-2G',    description: 'Galv steel back box 25mm 2-gang',           unit: 'each', unit_cost_minor:  130, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bb35_2g',    sku: 'SPARK-BB35-2G',    description: 'Galv steel back box 35mm 2-gang',           unit: 'each', unit_cost_minor:  155, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bbdry',      sku: 'SPARK-BBDRY',      description: 'Dry-lining box 35mm 1-gang',                unit: 'each', unit_cost_minor:   85, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bbdry_2g',   sku: 'SPARK-BBDRY-2G',   description: 'Dry-lining box 35mm 2-gang',                unit: 'each', unit_cost_minor:  100, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_surf_1g',    sku: 'SPARK-SURF-1G',    description: 'Surface pattress 1-gang 25mm',              unit: 'each', unit_cost_minor:   90, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_surf_2g',    sku: 'SPARK-SURF-2G',    description: 'Surface pattress 2-gang 35mm',              unit: 'each', unit_cost_minor:  115, catalogue_id: UK_CATALOGUE_ID },

  // ── Cable (per metre) ─────────────────────────────────────────────────────
  { id: 'mat_te15',       sku: 'SPARK-TE15',       description: 'Twin & Earth 6242Y 1.5mm²',                 unit: 'm',    unit_cost_minor:   75, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_te25',       sku: 'SPARK-TE25',       description: 'Twin & Earth 6242Y 2.5mm²',                 unit: 'm',    unit_cost_minor:  115, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_te40',       sku: 'SPARK-TE40',       description: 'Twin & Earth 6242Y 4.0mm²',                 unit: 'm',    unit_cost_minor:  170, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_te6',        sku: 'SPARK-TE6',        description: 'Twin & Earth 6242Y 6.0mm²',                 unit: 'm',    unit_cost_minor:  230, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_te10',       sku: 'SPARK-TE10',       description: 'Twin & Earth 6242Y 10.0mm²',                unit: 'm',    unit_cost_minor:  380, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_swa25_3',    sku: 'SPARK-SWA25-3',    description: 'SWA armoured 2.5mm² 3-core',               unit: 'm',    unit_cost_minor:  310, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_swa6_3',     sku: 'SPARK-SWA6-3',     description: 'SWA armoured 6.0mm² 3-core',               unit: 'm',    unit_cost_minor:  520, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_3core15',    sku: 'SPARK-3C15',        description: '3-core & Earth 6243Y 1.5mm²',              unit: 'm',    unit_cost_minor:  110, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_flex15',     sku: 'SPARK-FLX15',      description: '3-core flex 0.75mm² (per m)',               unit: 'm',    unit_cost_minor:   35, catalogue_id: UK_CATALOGUE_ID },

  // ── Conduit & trunking (per metre) ───────────────────────────────────────
  { id: 'mat_cond20',     sku: 'SPARK-COND20',     description: 'PVC conduit 20mm (per m)',                  unit: 'm',    unit_cost_minor:   65, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cond25',     sku: 'SPARK-COND25',     description: 'PVC conduit 25mm (per m)',                  unit: 'm',    unit_cost_minor:   90, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_trunk_pvc50',sku: 'SPARK-TRK-PVC50',  description: 'PVC trunking 50×50mm',                      unit: 'm',    unit_cost_minor:  480, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_trunk_met50',sku: 'SPARK-TRK-MET50',  description: 'Galv metal trunking 50×50mm',               unit: 'm',    unit_cost_minor:  920, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_tray_med',   sku: 'SPARK-TRAY-300',   description: 'Cable tray 300mm medium duty',              unit: 'm',    unit_cost_minor: 1350, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_basket_100', sku: 'SPARK-BSK-100',    description: 'Wire basket 100mm',                         unit: 'm',    unit_cost_minor:  720, catalogue_id: UK_CATALOGUE_ID },

  // ── Protection / distribution ─────────────────────────────────────────────
  { id: 'mat_rcbo_b6',    sku: 'SPARK-RCBO-B6',    description: 'RCBO Type B 6A 30mA',                       unit: 'each', unit_cost_minor: 1200, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rcbo_b10',   sku: 'SPARK-RCBO-B10',   description: 'RCBO Type B 10A 30mA',                      unit: 'each', unit_cost_minor: 1200, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rcbo_b16',   sku: 'SPARK-RCBO-B16',   description: 'RCBO Type B 16A 30mA',                      unit: 'each', unit_cost_minor: 1350, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rcbo_b20',   sku: 'SPARK-RCBO-B20',   description: 'RCBO Type B 20A 30mA',                      unit: 'each', unit_cost_minor: 1450, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rcbo_b32',   sku: 'SPARK-RCBO-B32',   description: 'RCBO Type B 32A 30mA',                      unit: 'each', unit_cost_minor: 1550, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rcbo_b40',   sku: 'SPARK-RCBO-B40',   description: 'RCBO Type B 40A 30mA',                      unit: 'each', unit_cost_minor: 1750, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_mcb_b16',    sku: 'SPARK-MCB-B16',    description: 'MCB Type B 16A',                            unit: 'each', unit_cost_minor:  350, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_mcb_b32',    sku: 'SPARK-MCB-B32',    description: 'MCB Type B 32A',                            unit: 'each', unit_cost_minor:  380, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cu_10way',   sku: 'SPARK-CU-10',      description: 'Consumer unit 10-way metal, dual RCD',      unit: 'each', unit_cost_minor: 5800, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cu_18way',   sku: 'SPARK-CU-18',      description: 'Consumer unit 18-way metal, dual RCD',      unit: 'each', unit_cost_minor: 8500, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_isol_100',   sku: 'SPARK-ISOL-100',   description: 'Isolator switch 100A DP',                   unit: 'each', unit_cost_minor: 2800, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_surge',      sku: 'SPARK-SPD',         description: 'Surge protection device (SPD) Type 2',      unit: 'each', unit_cost_minor: 4500, catalogue_id: UK_CATALOGUE_ID },

  // ── Lighting ──────────────────────────────────────────────────────────────
  { id: 'mat_dl_led',     sku: 'SPARK-DL-LED',     description: 'LED downlight fire-rated IP65',             unit: 'each', unit_cost_minor:  750, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_dl_led_pr',  sku: 'SPARK-DL-LED-PR',  description: 'LED downlight fire-rated IP65 dimmable',    unit: 'each', unit_cost_minor: 1100, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_pendant',    sku: 'SPARK-PEND',        description: 'Pendant set with ceiling rose',             unit: 'each', unit_cost_minor:  420, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_batten',     sku: 'SPARK-BAT',         description: 'LED batten 4ft 40W',                       unit: 'each', unit_cost_minor: 1850, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_bulk_led',   sku: 'SPARK-BULK',        description: 'LED bulkhead IP65 10W',                    unit: 'each', unit_cost_minor:  950, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_pir_sw',     sku: 'SPARK-PIR',         description: 'PIR motion sensor switch',                  unit: 'each', unit_cost_minor:  850, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_dimmer',     sku: 'SPARK-DIM',         description: 'Dimmer switch leading edge 400W',           unit: 'each', unit_cost_minor:  620, catalogue_id: UK_CATALOGUE_ID },

  // ── Fire & safety ─────────────────────────────────────────────────────────
  { id: 'mat_smoke',      sku: 'SPARK-SMOKE',       description: 'Optical smoke alarm mains/battery',         unit: 'each', unit_cost_minor: 1800, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_heat',       sku: 'SPARK-HEAT',        description: 'Heat alarm mains/battery',                  unit: 'each', unit_cost_minor: 1800, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_co',         sku: 'SPARK-CO',          description: 'CO detector mains/battery',                 unit: 'each', unit_cost_minor: 2200, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_eml',        sku: 'SPARK-EML',         description: 'Emergency lighting bulkhead 3hr',           unit: 'each', unit_cost_minor: 2800, catalogue_id: UK_CATALOGUE_ID },

  // ── EV charging ───────────────────────────────────────────────────────────
  { id: 'mat_ev_unit',    sku: 'SPARK-EV-7KW',     description: 'EV charger 7kW smart (supply only)',        unit: 'each', unit_cost_minor: 45000, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_ev_cont',    sku: 'SPARK-EV-CNT',     description: 'EV charge point enclosure/trunking kit',    unit: 'each', unit_cost_minor: 3500, catalogue_id: UK_CATALOGUE_ID },

  // ── Earthing & bonding ────────────────────────────────────────────────────
  { id: 'mat_earth_clamp',sku: 'SPARK-ECLAMP',     description: 'Earth bonding clamp (gas/water)',            unit: 'each', unit_cost_minor:  220, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_earth_sl',   sku: 'SPARK-ESL',        description: 'Earth sleeving green/yellow (per m)',       unit: 'm',    unit_cost_minor:   18, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cpc_10',     sku: 'SPARK-CPC10',      description: 'Earth cable 10mm² green/yellow (per m)',    unit: 'm',    unit_cost_minor:  125, catalogue_id: UK_CATALOGUE_ID },

  // ── Sundries ──────────────────────────────────────────────────────────────
  { id: 'mat_terminal',   sku: 'SPARK-WAGO',       description: 'Lever connector 3-way WAGO 221',            unit: 'each', unit_cost_minor:   32, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_terminal_5', sku: 'SPARK-WAGO5',      description: 'Lever connector 5-way WAGO 221',            unit: 'each', unit_cost_minor:   48, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_jbox',       sku: 'SPARK-JBOX',       description: 'Junction box 20A round with terminals',     unit: 'each', unit_cost_minor:  145, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_grommet',    sku: 'SPARK-GROM',       description: 'Rubber grommet strip (per m)',              unit: 'm',    unit_cost_minor:   55, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_clips',      sku: 'SPARK-CLIPS',      description: 'Cable clips oval (bag of 100)',             unit: 'each', unit_cost_minor:  180, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_rawlplug',   sku: 'SPARK-RWL',        description: 'Rawlplug & screw pack (bag of 100)',        unit: 'each', unit_cost_minor:  320, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_tape',       sku: 'SPARK-TAPE',       description: 'Insulation tape black (roll)',              unit: 'each', unit_cost_minor:   85, catalogue_id: UK_CATALOGUE_ID },
  { id: 'mat_cb_tie',     sku: 'SPARK-CTIE',       description: 'Cable ties (bag of 100)',                   unit: 'each', unit_cost_minor:  120, catalogue_id: UK_CATALOGUE_ID },
];
