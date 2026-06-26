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
  Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Material, Currency } from '../../domain/types';
import { colors, space, radius, type } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

interface Props {
  visible: boolean;
  materials: Material[];
  currency: Currency;
  onAdd: (material: Material, amount: number) => void;
  onClose: () => void;
}

export function MaterialPicker({ visible, materials, currency, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Material | null>(null);
  const [amountText, setAmountText] = useState('1');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.description.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q),
    );
  }, [materials, query]);

  const isMetres = selected?.unit === 'm';

  const confirmAdd = () => {
    if (!selected) return;
    const n = parseFloat(amountText);
    const amount = Number.isFinite(n) && n > 0 ? n : 1;
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
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
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

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.map((m) => {
              const isSel = selected?.id === m.id;
              return (
                <View key={m.id}>
                  <Pressable
                    style={[styles.row, isSel && styles.rowActive]}
                    onPress={() => {
                      setSelected(isSel ? null : m);
                      setAmountText('1');
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowDesc}>{m.description}</Text>
                      <Text style={styles.rowMeta}>{m.sku} · {m.unit}</Text>
                    </View>
                    <Text style={styles.rowPrice}>{formatMoney(m.unitCostMinor, currency)}</Text>
                  </Pressable>
                  {isSel && (
                    <View style={styles.addRow}>
                      <Text style={styles.addLabel}>{isMetres ? 'Metres' : 'Quantity'}</Text>
                      <TextInput
                        value={amountText}
                        onChangeText={(t) => {
                          const cleaned = t.replace(/[^0-9.]/g, '');
                          const parts = cleaned.split('.');
                          setAmountText(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
                        }}
                        keyboardType="decimal-pad"
                        style={styles.amountInput}
                        accessibilityLabel={isMetres ? 'Metres' : 'Quantity'}
                      />
                      <Pressable style={styles.addBtn} onPress={confirmAdd}>
                        <Text style={styles.addBtnText}>Add</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
            {filtered.length === 0 && (
              <Text style={styles.empty}>No materials match "{query}".</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheet: { backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  done: { fontSize: 16, fontWeight: '700', color: colors.accent },
  toast: { backgroundColor: colors.catTesting, borderRadius: radius.tile, paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.sm },
  toastText: { color: colors.accentInk, fontWeight: '700', fontSize: 13 },
  search: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16, marginBottom: space.sm },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowActive: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, borderBottomWidth: 0 },
  rowDesc: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowPrice: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderBottomLeftRadius: radius.tile, borderBottomRightRadius: radius.tile, paddingHorizontal: space.md, paddingBottom: space.md, marginBottom: space.sm },
  addLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },
  amountInput: { flex: 1, backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 16, fontVariant: ['tabular-nums'] },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingHorizontal: space.xl, paddingVertical: space.sm },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
});
