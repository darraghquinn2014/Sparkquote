/**
 * Design tokens (spec §11.4 field usability).
 *
 * Direction: a working instrument for electricians on-site, not a marketing
 * surface. Decisions are made for legibility in poor light, one-handed reach,
 * and gloved taps — not for showroom polish.
 *
 *  - Palette: deep slate ground (reads in dim plant rooms, saves OLED battery)
 *    with a single high-visibility "live wire" amber accent reserved for the
 *    one thing that matters most: the running total and the active tap.
 *    Category hues are muted, never competing with the accent.
 *  - Type: large, tabular figures for money (so digits don't jump as totals
 *    change). System font stack — on a tool, familiarity beats novelty.
 *  - Touch: 64px minimum tile height, generous spacing for gloves.
 */

export const colors = {
  ground: '#14181F', // deep slate, primary background
  surface: '#1E242E', // raised cards / tiles
  surfacePressed: '#2A323F', // tile while pressed
  hairline: '#2E3744', // dividers, 1px
  textPrimary: '#F2F5F8',
  textSecondary: '#9AA7B4',
  textMuted: '#5E6B79',
  accent: '#FFB020', // "live wire" amber — totals & active state ONLY
  accentInk: '#14181F', // text on accent
  // muted category hues — informational, never louder than the accent
  catPower: '#5B8DEF',
  catLighting: '#E0B341',
  catDistribution: '#C56BD6',
  catTesting: '#4FB286',
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
