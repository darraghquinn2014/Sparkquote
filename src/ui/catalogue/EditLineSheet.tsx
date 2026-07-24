/**
 * EditLineSheet — edit the single numeric field of a project quote line.
 *
 * Detects line type from the data shape:
 *   - flat labour  → overrides.customLaborFlatMinor  → edit £ amount
 *   - hours labour → overrides.isCustom (no flat)    → edit hours
 *   - cable/metres → quantityMeters present           → edit metres
 *   - anything else                                   → edit quantity
 */
import React, { useState, useEffect } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Currency, LineItem } from '../../domain/types';
import { colors, space, radius } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

type EditMode = 'quantity' | 'metres' | 'hours' | 'flat';

function getMode(line: LineItem): EditMode {
  if (line.overrides?.customLaborFlatMinor != null) return 'flat';
  if (line.overrides?.isCustom) return 'hours';
  if (line.quantityMeters != null) return 'metres';
  return 'quantity';
}

function initialText(line: LineItem, mode: EditMode): string {
  switch (mode) {
    case 'quantity': return String(line.quantity ?? 1);
    case 'metres':   return String(line.quantityMeters ?? 0);
    case 'hours':    return String(line.overrides?.customLaborHours ?? 0);
    case 'flat':     return ((line.overrides?.customLaborFlatMinor ?? 0) / 100).toFixed(2);
  }
}

function applyEdit(line: LineItem, mode: EditMode, value: number): LineItem {
  switch (mode) {
    case 'quantity': return { ...line, quantity: value };
    case 'metres':   return { ...line, quantityMeters: value };
    case 'hours':    return { ...line, overrides: { ...line.overrides, isCustom: true, customLaborHours: value } };
    case 'flat':     return { ...line, overrides: { ...line.overrides, isCustom: true, customLaborFlatMinor: Math.round(value * 100) } };
  }
}

interface Props {
  line: LineItem | null;
  hourlyRateMinor: number;
  currency: Currency;
  onSave: (updated: LineItem) => void;
  onClose: () => void;
}

export function EditLineSheet({ line, hourlyRateMinor, currency, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const mode: EditMode = line ? getMode(line) : 'quantity';

  useEffect(() => {
    if (line) setText(initialText(line, mode));
  }, [line?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = parseFloat(text);
  const valid = Number.isFinite(num) && num > 0;

  const fieldLabel = mode === 'quantity' ? 'Quantity'
    : mode === 'metres' ? 'Metres'
    : mode === 'hours' ? 'Hours'
    : 'Amount';

  const preview = (mode === 'hours' && valid)
    ? `${num}h × ${formatMoney(hourlyRateMinor, currency)}/hr = ${formatMoney(Math.round(num * hourlyRateMinor), currency)}`
    : '';

  const handleSave = () => {
    if (!line || !valid) return;
    onSave(applyEdit(line, mode, num));
    onClose();
  };

  const cleanText = (t: string) => {
    const cleaned = t.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
  };

  return (
    <Modal visible={line != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kavWrapper}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: kbHeight }}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Edit line</Text>
          {line && (
            <Text style={styles.desc} numberOfLines={2}>{line.description}</Text>
          )}

          <Text style={styles.label}>{fieldLabel}</Text>
          <View style={styles.inputRow}>
            {mode === 'flat' && (
              <Text style={styles.affix}>{currency === 'GBP' ? '£' : '€'}</Text>
            )}
            <TextInput
              value={text}
              onChangeText={(t) => setText(cleanText(t))}
              keyboardType="decimal-pad"
              style={styles.input}
              autoFocus
              selectTextOnFocus
            />
            {mode === 'metres' && <Text style={styles.affix}>m</Text>}
            {mode === 'hours'  && <Text style={styles.affix}>hrs</Text>}
          </View>

          {preview ? <Text style={styles.preview}>{preview}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.saveBtn, !valid && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!valid}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  kavWrapper: { width: '100%' },
  sheet: {
    backgroundColor: colors.ground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: space.xs },
  desc: { color: colors.textMuted, fontSize: 13, marginBottom: space.lg },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, marginBottom: space.sm },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.tile,
    paddingHorizontal: space.md, marginBottom: space.sm,
  },
  affix: { fontSize: 18, color: colors.textPrimary, fontWeight: '700', paddingHorizontal: 2 },
  input: { flex: 1, paddingVertical: space.md, color: colors.textPrimary, fontSize: 22, fontWeight: '600' },
  preview: { color: colors.accent, fontWeight: '700', fontSize: 14, marginBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  btn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  saveBtn: { backgroundColor: colors.accent },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
