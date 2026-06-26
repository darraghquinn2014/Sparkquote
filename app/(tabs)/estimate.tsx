import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstimateStore } from '@/src/state/estimateStore';
import { LineDrawer } from '@/src/ui/drawer/LineDrawer';
import { priceLine } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import type { LineItem, Material } from '@/src/domain/types';
import { MaterialPicker } from '@/src/ui/catalogue/MaterialPicker';
import { loadCatalogue } from '@/src/data/catalogue-repo';

const allToggles = seedLaborToggles.map(toLaborToggle);
const lineToggles = allToggles.filter((t) => t.appliesTo === 'line');
const toggleIndex = new Map(allToggles.map((t) => [t.id, t]));

export default function EstimateScreen() {
  const estimate = useEstimateStore((s) => s.estimate);
  const replaceLine = useEstimateStore((s) => s.replaceLine);
  const remove = useEstimateStore((s) => s.remove);
  const addMaterial = useEstimateStore((s) => s.addMaterial);
  const [editing, setEditing] = useState<LineItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);

  useEffect(() => {
    loadCatalogue().then((c) => setMaterials(c.materials)).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Current estimate</Text>
        <Pressable style={styles.addItemBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addItemText}>+ Add item</Text>
        </Pressable>
      </View>

      <FlatList
        data={estimate.lineItems}
        keyExtractor={(l) => l.id}
        ListEmptyComponent={<Text style={styles.empty}>No items yet. Add jobs on Quick Quote.</Text>}
        renderItem={({ item }) => {
          const b = priceLine(item, estimate.hourlyRateMinor, toggleIndex, estimate.appliedLaborToggleIds);
          return (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.desc}>{item.description}</Text>
                <Text style={styles.qty}>{item.quantityMeters != null ? item.quantityMeters + "m" : "Qty " + (item.quantity ?? 1)} · tap to edit</Text>
              </View>
              <Text style={styles.amount}>{formatMoney(b.lineTotalMinor, estimate.currency)}</Text>
            </Pressable>
          );
        }}
      />

      {editing && (
        <LineDrawer
          visible={true}
          line={editing}
          hourlyRateMinor={estimate.hourlyRateMinor}
          currency={estimate.currency}
          lineToggles={lineToggles}
          allToggles={allToggles}
          estimateWideToggleIds={estimate.appliedLaborToggleIds}
          onSave={(updated) => { replaceLine(updated); setEditing(null); }}
          onDelete={() => { if (editing) remove(editing.id); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}
      <MaterialPicker
        visible={pickerOpen}
        materials={materials}
        currency={estimate.currency}
        onAdd={(material, amount) => addMaterial(material, amount)}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#14181F', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#F2F5F8' },
  addItemBtn: { backgroundColor: '#1E242E', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#2E3744' },
  addItemText: { color: '#FFB020', fontWeight: '700', fontSize: 14 },
  empty: { color: '#5E6B79', textAlign: 'center', marginTop: 40, fontSize: 15 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E242E',
    borderRadius: 14, padding: 16, marginBottom: 8,
  },
  desc: { fontSize: 16, color: '#F2F5F8', fontWeight: '600' },
  qty: { fontSize: 12, color: '#5E6B79', marginTop: 2 },
  amount: { fontSize: 17, color: '#9AA7B4', fontWeight: '600' },
});
