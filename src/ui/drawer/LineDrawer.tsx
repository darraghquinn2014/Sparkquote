/**
 * LineDrawer — the in-field slide-up override sheet (spec §6).
 *
 * Tapping any line opens this drawer. The electrician can, on the fly:
 *   - adjust quantity
 *   - override the material unit cost
 *   - apply a quick markup % (presets + free entry)
 *   - flip line-level labour toggles (e.g. high working height)
 * The recomputed line total updates live at the top as they edit. Save commits
 * the working copy; Cancel discards. Built as a normal-flow faux bottom sheet
 * (no position:fixed) so it renders predictably.
 *
 * Verified by typecheck + review (no device runtime here).
 */

import React, { useState, useEffect } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LaborToggle, LineItem, MinorUnits } from '../../domain/types';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { useLineDrawer } from './useLineDrawer';

const MARKUP_PRESETS = [0, 10, 15, 20] as const;

interface Props {
  visible: boolean;
  line: LineItem;
  hourlyRateMinor: MinorUnits;
  currency: 'GBP' | 'EUR';
  /** Line-level toggles available to flip (appliesTo === 'line'). */
  lineToggles: LaborToggle[];
  /** All toggles, for the engine preview. */
  allToggles: LaborToggle[];
  estimateWideToggleIds: string[];
  onSave: (updated: LineItem) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function LineDrawer({
  visible,
  line,
  hourlyRateMinor,
  currency,
  lineToggles,
  allToggles,
  estimateWideToggleIds,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const d = useLineDrawer(line, hourlyRateMinor, allToggles, estimateWideToggleIds);
  const o = d.working.overrides;
  const isCustom = o?.isCustom === true;

  const [costText, setCostText] = useState(
    o?.unitCostMinor != null ? (o.unitCostMinor / 100).toFixed(2) : '',
  );
  useEffect(() => {
    setCostText(o?.unitCostMinor != null ? (o.unitCostMinor / 100).toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.working.id]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onCancel} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {/* Live total header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{d.working.description}</Text>
              <Text style={styles.subtle}>Line total updates as you edit</Text>
            </View>
            <Text style={styles.liveTotal}>{formatMoney(d.preview.lineTotalMinor, currency)}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Quantity */}
            <Text style={styles.sectionLabel}>QUANTITY</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => d.setQuantity((d.working.quantity ?? 1) - 1)}
                style={styles.stepBtn} accessibilityLabel="Decrease quantity"
              >
                <Text style={styles.stepGlyph}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{d.working.quantity ?? 1}</Text>
              <Pressable
                onPress={() => d.setQuantity((d.working.quantity ?? 1) + 1)}
                style={styles.stepBtn} accessibilityLabel="Increase quantity"
              >
                <Text style={styles.stepGlyph}>+</Text>
              </Pressable>
            </View>

            {/* Unit cost override — hidden for custom lines (they hold their own cost) */}
            {!isCustom && (
              <>
                <Text style={styles.sectionLabel}>MATERIAL UNIT COST</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.currencyPrefix}>
                    {currency === 'GBP' ? '£' : '€'}
                  </Text>
                  <TextInput
                    value={costText}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9.]/g, "");
                      const parts = cleaned.split(".");
                      const normalized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
                      const limited = normalized.includes(".") ? normalized.slice(0, normalized.indexOf(".") + 3) : normalized;
                      setCostText(limited);
                      if (limited === "" || limited === ".") d.setUnitCost(undefined);
                      else { const n = parseFloat(limited); if (Number.isFinite(n)) d.setUnitCost(Math.round(n * 100)); }
                    }}
                    keyboardType="decimal-pad"
                    placeholder="Use catalogue price"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    accessibilityLabel="Override material unit cost"
                  />
                  {o?.unitCostMinor != null && (
                    <Pressable onPress={() => { d.setUnitCost(undefined); setCostText(""); }} accessibilityLabel="Clear override">
                      <Text style={styles.clear}>Reset</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}

            {/* Markup */}
            <Text style={styles.sectionLabel}>MARKUP</Text>
            <View style={styles.presetRow}>
              {MARKUP_PRESETS.map((pct) => {
                const active = (o?.markupPct ?? 0) === pct;
                return (
                  <Pressable
                    key={pct}
                    onPress={() => d.setMarkup(pct === 0 ? undefined : pct)}
                    style={[styles.preset, active && styles.presetActive]}
                    accessibilityLabel={`Markup ${pct} percent`}
                  >
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{pct}%</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Line-level labour toggles */}
            {lineToggles.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>LABOUR ADJUSTMENTS</Text>
                {lineToggles.map((t) => {
                  const on = d.working.appliedLaborToggleIds.includes(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => d.toggleLineToggle(t.id, !on)}
                      style={styles.toggleRow}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={styles.toggleLabel}>{t.label}</Text>
                      <View style={[styles.switch, on && styles.switchOn]}>
                        <View style={[styles.knob, on && styles.knobOn]} />
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={{ paddingBottom: insets.bottom + 16 }}>
            <View style={styles.actions}>
              <Pressable onPress={onCancel} style={[styles.actionBtn, styles.cancelBtn]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(d.working)}
                style={[styles.actionBtn, styles.saveBtn]}
                accessibilityLabel="Save changes"
              >
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
            {onDelete && (
              <Pressable onPress={() => onDelete()} style={styles.removeBtn} accessibilityLabel="Remove item from estimate">
                <Text style={styles.removeText}>Remove item</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.bar + 6,
    borderTopRightRadius: radius.bar + 6,
    paddingBottom: space.xl,
    maxHeight: '88%',
  },
  grabber: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairline,
    alignSelf: 'center', marginTop: space.md, marginBottom: space.sm,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, paddingBottom: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  title: { ...type.body, color: colors.textPrimary, fontWeight: '700', fontSize: 17 },
  subtle: { ...type.caption, color: colors.textMuted },
  liveTotal: { ...type.totalLg, fontSize: 26, color: colors.accent },
  body: { padding: space.lg, gap: space.sm },
  sectionLabel: { ...type.eyebrow, color: colors.textMuted, marginTop: space.md },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stepBtn: {
    width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.ground,
    alignItems: 'center', justifyContent: 'center',
  },
  stepGlyph: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  stepValue: { ...type.money, fontSize: 20, color: colors.textPrimary, minWidth: 32, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md,
  },
  currencyPrefix: { ...type.money, color: colors.textSecondary },
  input: { flex: 1, color: colors.textPrimary, fontSize: 17, paddingVertical: space.md },
  clear: { ...type.caption, color: colors.accent, fontWeight: '700' },
  presetRow: { flexDirection: 'row', gap: space.sm },
  preset: {
    flex: 1, paddingVertical: space.md, borderRadius: radius.tile,
    backgroundColor: colors.ground, alignItems: 'center',
  },
  presetActive: { backgroundColor: colors.accent },
  presetText: { ...type.money, color: colors.textSecondary },
  presetTextActive: { color: colors.accentInk, fontWeight: '800' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  toggleLabel: { ...type.body, color: colors.textPrimary },
  switch: {
    width: 48, height: 28, borderRadius: radius.pill, backgroundColor: colors.ground,
    padding: 3, justifyContent: 'center',
  },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.textMuted },
  knobOn: { backgroundColor: colors.accentInk, alignSelf: 'flex-end' },
  actions: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md },
  removeBtn: { marginTop: space.sm, marginHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  removeText: { color: '#E06A6A', fontWeight: '600', fontSize: 15 },
  actionBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.ground },
  cancelText: { ...type.body, color: colors.textSecondary, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.accent },
  saveText: { ...type.body, color: colors.accentInk, fontWeight: '800' },
});
