/**
 * QuickQuoteTile — one tap-to-add tile in the Quick-Quote grid (spec §3.2).
 *
 * A tile is backed by an Assembly. One tap adds it (or increments its quantity)
 * to the running estimate. The tile shows the assembly name, its category band,
 * and its current all-in price so the electrician sees the cost before tapping.
 *
 * Verified by typecheck + review (no device runtime in this environment).
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { Assembly } from '../../domain/types';
import { colors, space, radius, type, TOUCH_MIN, categoryColor } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

interface Props {
  assembly: Assembly;
  /** All-in price for one unit (material + labor), minor units. */
  unitPriceMinor: number;
  currency: 'GBP' | 'EUR';
  /** Quantity already in the estimate for this assembly (0 = none yet). */
  quantityInEstimate: number;
  onPress: (assembly: Assembly) => void;
}

function QuickQuoteTileBase({
  assembly,
  unitPriceMinor,
  currency,
  quantityInEstimate,
  onPress,
}: Props) {
  const band = categoryColor(assembly.category);

  return (
    <Pressable
      onPress={() => onPress(assembly)}
      accessibilityRole="button"
      accessibilityLabel={`Add ${assembly.name}, ${formatMoney(unitPriceMinor, currency)}`}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      {/* category band — informational, muted */}
      <View style={[styles.band, { backgroundColor: band }]} />

      {quantityInEstimate > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{quantityInEstimate}</Text>
        </View>
      )}

      <View style={styles.tileBody}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {assembly.category.toUpperCase()}
        </Text>
        <Text style={styles.label} numberOfLines={2}>
          {assembly.name}
        </Text>
        <Text style={styles.price}>{formatMoney(unitPriceMinor, currency)}</Text>
      </View>
    </Pressable>
  );
}

export const QuickQuoteTile = React.memo(QuickQuoteTileBase);

const styles = StyleSheet.create({
  tile: {
    minHeight: TOUCH_MIN + 40,
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    overflow: 'hidden',
    flex: 1,
    margin: space.xs,
  },
  tilePressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.97 }],
  },
  band: {
    height: 4,
    width: '100%',
  },
  tileBody: {
    padding: space.md,
    gap: space.xs,
    flex: 1,
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...type.eyebrow,
    color: colors.textMuted,
  },
  label: {
    ...type.tileLabel,
    color: colors.textPrimary,
  },
  price: {
    ...type.money,
    color: colors.textSecondary,
  },
  countBadge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  countText: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
