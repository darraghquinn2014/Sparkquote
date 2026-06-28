import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useEstimateStore } from '@/src/state/estimateStore';
import { LineDrawer } from '@/src/ui/drawer/LineDrawer';
import { priceLine, priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import type { LineItem, Material } from '@/src/domain/types';
import { MaterialPicker } from '@/src/ui/catalogue/MaterialPicker';
import { LabourSheet } from '@/src/ui/catalogue/LabourSheet';
import { loadCatalogue } from '@/src/data/catalogue-repo';

const allToggles = seedLaborToggles.map(toLaborToggle);
const lineToggles = allToggles.filter((t) => t.appliesTo === 'line');
const toggleIndex = new Map(allToggles.map((t) => [t.id, t]));

export default function EstimateScreen() {
  const estimate = useEstimateStore((s) => s.estimate);
  const savedEstimate = useEstimateStore((s) => s.savedEstimate);
  const restoreSaved = useEstimateStore((s) => s.restoreSaved);
  const dismissSaved = useEstimateStore((s) => s.dismissSaved);
  const replaceLine = useEstimateStore((s) => s.replaceLine);
  const remove = useEstimateStore((s) => s.remove);
  const addMaterial = useEstimateStore((s) => s.addMaterial);
  const setHourlyRate = useEstimateStore((s) => s.setHourlyRate);
  const addLabour = useEstimateStore((s) => s.addLabour);
  const [editing, setEditing] = useState<LineItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [labourOpen, setLabourOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rateEditing, setRateEditing] = useState(false);
  const [rateText, setRateText] = useState('');
  const breakdown = priceEstimate(estimate, allToggles);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useEffect(() => {
    loadCatalogue().then((c) => setMaterials(c.materials)).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Current estimate</Text>
      <View style={styles.headerBtns}>
        <Pressable style={styles.addItemBtn} onPress={() => setLabourOpen(true)}>
          <Text style={styles.addItemText}>+ Labour</Text>
        </Pressable>
        <Pressable style={styles.addItemBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addItemText}>+ Add item</Text>
        </Pressable>
      </View>

      <FlatList
        data={estimate.lineItems}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={
          savedEstimate && estimate.lineItems.length === 0 ? (
            <View style={styles.resumeBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Last estimate</Text>
                <Text style={styles.resumeSub}>
                  {savedEstimate.lineItems.length} item{savedEstimate.lineItems.length !== 1 ? 's' : ''} · {formatMoney(priceEstimate(savedEstimate, allToggles).grandTotalMinor, savedEstimate.currency)}
                </Text>
              </View>
              <Pressable style={styles.resumeBtn} onPress={restoreSaved}>
                <Text style={styles.resumeBtnText}>Resume</Text>
              </Pressable>
              <Pressable style={styles.dismissBtn} onPress={dismissSaved}>
                <Text style={styles.dismissBtnText}>✕</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>No items yet. Add jobs on Quick Quote.</Text>}
        ListFooterComponent={estimate.lineItems.length === 0 ? null : (
          <View style={styles.footer}>
            <Pressable style={styles.rateRow} onPress={() => { setRateText(String(estimate.hourlyRateMinor / 100)); setRateEditing(true); }}>
              <Text style={styles.rateLabel}>Labour rate</Text>
              {rateEditing ? (
                <View style={styles.rateEditRow}>
                  <Text style={styles.rateCurrency}>{estimate.currency === 'GBP' ? '£' : '€'}</Text>
                  <TextInput
                    value={rateText}
                    onChangeText={(t) => setRateText(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    autoFocus
                    style={styles.rateInput}
                    onBlur={() => { const n = parseFloat(rateText); if (Number.isFinite(n) && n > 0) setHourlyRate(Math.round(n * 100)); setRateEditing(false); }}
                  />
                  <Text style={styles.ratePerHr}>/hr</Text>
                </View>
              ) : (
                <Text style={styles.rateValue}>{formatMoney(estimate.hourlyRateMinor, estimate.currency)}/hr</Text>
              )}
            </Pressable>
            <View style={styles.breakdownRow}><Text style={styles.bdLabel}>Materials</Text><Text style={styles.bdValue}>{formatMoney(breakdown.materialsTotalMinor, estimate.currency)}</Text></View>
            <View style={styles.breakdownRow}><Text style={styles.bdLabel}>Labour</Text><Text style={styles.bdValue}>{formatMoney(breakdown.laborTotalMinor, estimate.currency)}</Text></View>
            <View style={styles.breakdownRow}><Text style={styles.bdLabel}>Subtotal</Text><Text style={styles.bdValue}>{formatMoney(breakdown.subtotalMinor, estimate.currency)}</Text></View>
            <View style={styles.breakdownRow}><Text style={styles.bdLabel}>VAT ({estimate.vatRatePct}%)</Text><Text style={styles.bdValue}>{formatMoney(breakdown.vatAmountMinor, estimate.currency)}</Text></View>
            <View style={[styles.breakdownRow, styles.totalRow]}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{formatMoney(breakdown.grandTotalMinor, estimate.currency)}</Text></View>
          </View>
        )}
        renderItem={({ item }) => {
          const b = priceLine(item, estimate.hourlyRateMinor, toggleIndex, estimate.appliedLaborToggleIds);
          return (
            <Swipeable
              ref={(ref) => {
                if (ref) swipeableRefs.current.set(item.id, ref);
                else swipeableRefs.current.delete(item.id);
              }}
              onSwipeableWillOpen={() => {
                swipeableRefs.current.forEach((sw, id) => {
                  if (id !== item.id) sw.close();
                });
              }}
              renderRightActions={() => (
                <Pressable
                  style={styles.deleteAction}
                  onPress={() => remove(item.id)}
                >
                  <Text style={styles.deleteActionText}>Delete</Text>
                </Pressable>
              )}
            >
              <Pressable style={styles.row} onPress={() => setEditing(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.desc}>{item.description}</Text>
                  <Text style={styles.qty}>{item.quantityMeters != null ? item.quantityMeters + "m" : "Qty " + (item.quantity ?? 1)} · tap to edit</Text>
                </View>
                <Text style={styles.amount}>{formatMoney(b.lineTotalMinor, estimate.currency)}</Text>
              </Pressable>
            </Swipeable>
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
      <LabourSheet
        visible={labourOpen}
        hourlyRateMinor={estimate.hourlyRateMinor}
        currency={estimate.currency}
        onAdd={(opts) => addLabour(opts)}
        onClose={() => setLabourOpen(false)}
      />
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
  title: { fontSize: 24, fontWeight: '800', color: '#F2F5F8', marginBottom: 12 },
  addItemBtn: { backgroundColor: '#1E242E', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#2E3744' },
  addItemText: { color: '#FFB020', fontWeight: '700', fontSize: 14 },
  headerBtns: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  empty: { color: '#5E6B79', textAlign: 'center', marginTop: 40, fontSize: 15 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E242E',
    borderRadius: 14, padding: 16, marginBottom: 8,
  },
  desc: { fontSize: 16, color: '#F2F5F8', fontWeight: '600' },
  qty: { fontSize: 12, color: '#5E6B79', marginTop: 2 },
  amount: { fontSize: 17, color: '#9AA7B4', fontWeight: '600' },
  footer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#2E3744' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E242E', borderRadius: 14, padding: 16, marginBottom: 16 },
  rateLabel: { fontSize: 15, color: '#9AA7B4', fontWeight: '600' },
  rateValue: { fontSize: 17, color: '#FFB020', fontWeight: '700' },
  rateEditRow: { flexDirection: 'row', alignItems: 'center' },
  rateCurrency: { fontSize: 17, color: '#F2F5F8', fontWeight: '700' },
  rateInput: { fontSize: 17, color: '#F2F5F8', fontWeight: '700', minWidth: 60, paddingHorizontal: 4 },
  ratePerHr: { fontSize: 15, color: '#9AA7B4' },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bdLabel: { fontSize: 15, color: '#9AA7B4' },
  bdValue: { fontSize: 15, color: '#F2F5F8', fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalRow: { borderTopWidth: 1, borderTopColor: '#2E3744', marginTop: 6, paddingTop: 12 },
  totalLabel: { fontSize: 18, color: '#F2F5F8', fontWeight: '800' },
  totalValue: { fontSize: 22, color: '#FFB020', fontWeight: '800', fontVariant: ['tabular-nums'] },
  resumeBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E242E',
    borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#2E3744',
  },
  resumeTitle: { fontSize: 15, color: '#F2F5F8', fontWeight: '700', marginBottom: 2 },
  resumeSub: { fontSize: 13, color: '#9AA7B4' },
  resumeBtn: {
    backgroundColor: '#FFB020', borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 8, marginLeft: 12,
  },
  resumeBtnText: { color: '#14181F', fontWeight: '800', fontSize: 14 },
  dismissBtn: { padding: 8, marginLeft: 4 },
  dismissBtnText: { color: '#5E6B79', fontSize: 16 },
  deleteAction: {
    backgroundColor: '#E5564B',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 14,
    marginBottom: 8,
  },
  deleteActionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
