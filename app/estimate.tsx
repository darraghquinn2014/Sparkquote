import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useEstimateStore } from '@/src/state/estimateStore';
import { EditLineSheet } from '@/src/ui/catalogue/EditLineSheet';
import { priceLine, priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import type { EstimateStatus, LineItem, Material } from '@/src/domain/types';
import { MaterialPicker } from '@/src/ui/catalogue/MaterialPicker';
import { LabourSheet } from '@/src/ui/catalogue/LabourSheet';
import { loadCatalogue } from '@/src/data/catalogue-repo';
import { loadBusinessProfile, readLogoDataUri } from '@/src/data/business-profile';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { PdfPreviewModal } from '@/src/ui/pdf/PdfPreviewModal';
import { ShoppingListSheet } from '@/src/ui/estimate/ShoppingListSheet';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const allToggles = seedLaborToggles.map(toLaborToggle);

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  declined: 'Declined',
  signed: 'Signed',
};
const STATUS_COLORS: Record<string, string> = {
  draft:    '#6B8DAE',
  sent:     '#1B8FFF',
  approved: '#06D6A0',
  declined: '#E5564B',
  signed:   '#9B5DE5',
};
const toggleIndex = new Map(allToggles.map((t) => [t.id, t]));

export default function EstimateScreen() {
  const router = useRouter();
  const estimate = useEstimateStore((s) => s.estimate);
  const savedEstimate = useEstimateStore((s) => s.savedEstimate);
  const restoreSaved = useEstimateStore((s) => s.restoreSaved);
  const dismissSaved = useEstimateStore((s) => s.dismissSaved);
  const replaceLine = useEstimateStore((s) => s.replaceLine);
  const remove = useEstimateStore((s) => s.remove);
  const addMaterial = useEstimateStore((s) => s.addMaterial);
  const setHourlyRate = useEstimateStore((s) => s.setHourlyRate);
  const addLabour = useEstimateStore((s) => s.addLabour);
  const setStatus = useEstimateStore((s) => s.setStatus);
  const [editing, setEditing] = useState<LineItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [labourOpen, setLabourOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rateEditing, setRateEditing] = useState(false);
  const [rateText, setRateText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const breakdown = priceEstimate(estimate, allToggles);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useEffect(() => {
    loadCatalogue().then((c) => setMaterials(c.materials)).catch(() => {});
  }, []);

  const previewPdf = async () => {
    try {
      setPreviewing(true);
      const [profile, logoDataUri] = await Promise.all([
        loadBusinessProfile(),
        readLogoDataUri(),
      ]);
      const meta = {
        businessName: profile.businessName || undefined,
        tagline: profile.tagline || undefined,
        logoDataUri: logoDataUri ?? undefined,
        dateIso: new Date().toISOString(),
      };
      const priced = priceEstimate(estimate, allToggles);
      const client = toClientEstimate(estimate, priced, meta);
      setPreviewHtml(renderEstimateHtml(client));
    } catch (e) {
      Alert.alert('Preview error', String(e));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Current estimate</Text>
        <Pressable onPress={() => setShoppingOpen(true)} hitSlop={8}>
          <Text style={styles.shoppingLink}>Shopping list</Text>
        </Pressable>
      </View>

      {/* Status pills */}
      <View style={styles.statusRow}>
        {([ 'draft', 'sent', 'approved', 'declined'] as EstimateStatus[]).map((s) => {
          const active = estimate.status === s;
          const color = STATUS_COLORS[s];
          return (
            <Pressable
              key={s}
              style={[styles.statusPill, active && { backgroundColor: color, borderColor: color }]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusPillText, active && styles.statusPillTextActive]}>
                {STATUS_LABELS[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.headerBtns}>
        <Pressable style={styles.addItemBtn} onPress={() => setLabourOpen(true)}>
          <Text style={styles.addItemText}>+ Labour</Text>
        </Pressable>
        <Pressable style={styles.addItemBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addItemText}>+ Material</Text>
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
            <Pressable
              style={[styles.previewBtn, previewing && styles.previewBtnBusy]}
              onPress={previewPdf}
              disabled={previewing}
            >
              <Text style={styles.previewBtnText}>{previewing ? 'Building…' : 'Preview PDF quote'}</Text>
            </Pressable>
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
                <Pressable style={styles.deleteAction} onPress={() => remove(item.id)}>
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

      <EditLineSheet
        line={editing}
        hourlyRateMinor={estimate.hourlyRateMinor}
        currency={estimate.currency}
        onSave={(updated) => { replaceLine(updated); setEditing(null); }}
        onClose={() => setEditing(null)}
      />
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
      <PdfPreviewModal
        visible={previewHtml != null}
        html={previewHtml}
        onClose={() => setPreviewHtml(null)}
      />
      <ShoppingListSheet
        visible={shoppingOpen}
        estimate={estimate}
        onClose={() => setShoppingOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: space.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 60 },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  addItemBtn: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  addItemText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  statusRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  statusPill: {
    flex: 1, paddingVertical: 7, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline,
    alignItems: 'center',
  },
  statusPillText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  statusPillTextActive: { color: '#fff' },
  headerBtns: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.tile, padding: space.lg, marginBottom: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  desc: { fontSize: 16, color: colors.textPrimary, fontWeight: '600' },
  qty: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 17, color: colors.textSecondary, fontWeight: '600' },
  footer: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.hairline },
  previewBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginBottom: space.sm },
  previewBtnBusy: { opacity: 0.6 },
  previewBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  shoppingLink: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, marginBottom: space.lg, borderWidth: 1, borderColor: colors.hairline },
  rateLabel: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  rateValue: { fontSize: 17, color: colors.accent, fontWeight: '700' },
  rateEditRow: { flexDirection: 'row', alignItems: 'center' },
  rateCurrency: { fontSize: 17, color: colors.textPrimary, fontWeight: '700' },
  rateInput: { fontSize: 17, color: colors.textPrimary, fontWeight: '700', minWidth: 60, paddingHorizontal: 4 },
  ratePerHr: { fontSize: 15, color: colors.textSecondary },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bdLabel: { fontSize: 15, color: colors.textSecondary },
  bdValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 6, paddingTop: 12 },
  totalLabel: { fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
  totalValue: { fontSize: 22, color: colors.accent, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resumeBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.tile, padding: space.lg, marginBottom: space.lg,
    borderWidth: 1, borderColor: colors.hairline,
  },
  resumeTitle: { fontSize: 15, color: colors.textPrimary, fontWeight: '700', marginBottom: 2 },
  resumeSub: { fontSize: 13, color: colors.textSecondary },
  resumeBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, marginLeft: space.md },
  resumeBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  dismissBtn: { padding: space.sm, marginLeft: 4 },
  dismissBtnText: { color: colors.textMuted, fontSize: 16 },
  deleteAction: { backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: radius.tile, marginBottom: space.sm },
  deleteActionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
