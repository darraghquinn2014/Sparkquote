import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput, StyleSheet,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { loadCatalogue, loadSuppliers, updateMaterialPrice, type SupplierSummary } from '@/src/data/catalogue-repo';
import { useSettingsStore } from '@/src/state/settingsStore';
import { formatMoney } from '@/src/domain/money';
import { colors, space, radius, type as typo } from '@/src/ui/theme/tokens';
import type { Material } from '@/src/domain/types';
import { HeaderMicButton } from '@/src/ui/voice/HeaderMicButton';

type Tab = 'materials' | 'assemblies';

export default function CatalogueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setCatalogueUpdatedAt = useSettingsStore((s) => s.setCatalogueUpdatedAt);
  const catalogueUpdatedAt = useSettingsStore((s) => s.catalogueUpdatedAt);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const currency = useSettingsStore((s) => s.currency);

  const [tab, setTab] = useState<Tab>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [activeSupplier, setActiveSupplier] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [priceText, setPriceText] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateSettings();
      const [cat, supplierList] = await Promise.all([loadCatalogue(), loadSuppliers()]);
      setMaterials(cat.materials);
      setSuppliers(supplierList);
    } catch (e) {
      console.error('catalogue load failed', e);
    } finally {
      setLoading(false);
    }
  }, [hydrateSettings]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const filtered = materials.filter((m) => {
    if (activeSupplier && m.catalogueId !== activeSupplier) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return m.description.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q);
  });

  const openEdit = (m: Material) => {
    setEditTarget(m);
    setPriceText(String((m.unitCostMinor / 100).toFixed(2)));
  };

  const savePrice = async () => {
    if (!editTarget) return;
    const pence = Math.round(parseFloat(priceText) * 100);
    if (!Number.isFinite(pence) || pence < 0) return;
    setSaving(true);
    try {
      await updateMaterialPrice(editTarget.id, pence);
      setCatalogueUpdatedAt(Date.now());
      setEditTarget(null);
      await reload();
    } catch (e) {
      console.error('price update failed', e);
    } finally {
      setSaving(false);
    }
  };

  const updatedLabel = catalogueUpdatedAt
    ? `Prices last updated ${new Date(catalogueUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Prices not yet updated this session';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Catalogue</Text>
        <HeaderMicButton />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['materials', 'assemblies'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'materials' ? 'Materials' : 'Assemblies'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'materials' ? (
        <>
          {/* Updated indicator */}
          <Text style={styles.updatedLabel}>{updatedLabel}</Text>

          {/* Search */}
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or SKU…"
            placeholderTextColor={colors.textMuted}
            clearButtonMode="while-editing"
          />

          {/* Supplier filter — only worth showing once there's more than one price list */}
          {suppliers.length > 1 && (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[null, ...suppliers.map((s) => s.catalogueId)]}
              keyExtractor={(id) => id ?? '__all'}
              contentContainerStyle={styles.supplierRow}
              style={styles.supplierContainer}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: id }) => {
                const active = activeSupplier === id;
                const label = id == null ? 'All' : suppliers.find((s) => s.catalogueId === id)?.displayName ?? id;
                return (
                  <Pressable onPress={() => setActiveSupplier(id)} style={[styles.supplierChip, active && styles.supplierChipActive]}>
                    <Text style={[styles.supplierChipText, active && styles.supplierChipTextActive]}>{label}</Text>
                  </Pressable>
                );
              }}
            />
          )}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>No materials found.</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => openEdit(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.rowSku}>{item.sku} · {item.unit}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.price}>{formatMoney(item.unitCostMinor, currency)}</Text>
                    <Text style={styles.editHint}>tap to edit</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </>
      ) : (
        <View style={styles.assembliesSection}>
          <Text style={styles.assembliesInfo}>
            Manage your job templates — set which ones appear in Add Job, adjust labour hours, and add or remove materials.
          </Text>
          <Pressable style={styles.manageBtn} onPress={() => router.push('/manage-jobs' as never)}>
            <Text style={styles.manageBtnText}>Open Assembly Manager</Text>
          </Pressable>
          <Pressable style={styles.importRow} onPress={() => router.push('/import' as never)}>
            <Text style={styles.importRowText}>Import wholesale price list (CSV/XLSX)</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      )}

      {/* Price edit sheet */}
      <Modal
        visible={editTarget != null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setEditTarget(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
            <Text style={styles.sheetTitle}>Edit price</Text>
            {editTarget && (
              <Text style={styles.sheetDesc} numberOfLines={2}>{editTarget.description}</Text>
            )}
            <Text style={styles.sheetLabel}>Unit price ({editTarget?.unit ?? ''})</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.currencySymbol}>{currency === 'GBP' ? '£' : '€'}</Text>
              <TextInput
                style={styles.priceInput}
                value={priceText}
                onChangeText={(t) => setPriceText(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
              />
            </View>
            <View style={styles.sheetBtns}>
              <Pressable onPress={() => setEditTarget(null)} hitSlop={8}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={savePrice}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save price'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 60 },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginBottom: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.bar,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: space.sm, borderRadius: radius.tile, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: colors.accentInk },

  updatedLabel: {
    color: colors.textMuted, fontSize: 12, marginHorizontal: space.lg, marginBottom: space.sm,
  },
  search: {
    backgroundColor: colors.surface, color: colors.textPrimary,
    borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm,
    marginHorizontal: space.lg, marginBottom: space.sm, fontSize: 15,
    borderWidth: 1, borderColor: colors.hairline,
  },
  supplierContainer: { height: 44, flexGrow: 0, marginHorizontal: space.lg, marginBottom: space.sm },
  supplierRow: { gap: space.xs, alignItems: 'center' },
  supplierChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, marginRight: space.xs },
  supplierChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  supplierChipText: { ...typo.caption, color: colors.textSecondary },
  supplierChipTextActive: { color: colors.accentInk, fontWeight: '800' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.tile,
    padding: space.md, marginBottom: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  rowDesc: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  rowSku: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 15, color: colors.accent, fontWeight: '700', fontVariant: ['tabular-nums'] },
  editHint: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

  assembliesSection: { padding: space.lg },
  assembliesInfo: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: space.xl },
  manageBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: space.md, alignItems: 'center', marginBottom: space.lg,
  },
  manageBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  importRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg,
    borderWidth: 1, borderColor: colors.hairline,
  },
  importRowText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  chevron: { color: colors.accent, fontSize: 20 },

  // Price edit sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    padding: space.xl, paddingBottom: space.xxl,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: space.xs },
  sheetDesc: { color: colors.textSecondary, fontSize: 14, marginBottom: space.lg },
  sheetLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: space.xs },
  priceInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.ground, borderRadius: radius.tile,
    paddingHorizontal: space.md, marginBottom: space.xl,
    borderWidth: 1, borderColor: colors.hairline,
  },
  currencySymbol: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', paddingRight: 4 },
  priceInput: {
    flex: 1, color: colors.textPrimary, fontSize: 24, fontWeight: '700',
    paddingVertical: space.md, fontVariant: ['tabular-nums'],
  },
  sheetBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: space.xl, paddingVertical: space.sm,
  },
  saveBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
