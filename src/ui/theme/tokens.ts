/**
 * Design tokens (spec §11.4 field usability).
 *
 * Direction: a working instrument for electricians on-site, not a marketing
 * surface. Decisions are made for legibility in bright daylight, one-handed
 * reach, and gloved taps — not for showroom polish.
 *
 *  - Palette: bright, clean ground (reads well in direct sunlight on-site)
 *    with a single high-visibility "live wire" blue accent reserved for the
 *    one thing that matters most: the running total and the active tap.
 *    Category hues are muted, never competing with the accent.
 *  - Type: large, tabular figures for money (so digits don't jump as totals
 *    change). System font stack — on a tool, familiarity beats novelty.
 *  - Touch: 64px minimum tile height, generous spacing for gloves.
 */

export const colors = {
  ground: '#F5F7FA', // soft off-white, primary background
  surface: '#FFFFFF', // raised cards / tiles
  surfacePressed: '#E8ECF2', // tile while pressed
  hairline: '#D8E0EA', // dividers, blue-tinted
  textPrimary: '#0B1220',
  textSecondary: '#48607A',
  textMuted: '#8CA0B8',
  accent: '#1B8FFF', // electric blue — totals & active state
  accentSecondary: '#0092B0', // deep cyan — badges & highlights
  accentInk: '#FFFFFF', // text on accent buttons
  // category hues
  catPower: '#2B6EE8',
  catLighting: '#B8860B',
  catDistribution: '#9B5DE5',
  catTesting: '#049C77',
  danger: '#E5564B',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  tile: 14,
  bar: 18,
  pill: 999,
} as const;

export const type = {
  // money uses tabular figures so digits hold their position as totals tick
  totalLg: { fontSize: 34, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  money: { fontSize: 17, fontWeight: '600' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  tileLabel: { fontSize: 15, fontWeight: '600' as const, lineHeight: 19 },
  eyebrow: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
} as const;

/** Minimum touch target — generous for gloved hands (spec §11.4). */
export const TOUCH_MIN = 64;

/** Map an assembly category to its muted hue. */
export function categoryColor(category: string): string {
  switch (category) {
    case 'Power': return colors.catPower;
    case 'Lighting': return colors.catLighting;
    case 'Distribution': return colors.catDistribution;
    case 'Testing': return colors.catTesting;
    default: return colors.textSecondary;
  }
}
