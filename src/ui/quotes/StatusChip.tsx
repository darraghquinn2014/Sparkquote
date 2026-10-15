import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EstimateStatus } from '../../domain/types';
import { QUOTE_STATUS_LABELS } from '../../domain/quotes';
import { colors, radius } from '../theme/tokens';

export const QUOTE_STATUS_COLORS: Record<EstimateStatus, string> = {
  draft: colors.textMuted,
  sent: colors.accent,
  accepted: colors.catTesting,
  declined: colors.danger,
  invoiced: colors.catDistribution,
};

/** Small coloured pill showing a quote's status — or "Chase up" when overdue. */
export function StatusChip({ status, chaseUp = false }: { status: EstimateStatus; chaseUp?: boolean }) {
  const color = chaseUp ? colors.danger : QUOTE_STATUS_COLORS[status];
  return (
    <View style={[styles.chip, { backgroundColor: color + '1A', borderColor: color + '55' }]}>
      <Text style={[styles.text, { color }]}>{chaseUp ? 'Chase up' : QUOTE_STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '800' },
});
