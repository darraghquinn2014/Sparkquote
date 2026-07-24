/**
 * MaterialPicker — browse the full materials catalogue and add any item to the
 * current estimate as a material-only line. Metre-based items (cables,
 * trunking) get a "Metres" field; everything else gets "Quantity".
 *
 * Stays open after each add (with a brief "Added" confirmation) so several
 * materials can be added in one session.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Material, Currency } from '../../domain/types';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { drumLengthMeters, drumsNeededFor } from '../../domain/drum-size';
import { packSize, packsNeededFor } from '../../domain/pack-size';

interface Props {
  visible: boolean;
  materials: Material[];
  currency: Currency;
  onAdd: (material: Material, amount: number) => void;
  onClose: () => void;
}

export function MaterialPicker({ visible, materials, currency, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = windowHeight * 0.85;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Material | null>(null);
  const [amountText, setAmountText] = useState('1');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [activeSupplier, setActiveSupplier] = useState<string | null>(null);

  const suppliers = useMemo(() => {
    const ids = Array.from(new Set(materials.map((m) => m.catalogueId))).sort();
    return ids.length > 1 ? ids : [];
  }, [materials]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (activeSupplier && m.catalogueId !== activeSupplier) return false;
      if (!q) return true;
      return m.description.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q);
    });
  }, [materials, query, activeSupplier]);

  const isMetres = selected?.unit === 'm';
  const drumLen = selected && !isMetres
    ? drumLengthMeters(selected.description) ?? drumLengthMeters(selected.unit)
    : null;
  const isDrum = drumLen != null;
  const packSz = selected && !isMetres && !isDrum
    ? packSize(selected.description) ?? packSize(selected.unit)
    : null;
  const isPack = packSz != null;
  const amountNum = parseFloat(amountText);
  const drumsBilled = isDrum && drumLen && Number.isFinite(amountNum) && amountNum > 0
    ? drumsNeededFor(amountNum, drumLen)
    : null;
  const packsBilled = isPack && packSz && Number.isFinite(amountNum) && amountNum > 0
    ? packsNeededFor(amountNum, packSz)
    : null;
  const previewTotal = selected && Number.isFinite(amountNum)
    ? Math.round((isDrum ? (drumsBilled ?? 1) : isPack ? (packsBilled ?? 1) : amountNum) * selected.unitCostMinor)
    : 0;

  const confirmAdd = () => {
    if (!selected) return;
    const n = parseFloat(amountText);
    const metresOrQty = Number.isFinite(n) && n > 0 ? n : 1;
    const amount = isDrum && drumLen ? drumsNeededFor(metresOrQty, drumLen)
      : isPack && packSz ? packsNeededFor(metresOrQty, packSz)
      : metresOrQty;
    onAdd(selected, amount);
    setJustAdded(selected.description);
    setSelected(null);
    setAmountText('1');
    setTimeout(() => setJustAdded(null), 1500);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kavWrapper}
        >
          <View style={[styles.sheet, { height: sheetHeight, paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.grabber} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Add material</Text>
              <Pressable onPress={onClose} accessibilityLabel="Done">
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>

            {justAdded && (
              <View style={styles.toast}>
                <Text style={styles.toastText}>Added {justAdded}</Text>
              </View>
            )}

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or code"
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              autoCorrect={false}
            />

            {suppliers.length > 0 && (
              <View style={styles.supplierContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.supplierRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {[null, ...suppliers].map((s) => {
                    const active = activeSupplier === s;
                    return (
                      <Pressable
                        key={s ?? '__all'}
                        onPress={() => setActiveSupplier(s)}
                        style={[styles.supplierChip, active && styles.supplierChipActive]}
                      >
                        <Text style={[styles.supplierChipText, active && styles.supplierChipTextActive]}>
                          {s ?? 'All'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.map((m) => {
                const isSel = selected?.id === m.id;
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.row, isSel && styles.rowActive]}
                    onPress={() => {
                      setSelected(isSel ? null : m);
                      setAmountText('1');
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowDesc}>{m.description}</Text>
                      <Text style={styles.rowMeta}>{m.sku} · {m.unit}{suppliers.length > 0 ? ` · ${m.catalogueId}` : ''}</Text>
                    </View>
                    <Text style={[styles.rowPrice, isSel && styles.rowPriceActive]}>{formatMoney(m.unitCostMinor, currency)}</Text>
                  </Pressable>
                );
              })}
              {filtered.length === 0 && (
                <Text style={styles.empty}>No materials match "{query}".</Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {selected && (
          <View style={[styles.floatingAddRow, { top: insets.top + space.sm }]}>
            <Text style={styles.addItemName} numberOfLines={1}>{selected.description}</Text>
            <Text style={styles.addLabel}>
              {isDrum ? 'Metres needed' : isPack ? 'Quantity needed' : isMetres ? 'Metres' : 'Quantity'} · {formatMoney(selected.unitCostMinor, currency)} / {selected.unit}
            </Text>
            {isDrum && drumsBilled != null && (
              <Text style={styles.addDrumHint}>
                = {drumsBilled} drum{drumsBilled === 1 ? '' : 's'} billed ({drumLen}m each)
              </Text>
            )}
            {isPack && packsBilled != null && packSz != null && (
              <Text style={styles.addDrumHint}>
                = {packsBilled} pack{packsBilled === 1 ? '' : 's'} billed ({packSz} each)
              </Text>
            )}
            <Text style={styles.addTotal}>Total: {formatMoney(previewTotal, currency)}</Text>
            <View style={styles.floatingAddRowControls}>
              <TextInput
                value={amountText}
                onChangeText={(t) => {
                  const cleaned = t.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  setAmountText(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
                }}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                selectTextOnFocus
                autoFocus
                accessibilityLabel={isDrum ? 'Metres needed' : isPack ? 'Quantity needed' : isMetres ? 'Metres' : 'Quantity'}
              />
              <Pressable style={styles.addBtn} onPress={confirmAdd}>
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
              <Pressable style={styles.floatingCancelBtn} onPress={() => setSelected(null)} hitSlop={8}>
                <Text style={styles.floatingCancelBtnText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  done: { fontSize: 16, fontWeight: '700', color: colors.accent },
  toast: { backgroundColor: colors.catTesting, borderRadius: radius.tile, paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.sm },
  toastText: { color: colors.accentInk, fontWeight: '700', fontSize: 13 },
  search: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16, marginBottom: space.sm },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowActive: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, borderBottomWidth: 0 },
  rowDesc: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowPrice: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  rowPriceActive: { color: colors.accent },
  floatingAddRow: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    padding: space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  floatingAddRowControls: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  floatingCancelBtn: { paddingHorizontal: space.sm, paddingVertical: space.sm },
  floatingCancelBtnText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  addItemName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  addLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  addDrumHint: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  addTotal: { fontSize: 13, fontWeight: '700', color: colors.accent, marginTop: 3 },
  amountInput: { width: 80, backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  addBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.tile, paddingHorizontal: space.xl, paddingVertical: space.sm, alignItems: 'center' },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
  supplierContainer: { height: 44, marginBottom: space.sm },
  supplierRow: { gap: space.xs, alignItems: 'center' },
  supplierChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, marginRight: space.xs },
  supplierChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  supplierChipText: { ...type.caption, color: colors.textSecondary },
  supplierChipTextActive: { color: colors.accentInk, fontWeight: '800' },
});
