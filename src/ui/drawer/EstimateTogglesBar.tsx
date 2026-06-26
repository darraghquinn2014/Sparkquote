/**
 * EstimateTogglesBar — estimate-wide labour toggles (spec §7).
 *
 * Some toggles apply to the whole job, not one line: Night/Out-of-Hours and
 * Occupied Commercial Premises. They live here (on the review screen) rather
 * than the per-line drawer, since flipping them re-prices every line at once.
 *
 * Verified by typecheck + review.
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { LaborToggle } from '../../domain/types';
import { colors, space, radius, type } from '../theme/tokens';

interface Props {
  toggles: LaborToggle[]; // appliesTo === 'estimate'
  activeIds: string[];
  onToggle: (toggleId: string, on: boolean) => void;
}

function describe(t: LaborToggle): string {
  if (t.type === 'flatMultiplier') return `×${t.value}`;
  return `+${Math.round(t.value * 100)}%`;
}

function EstimateTogglesBarBase({ toggles, activeIds, onToggle }: Props) {
  if (toggles.length === 0) return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.label}>JOB-WIDE LABOUR</Text>
      <View style={styles.chips}>
        {toggles.map((t) => {
          const on = activeIds.includes(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => onToggle(t.id, !on)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t.label}, ${describe(t)}`}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {t.label} · {describe(t)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const EstimateTogglesBar = React.memo(EstimateTogglesBarBase);

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  label: { ...type.eyebrow, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...type.caption, color: colors.textSecondary, fontWeight: '600' },
  chipTextOn: { color: colors.accentInk, fontWeight: '800' },
});
