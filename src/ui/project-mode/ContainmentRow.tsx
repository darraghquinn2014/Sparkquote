/**
 * ContainmentRow — a linear containment line in Project Mode (spec §3.3).
 *
 * Shows a containment material (trunking/tray/basket/SWA) with a metre stepper
 * and the live extended cost (metres × per-metre snapshot). The stepper has
 * large +/- targets for gloved use, plus the running line total on the right.
 *
 * Verified by typecheck + review.
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, space, radius, type, TOUCH_MIN } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

interface Props {
  lineId: string;
  description: string;
  meters: number;
  perMeterMinor: number;
  currency: 'GBP' | 'EUR';
  onChangeMeters: (lineId: string, meters: number) => void;
}

function ContainmentRowBase({
  lineId,
  description,
  meters,
  perMeterMinor,
  currency,
  onChangeMeters,
}: Props) {
  const extended = meters * perMeterMinor;
  const step = (delta: number) => onChangeMeters(lineId, Math.max(0, meters + delta));

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.desc} numberOfLines={1}>{description}</Text>
        <Text style={styles.rate}>{formatMoney(perMeterMinor, currency)}/m</Text>
      </View>

      <View style={styles.stepper}>
        <Pressable
          onPress={() => step(-1)}
          accessibilityRole="button"
          accessibilityLabel={`Reduce ${description} by one metre`}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
        >
          <Text style={styles.stepGlyph}>−</Text>
        </Pressable>

        <View style={styles.meterBox}>
          <Text style={styles.meterValue}>{meters}</Text>
          <Text style={styles.meterUnit}>m</Text>
        </View>

        <Pressable
          onPress={() => step(1)}
          accessibilityRole="button"
          accessibilityLabel={`Add one metre of ${description}`}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
        >
          <Text style={styles.stepGlyph}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.extended}>{formatMoney(extended, currency)}</Text>
    </View>
  );
}

export const ContainmentRow = React.memo(ContainmentRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  info: { flex: 1, gap: 2 },
  desc: { ...type.body, color: colors.textPrimary, fontWeight: '600' },
  rate: { ...type.caption, color: colors.textMuted },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ground,
    borderRadius: radius.pill,
  },
  stepBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  stepBtnPressed: { backgroundColor: colors.surfacePressed },
  stepGlyph: { color: colors.accent, fontSize: 22, fontWeight: '800', lineHeight: 24 },
  meterBox: { flexDirection: 'row', alignItems: 'baseline', minWidth: 44, justifyContent: 'center' },
  meterValue: { ...type.money, color: colors.textPrimary, fontWeight: '700' },
  meterUnit: { ...type.caption, color: colors.textMuted, marginLeft: 2 },
  extended: { ...type.money, color: colors.textSecondary, minWidth: 64, textAlign: 'right' },
});
