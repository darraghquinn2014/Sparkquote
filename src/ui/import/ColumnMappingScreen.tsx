/**
 * ColumnMappingScreen (spec §4.4) — the wizard's core step.
 *
 * For each canonical field the user picks which spreadsheet column feeds it,
 * with a LIVE preview table updating beneath as they map, plus a validation
 * banner. This live feedback is what makes a messy wholesaler file importable:
 * the electrician sees their real products appearing correctly (or not) before
 * committing anything. Mapping templates are saved per wholesaler upstream so
 * the next monthly file maps in two taps.
 *
 * Verified by typecheck + review (no device runtime here).
 */

import React from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { FIELD_SPECS, type CanonicalField } from '../../import/column-mapping';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { useImportWizard } from './useImportWizard';
import type { ParsedSheet } from '../../import/parse-sheet';

interface Props {
  sheet: ParsedSheet;
  catalogueId: string;
  currency: 'GBP' | 'EUR';
  onCommit: (state: ReturnType<typeof useImportWizard>) => void;
  onCancel: () => void;
}

export function ColumnMappingScreen({ sheet, catalogueId, currency, onCommit, onCancel }: Props) {
  const w = useImportWizard(sheet, catalogueId);
  const issueCount = w.validation.issues.length;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Match your columns</Text>
        <Text style={styles.subtitle}>
          We’ve guessed the mapping. Check each field, then review the preview below.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* field pickers */}
        {FIELD_SPECS.map((spec) => {
          const selected = w.mapping[spec.field];
          return (
            <View key={spec.field} style={styles.fieldBlock}>
              <View style={styles.fieldHead}>
                <Text style={styles.fieldLabel}>{spec.label}</Text>
                {spec.required && <Text style={styles.required}>Required</Text>}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colRow}>
                <ColumnChip
                  label="None"
                  active={selected == null}
                  onPress={() => w.setColumn(spec.field, null)}
                />
                {w.headers.map((h, col) => (
                  <ColumnChip
                    key={col}
                    label={h || `Column ${col + 1}`}
                    active={selected === col}
                    onPress={() => w.setColumn(spec.field, col)}
                  />
                ))}
              </ScrollView>
            </View>
          );
        })}

        {/* validation banner */}
        {w.missingRequired.length > 0 ? (
          <View style={[styles.banner, styles.bannerError]}>
            <Text style={styles.bannerText}>
              Map the required field{w.missingRequired.length > 1 ? 's' : ''} above to continue.
            </Text>
          </View>
        ) : (
          <View style={[styles.banner, issueCount > 0 ? styles.bannerWarn : styles.bannerOk]}>
            <Text style={styles.bannerText}>
              {w.validation.valid.length} products ready
              {issueCount > 0 ? ` · ${issueCount} row${issueCount > 1 ? 's' : ''} need attention` : ''}
            </Text>
          </View>
        )}

        {/* live preview */}
        <Text style={styles.previewLabel}>PREVIEW</Text>
        <View style={styles.previewTable}>
          {w.previewRows.length === 0 ? (
            <Text style={styles.previewEmpty}>Map SKU, description and unit cost to see a preview.</Text>
          ) : (
            w.previewRows.map((m) => (
              <View key={m.id} style={styles.previewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewDesc} numberOfLines={1}>{m.description}</Text>
                  <Text style={styles.previewSku}>{m.sku} · {m.unit}</Text>
                </View>
                <Text style={styles.previewPrice}>{formatMoney(m.unit_cost_minor, currency)}</Text>
              </View>
            ))
          )}
        </View>

        {/* first few issues, if any */}
        {issueCount > 0 && (
          <View style={styles.issues}>
            {w.validation.issues.slice(0, 4).map((iss, idx) => (
              <Text key={idx} style={styles.issueLine}>
                Row {iss.rowNumber}: {iss.message}
              </Text>
            ))}
            {issueCount > 4 && (
              <Text style={styles.issueMore}>+{issueCount - 4} more</Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable onPress={onCancel} style={[styles.actionBtn, styles.cancelBtn]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onCommit(w)}
          disabled={!w.canCommit}
          style={[styles.actionBtn, styles.commitBtn, !w.canCommit && styles.commitDisabled]}
        >
          <Text style={[styles.commitText, !w.canCommit && styles.commitTextDisabled]}>
            Import {w.validation.valid.length} products
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ColumnChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.md, gap: space.xs },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  fieldBlock: { gap: space.sm },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { ...type.body, color: colors.textPrimary, fontWeight: '600' },
  required: { ...type.caption, color: colors.accent, fontWeight: '700' },
  colRow: { gap: space.sm, paddingRight: space.lg },
  chip: {
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline, maxWidth: 160,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...type.caption, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.accentInk, fontWeight: '800' },
  banner: { borderRadius: radius.tile, padding: space.md },
  bannerOk: { backgroundColor: '#16302A' },
  bannerWarn: { backgroundColor: '#33290F' },
  bannerError: { backgroundColor: '#331A18' },
  bannerText: { ...type.caption, color: colors.textPrimary, fontWeight: '600' },
  previewLabel: { ...type.eyebrow, color: colors.textMuted },
  previewTable: { backgroundColor: colors.surface, borderRadius: radius.tile, overflow: 'hidden' },
  previewEmpty: { ...type.caption, color: colors.textMuted, padding: space.lg },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  previewDesc: { ...type.body, color: colors.textPrimary, fontWeight: '600' },
  previewSku: { ...type.caption, color: colors.textMuted },
  previewPrice: { ...type.money, color: colors.textSecondary },
  issues: { gap: space.xs, paddingHorizontal: space.sm },
  issueLine: { ...type.caption, color: colors.danger },
  issueMore: { ...type.caption, color: colors.textMuted },
  actions: {
    flexDirection: 'row', gap: space.md, padding: space.lg,
    borderTopWidth: 1, borderTopColor: colors.hairline,
  },
  actionBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelText: { ...type.body, color: colors.danger, fontWeight: '700' },
  commitBtn: { backgroundColor: colors.accent },
  commitDisabled: { backgroundColor: colors.surfacePressed },
  commitText: { ...type.body, color: colors.accentInk, fontWeight: '800' },
  commitTextDisabled: { color: colors.textMuted },
});
