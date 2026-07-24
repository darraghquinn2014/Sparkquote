/**
 * LabourSheet — add a standalone labour line to the estimate.
 * Two modes: Hours (priced at the estimate's hourly rate, recalculates if the
 * rate changes) or Flat amount (a fixed labour charge).
 */
import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Currency } from '../../domain/types';
import { colors, space, radius } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

interface Props {
  visible: boolean;
  hourlyRateMinor: number;
  currency: Currency;
  onAdd: (opts: { hours?: number; flatMinor?: number }) => void;
  onClose: () => void;
}

export function LabourSheet({ visible, hourlyRateMinor, currency, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'hours' | 'flat'>('hours');
  const [text, setText] = useState('');
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const num = parseFloat(text);
  const valid = Number.isFinite(num) && num > 0;
  const preview =
    mode === 'hours' && valid
      ? `${num}h × ${formatMoney(hourlyRateMinor, currency)}/hr = ${formatMoney(Math.round(num * hourlyRateMinor), currency)}`
      : '';

  const reset = () => { setText(''); setMode('hours'); };

  const confirm = () => {
    if (!valid) return;
    if (mode === 'hours') onAdd({ hours: num });
    else onAdd({ flatMinor: Math.round(num * 100) });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kavWrapper}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: kbHeight }}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Add labour</Text>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, mode === 'hours' && styles.modeActive]}
              onPress={() => setMode('hours')}
            >
              <Text style={[styles.modeText, mode === 'hours' && styles.modeTextActive]}>Hours</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'flat' && styles.modeActive]}
              onPress={() => setMode('flat')}
            >
              <Text style={[styles.modeText, mode === 'flat' && styles.modeTextActive]}>Flat amount</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>{mode === 'hours' ? 'Hours' : 'Amount'}</Text>
          <View style={styles.inputRow}>
            {mode === 'flat' && (
              <Text style={styles.prefix}>{currency === 'GBP' ? '£' : '€'}</Text>
            )}
            <TextInput
              value={text}
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9.]/g, '');
                const parts = cleaned.split('.');
                setText(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
              }}
              keyboardType="decimal-pad"
              placeholder={mode === 'hours' ? 'e.g. 4' : 'e.g. 250'}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
            />
          </View>

          {preview ? <Text style={styles.preview}>{preview}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.addBtn, !valid && styles.addBtnDisabled]}
              onPress={confirm}
              disabled={!valid}
            >
              <Text style={styles.addText}>Add labour</Text>
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
  sheet: { backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: space.lg },
  modeRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  modeBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile, backgroundColor: colors.surface, alignItems: 'center' },
  modeActive: { backgroundColor: colors.accent },
  modeText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  modeTextActive: { color: colors.accentInk },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, marginBottom: space.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md },
  prefix: { fontSize: 18, color: colors.textPrimary, fontWeight: '700', marginRight: space.xs },
  input: { flex: 1, paddingVertical: space.md, color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  preview: { color: colors.accent, fontWeight: '700', fontSize: 14, marginTop: space.md },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  actionBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  addBtn: { backgroundColor: colors.accent },
  addBtnDisabled: { opacity: 0.4 },
  addText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
