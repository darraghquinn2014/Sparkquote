/**
 * Canonical job categories for assemblies. These always appear as selectable
 * chips in the assembly builder, even before any assembly uses them. Custom
 * categories (added via "+ New") are merged in alongside these at the UI layer.
 */
export const CANONICAL_CATEGORIES: string[] = [
  'Power',
  'Lighting',
  'Distribution',
  'Testing & Inspection',
  'Containment',
  'Heating',
  'Data & Comms',
  'Outdoor',
  'Fire & Safety',
];
