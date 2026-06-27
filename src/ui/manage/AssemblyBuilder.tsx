/**
 * AssemblyBuilder — create a custom assembly (a Quick-Quote job tile).
 * Pick catalogue materials + quantities, set a name/category and labour hours.
 * Saved as a favourite so it appears on Quick Quote immediately.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Material } from '../../domain/types';
import { colors, space, radius } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { createAssembly } from '../../data/catalogue-repo';
import { MaterialPicker } from '../catalogue/MaterialPicker';

interface DraftComponent {
  material: Material;
  quantity: number;
}

interface Props {
  visible: boolean;
  materials: Material[];
  categories: string[];
  onClose: () => void;
  onCreated: () => void;
}

export function AssemblyBuilder({ visible, materials, categories, onClose, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [hoursText, setHoursText] = useState('');
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(''); setCategory(''); setHoursText(''); setComponents([]); setAddingCategory(false);
  };

  const materialsCost = useMemo(
    () => components.reduce((sum, c) => sum + c.material.unitCostMinor * c.quantity, 0),
    [components],
  );

  const addComponent = (material: Material, quantity: number) => {
    setComponents((prev) => {
      const existing = prev.find((c) => c.material.id === material.id);
      if (existing) {
        return prev.map((c) => c.material.id === material.id ? { ...c, quantity: c.quantity + quantity } : c);
      }
      return [...prev, { material, quantity }];
    });
  };

  const removeComponent = (id: string) =>
    setComponents((prev) => prev.filter((c) => c.material.id !== id));

  const canSave = name.trim().length > 0 && components.length > 0;

  const save = async () => {
    if (!canSave) {
      Alert.alert('Add a name and at least one material first.');
      return;
    }
    try {
      setSaving(true);
      const hours = parseFloat(hoursText);
      await createAssembly({
        name: name.trim(),
        category: category.trim() || 'Custom',
        baseLaborHours: Number.isFinite(hours) && hours > 0 ? hours : 0,
        components: components.map((c) => ({ materialId: c.material.id, quantity: c.quantity })),
      });
      reset();
      onCreated();
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Pressable onPress={() => { reset(); onClose(); }}><Text style={styles.cancel}>Cancel</Text></Pressable>
            <Text style={styles.title}>New job</Text>
            <Pressable onPress={save} disabled={!canSave || saving}>
              <Text style={[styles.save, (!canSave || saving) && styles.saveDisabled]}>Save</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xl }}>
            <Text style={styles.label}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Install Outdoor Socket" placeholderTextColor={colors.textMuted} style={styles.input} />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, category === c && !addingCategory && styles.chipActive]}
                  onPress={() => { setCategory(c); setAddingCategory(false); }}
                >
                  <Text style={[styles.chipText, category === c && !addingCategory && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.chip, addingCategory && styles.chipActive]}
                onPress={() => { setAddingCategory(true); setCategory(''); }}
              >
                <Text style={[styles.chipText, addingCategory && styles.chipTextActive]}>+ New</Text>
              </Pressable>
            </View>
            {addingCategory && (
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder="New category name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { marginTop: space.sm }]}
                autoFocus
              />
            )}

            <Text style={styles.label}>Labour hours</Text>
            <TextInput
              value={hoursText}
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9.]/g, '');
                const parts = cleaned.split('.');
                setHoursText(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned);
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 1.5"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <View style={styles.materialsHeader}>
              <Text style={styles.label}>Materials</Text>
              <Pressable style={styles.addMatBtn} onPress={() => setPickerOpen(true)}>
                <Text style={styles.addMatText}>+ Add material</Text>
              </Pressable>
            </View>

            {components.length === 0 ? (
              <Text style={styles.noMat}>No materials yet. Tap "+ Add material".</Text>
            ) : (
              components.map((c) => (
                <View key={c.material.id} style={styles.compRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compName}>{c.material.description}</Text>
                    <Text style={styles.compMeta}>{c.material.unit === 'm' ? `${c.quantity}m` : `Qty ${c.quantity}`} · {formatMoney(c.material.unitCostMinor * c.quantity, 'GBP')}</Text>
                  </View>
                  <Pressable onPress={() => removeComponent(c.material.id)} hitSlop={8}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}

            {components.length > 0 && (
              <Text style={styles.matTotal}>Materials cost: {formatMoney(materialsCost, 'GBP')}</Text>
            )}
          </ScrollView>
        </View>
      </View>

      <MaterialPicker
        visible={pickerOpen}
        materials={materials}
        currency="GBP"
        onAdd={addComponent}
        onClose={() => setPickerOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  cancel: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  save: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  saveDisabled: { opacity: 0.4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, marginBottom: space.sm, marginTop: space.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.accentInk },
  materialsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  addMatBtn: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  addMatText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  noMat: { color: colors.textMuted, fontSize: 14, marginTop: space.sm, fontStyle: 'italic' },
  compRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginTop: space.sm },
  compName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  compMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  remove: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  matTotal: { color: colors.textSecondary, fontWeight: '700', fontSize: 14, marginTop: space.md, textAlign: 'right' },
});
