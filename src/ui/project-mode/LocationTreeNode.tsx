/**
 * LocationTreeNode — one expandable node in the Project Mode building outline.
 *
 * The signature element of this screen: each location (floor/area/room) shows
 * its ROLLED-UP total — the sum of everything beneath it — so the electrician
 * sees cost accruing per room and per floor while surveying. Indentation and a
 * chevron convey depth; the rolled-up figure is the constant anchor.
 *
 * Recursive: a node renders its child nodes and its own containment rows.
 * Verified by typecheck + review.
 */

import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { LocationNode } from '../../domain/location';
import type { LineItem } from '../../domain/types';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { ContainmentRow } from './ContainmentRow';

interface Props {
  node: LocationNode;
  depth: number;
  currency: 'GBP' | 'EUR';
  /** Rolled-up total for a location id (own + descendants). */
  rolledUpFor: (locationId: string) => number;
  /** Lines assigned directly to a location id. */
  linesFor: (locationId: string) => LineItem[];
  onChangeMeters: (lineId: string, meters: number) => void;
  onAddContainment: (locationId: string) => void;
}

function LocationTreeNodeBase({
  node,
  depth,
  currency,
  rolledUpFor,
  linesFor,
  onChangeMeters,
  onAddContainment,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const { location, children } = node;
  const ownLines = linesFor(location.id);
  const rolledUp = rolledUpFor(location.id);
  const hasContents = children.length > 0 || ownLines.length > 0;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={`${location.name}, ${formatMoney(rolledUp, currency)}, ${expanded ? 'expanded' : 'collapsed'}`}
        style={({ pressed }) => [
          styles.header,
          { paddingLeft: space.md + depth * space.lg },
          pressed && styles.headerPressed,
        ]}
      >
        <Text style={[styles.chevron, !hasContents && styles.chevronHidden]}>
          {expanded ? '▾' : '▸'}
        </Text>
        <Text style={[styles.name, depth === 0 && styles.nameFloor]} numberOfLines={1}>
          {location.name}
        </Text>
        <Text style={styles.total}>{formatMoney(rolledUp, currency)}</Text>
      </Pressable>

      {expanded && (
        <View>
          {ownLines.map((l) => (
            <ContainmentRow
              key={l.id}
              lineId={l.id}
              description={l.description}
              meters={l.quantityMeters ?? 0}
              perMeterMinor={l.resolvedMaterialCostMinor}
              currency={currency}
              onChangeMeters={onChangeMeters}
            />
          ))}

          <Pressable
            onPress={() => onAddContainment(location.id)}
            accessibilityRole="button"
            style={[styles.addRow, { paddingLeft: space.md + (depth + 1) * space.lg }]}
          >
            <Text style={styles.addText}>+ Add containment run</Text>
          </Pressable>

          {children.map((child) => (
            <LocationTreeNode
              key={child.location.id}
              node={child}
              depth={depth + 1}
              currency={currency}
              rolledUpFor={rolledUpFor}
              linesFor={linesFor}
              onChangeMeters={onChangeMeters}
              onAddContainment={onAddContainment}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export const LocationTreeNode = React.memo(LocationTreeNodeBase);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingRight: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  headerPressed: { backgroundColor: colors.surfacePressed },
  chevron: { color: colors.textSecondary, fontSize: 13, width: 14 },
  chevronHidden: { opacity: 0 },
  name: { ...type.body, color: colors.textPrimary, flex: 1, fontWeight: '600' },
  nameFloor: { fontSize: 17, fontWeight: '800' },
  total: { ...type.money, color: colors.accent },
  addRow: { paddingVertical: space.sm, paddingRight: space.lg },
  addText: { ...type.caption, color: colors.textSecondary, fontWeight: '600' },
});
