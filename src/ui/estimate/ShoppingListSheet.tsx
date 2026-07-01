import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, FlatList, Modal,
  Share, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadCatalogue } from '@/src/data/catalogue-repo';
import { formatMoney } from '@/src/domain/money';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import type { Estimate, Material, Assembly, Currency } from '@/src/domain/types';

interface ShoppingEntry {
  key: string;
  description: string;
  unit: string;
  quantity: number;
  unitCostMinor: number;
  totalCostMinor: number;
}

function buildShoppingList(
  estimate: Estimate,
  materials: Material[],
  assemblies: Assembly[],
): ShoppingEntry[] {
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  const assemblyMap = new Map(assemblies.map((a) => [a.id, a]));
  // key → accumulated quantities and cost
  const acc = new Map<string, ShoppingEntry>();

  const add = (mat: Material, qty: number) => {
    const key = mat.id;
    const existing = acc.get(key);
    if (existing) {
      existing.quantity += qty;
      existing.totalCostMinor += mat.unitCostMinor * qty;
    } else {
      acc.set(key, {
        key,
        description: mat.description,
        unit: mat.unit,
        quantity: qty,
        unitCostMinor: mat.unitCostMinor,
        totalCostMinor: mat.unitCostMinor * qty,
      });
    }
  };

  for (const line of estimate.lineItems) {
    // Labour-only lines — skip
    if (line.laborBaseHours > 0 && line.resolvedMaterialCostMinor === 0 && !line.sourceAssemblyId) continue;

    if (line.sourceAssemblyId) {
      const assembly = assemblyMap.get(line.sourceAssemblyId);
      if (!assembly) continue;
      const qty = line.quantity ?? 1;
      for (const comp of assembly.components) {
        const mat = materialMap.get(comp.materialId);
        if (!mat) continue;
        const waste = comp.wasteFactor ?? 1;
        add(mat, comp.quantity * waste * qty);
      }
    } else if (line.resolvedMaterialCostMinor > 0) {
      // Material-only line — no materialId on the line, use description as key
      const key = `custom:${line.description.toLowerCase()}`;
      const lineQty = line.quantityMeters ?? line.quantity ?? 1;
      const existing = acc.get(key);
      if (existing) {
        existing.quantity += lineQty;
        existing.totalCostMinor += line.resolvedMaterialCostMinor * lineQty;
      } else {
        acc.set(key, {
          key,
          description: line.description,
          unit: line.quantityMeters != null ? 'm' : 'each',
          quantity: lineQty,
          unitCostMinor: line.resolvedMaterialCostMinor,
          totalCostMinor: line.resolvedMaterialCostMinor * lineQty,
        });
      }
    }
  }

  return [...acc.values()].sort((a, b) => a.description.localeCompare(b.description));
}

function formatQty(entry: ShoppingEntry): string {
  if (entry.unit === 'm') return `${entry.quantity.toFixed(1)} m`;
  const rounded = Math.ceil(entry.quantity);
  return `${rounded} ${entry.unit !== 'each' ? entry.unit : ''}`.trim();
}

function buildShareText(entries: ShoppingEntry[], currency: Currency): string {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines = entries.map((e) => `□  ${formatQty(e).padEnd(10)} ${e.description}`);
  const total = entries.reduce((s, e) => s + e.totalCostMinor, 0);
  return [
    `Shopping List — ${date}`,
    '─'.repeat(36),
    ...lines,
    '─'.repeat(36),
    `Materials total: ${formatMoney(total, currency)}`,
  ].join('\n');
}

interface Props {
  visible: boolean;
  estimate: Estimate;
  onClose: () => void;
}

export function ShoppingListSheet({ visible, estimate, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<ShoppingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadCatalogue()
      .then(({ materials, assemblies }) => {
        setEntries(buildShoppingList(estimate, materials, assemblies));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [visible, estimate]);

  const total = entries.reduce((s, e) => s + e.totalCostMinor, 0);

  const share = async () => {
    await Share.share({ message: buildShareText(entries, estimate.currency) });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.xl) }]}>
        {/* Handle */}
        <View style={styles.handle} />

        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Shopping List</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: space.xxl }} />
        ) : entries.length === 0 ? (
          <Text style={styles.empty}>No materials in this estimate.</Text>
        ) : (
          <>
            <FlatList
              data={entries}
              keyExtractor={(e) => e.key}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qty}>{formatQty(item)}</Text>
                  </View>
                  <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                  <Text style={styles.cost}>{formatMoney(item.totalCostMinor, estimate.currency)}</Text>
                </View>
              )}
              ListFooterComponent={
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Materials total</Text>
                  <Text style={styles.totalValue}>{formatMoney(total, estimate.currency)}</Text>
                </View>
              }
            />
            <Pressable style={styles.shareBtn} onPress={share}>
              <Text style={styles.shareBtnText}>Share list</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.hairline,
    alignSelf: 'center', marginTop: space.md, marginBottom: space.sm,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingBottom: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  closeBtn: { fontSize: 18, color: colors.textMuted },

  list: { flexGrow: 0, maxHeight: 420 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.xl, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  qtyBadge: {
    backgroundColor: colors.ground, borderRadius: radius.tile,
    paddingHorizontal: space.sm, paddingVertical: 3, minWidth: 52, alignItems: 'center',
  },
  qty: { fontSize: 12, fontWeight: '700', color: colors.accent, fontVariant: ['tabular-nums'] },
  desc: { flex: 1, fontSize: 14, color: colors.textPrimary },
  cost: { fontSize: 13, color: colors.textSecondary, fontVariant: ['tabular-nums'] },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingVertical: space.lg,
    borderTopWidth: 1, borderTopColor: colors.hairline,
  },
  totalLabel: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  totalValue: { fontSize: 17, color: colors.accent, fontWeight: '800', fontVariant: ['tabular-nums'] },

  shareBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    marginHorizontal: space.xl, marginTop: space.md,
    paddingVertical: 13, alignItems: 'center',
  },
  shareBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

  empty: { color: colors.textMuted, textAlign: 'center', padding: space.xxl },
});
