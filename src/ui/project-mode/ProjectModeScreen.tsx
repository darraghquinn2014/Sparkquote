/**
 * ProjectModeScreen (spec §3.3).
 *
 * The Fit-out / Project workflow: a building outline organised by physical
 * location, with linear containment tracking. Each floor/room shows its
 * rolled-up total; a persistent header shows the project grand total.
 *
 * Reuses the SAME Estimate model and engine as Quick-Quote — Project Mode is a
 * different way to ADD and ORGANISE lines, not a different pricing path.
 *
 * Verified by typecheck + review (no device runtime here).
 */

import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import type { Estimate, LaborToggle, Location, Material } from '../../domain/types';
import { colors, space, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { LocationTreeNode } from './LocationTreeNode';
import { useProjectMode } from './useProjectMode';

interface Props {
  project: { id: string; name: string; clientName?: string };
  estimate: Estimate;
  locations: Location[];
  toggles: LaborToggle[];
  /** Opens the containment material picker for a location; returns chosen material + metres. */
  onPickContainment: (locationId: string) => void;
}

export function ProjectModeScreen({
  project,
  estimate,
  locations,
  toggles,
  onPickContainment,
}: Props) {
  const pm = useProjectMode(estimate, locations, toggles);
  const currency = estimate.currency;

  const linesFor = (locationId: string) =>
    pm.estimate.lineItems.filter((l) => l.locationId === locationId);
  const rolledUpFor = (locationId: string) =>
    pm.rollUp.byLocation.get(locationId)?.rolledUpMinor ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PROJECT</Text>
        <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
        {project.clientName ? (
          <Text style={styles.client} numberOfLines={1}>{project.clientName}</Text>
        ) : null}

        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>Project total (inc. VAT)</Text>
          <Text style={styles.totalValue}>{formatMoney(pm.grandTotalMinor, currency)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.tree}>
        {pm.tree.length === 0 ? (
          <Text style={styles.empty}>
            No areas yet. Add a floor or room to start scoping this fit-out.
          </Text>
        ) : (
          pm.tree.map((node) => (
            <LocationTreeNode
              key={node.location.id}
              node={node}
              depth={0}
              currency={currency}
              rolledUpFor={rolledUpFor}
              linesFor={linesFor}
              onChangeMeters={pm.updateMeters}
              onAddContainment={onPickContainment}
            />
          ))
        )}

        {pm.rollUp.unassignedMinor > 0 && (
          <View style={styles.unassigned}>
            <Text style={styles.unassignedLabel}>Unassigned items</Text>
            <Text style={styles.unassignedValue}>
              {formatMoney(pm.rollUp.unassignedMinor, currency)}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: 2,
  },
  eyebrow: { ...type.eyebrow, color: colors.textMuted },
  projectName: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  client: { ...type.caption, color: colors.textSecondary },
  totalBlock: { marginTop: space.lg, gap: 2 },
  totalLabel: { ...type.caption, color: colors.textSecondary },
  totalValue: { ...type.totalLg, color: colors.accent },
  tree: { paddingBottom: space.xxl },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl, ...type.body, paddingHorizontal: space.xl },
  unassigned: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginTop: space.lg,
  },
  unassignedLabel: { ...type.body, color: colors.textSecondary },
  unassignedValue: { ...type.money, color: colors.textSecondary },
});
