/**
 * RunningTotalBar — the signature element (spec §3.2 speed; design thesis).
 *
 * Always-visible bottom bar showing the one number that matters: the live
 * grand total. This is where the design spends its boldness — the amber accent
 * and the large tabular total are reserved for here. It updates instantly as
 * tiles are tapped, giving the electrician a constant sense of the quote size
 * without leaving the grid.
 *
 * Verified by typecheck + review.
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

interface Props {
  subtotalMinor: number;
  vatAmountMinor: number;
  grandTotalMinor: number;
  currency: 'GBP' | 'EUR';
  lineCount: number;
  vatRatePct: number;
  /** Open the review / line-items sheet. */
  onReview: () => void;
}

function RunningTotalBarBase({
  subtotalMinor,
  vatAmountMinor,
  grandTotalMinor,
  currency,
  lineCount,
  vatRatePct,
  onReview,
}: Props) {
  const empty = lineCount === 0;

  return (
    <View style={styles.bar}>
      <View style={styles.totals}>
        <Text style={styles.label}>
          {empty
            ? 'Tap a job to start pricing'
            : `${lineCount} item${lineCount === 1 ? '' : 's'} · ${formatMoney(subtotalMinor, currency)} + ${vatRatePct}% VAT`}
        </Text>
        <Text style={styles.total}>{formatMoney(grandTotalMinor, currency)}</Text>
      </View>

      <Pressable
        onPress={onReview}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel="Review estimate"
        style={({ pressed }) => [
          styles.reviewBtn,
          empty && styles.reviewBtnDisabled,
          pressed && !empty && styles.reviewBtnPressed,
        ]}
      >
        <Text style={[styles.reviewText, empty && styles.reviewTextDisabled]}>Review</Text>
      </Pressable>
    </View>
  );
}

export const RunningTotalBar = React.memo(RunningTotalBarBase);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl, // safe-area cushion
  },
  totals: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...type.caption,
    color: colors.textSecondary,
  },
  total: {
    ...type.totalLg,
    color: colors.accent, // the one bold colour, on the one number that matters
  },
  reviewBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.bar,
  },
  reviewBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  reviewBtnDisabled: {
    backgroundColor: colors.surfacePressed,
  },
  reviewText: {
    color: colors.accentInk,
    fontSize: 16,
    fontWeight: '800',
  },
  reviewTextDisabled: {
    color: colors.textMuted,
  },
});
