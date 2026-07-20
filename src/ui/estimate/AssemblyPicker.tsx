/**
 * AssemblyPicker — modal sheet for adding a preset "job" (Assembly) to the
 * current estimate. Tap a tile to add one, tap the minus badge to remove one.
 * Each tile shows its all-in unit price (material + labor) so the price is
 * visible before it's added — no separate confirm step, matching how
 * MaterialPicker/LabourSheet behave as always-open-until-Done sheets.
 */
import React, { useMemo, useState } from 'react';
import {
  Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Assembly, LaborToggle, LineItem, Material } from '../../domain/types';
import { materialLookupFrom } from '../../domain/assembly';
import { priceLine } from '../../domain/pricing';
import { lineFromAssembly } from '../../data/estimate-service';
import { colors, space, radius, type, categoryColor } from '../theme/tokens';
import { formatMoney } from '../../domain/money';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.85;

interface Props {
  visible: boolean;
  assemblies: Assembly[];
  materials: Material[];
  toggles: LaborToggle[];
  hourlyRateMinor: number;
  currency: 'GBP' | 'EUR';
  lineItems: LineItem[];
  onAdd: (assembly: Assembly) => void;
  onRemove: (assemblyId: string) => void;
  onClose: () => void;
}

export function AssemblyPicker({
  visible, assemblies, materials, toggles, hourlyRateMinor, currency, lineItems, onAdd, onRemove, onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const lookup = useMemo(() => materialLookupFrom(materials), [materials]);
  const toggleIndex = useMemo(() => new Map(toggles.map((t) => [t.id, t])), [toggles]);

  const categories = useMemo(
    () => Array.from(new Set(assemblies.map((a) => a.category))).sort(),
    [assemblies],
  );

  const unitPrice = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assemblies) {
      try {
        const line = lineFromAssembly(a, lookup);
        const b = priceLine(line, hourlyRateMinor, toggleIndex, []);
        map.set(a.id, b.lineTotalMinor);
      } catch (e) {
        // A component material is missing from the catalogue (e.g. deleted
        // after this job was built) — skip it rather than crash the whole
        // picker; it just won't be offered until the job is fixed/rebuilt.
        console.error('AssemblyPicker: skipping unpriceable assembly', a.id, e);
      }
    }
    return map;
  }, [assemblies, lookup, toggleIndex, hourlyRateMinor]);

  const quantityByAssembly = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lineItems) {
      if (!l.sourceAssemblyId) continue;
      map.set(l.sourceAssemblyId, (map.get(l.sourceAssemblyId) ?? 0) + (l.quantity ?? 1));
    }
    return map;
  }, [lineItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assemblies
      .filter((a) => unitPrice.has(a.id))
      .filter((a) => (activeCategory ? a.category === activeCategory : true))
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true));
  }, [assemblies, unitPrice, activeCategory, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { height: SHEET_HEIGHT, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Add job</Text>
            <Pressable onPress={onClose} accessibilityLabel="Done">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search jobs"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            autoCorrect={false}
          />

          <View style={styles.filterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              keyboardShouldPersistTaps="handled"
            >
              {[null, ...categories].map((c) => {
                const active = activeCategory === c;
                const tint = c ? categoryColor(c) : colors.accent;
                return (
                  <Pressable
                    key={c ?? '__all'}
                    onPress={() => setActiveCategory(c)}
                    style={[styles.chip, active && { backgroundColor: tint, borderColor: tint }]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c ?? 'All'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent} keyboardShouldPersistTaps="handled">
            <View style={styles.gridRow}>
              {filtered.map((a) => {
                const qty = quantityByAssembly.get(a.id) ?? 0;
                const price = unitPrice.get(a.id) ?? 0;
                return (
                  <View key={a.id} style={styles.tileOuter}>
                    <Pressable
                      onPress={() => onAdd(a)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${a.name}, ${formatMoney(price, currency)}`}
                      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                    >
                      <View style={[styles.band, { backgroundColor: categoryColor(a.category) }]} />
                      <View style={styles.tileBody}>
                        <Text style={styles.eyebrow} numberOfLines={1}>{a.category.toUpperCase()}</Text>
                        <Text style={styles.label} numberOfLines={2}>{a.name}</Text>
                        <Text style={styles.price}>{formatMoney(price, currency)}</Text>
                      </View>
                    </Pressable>
                    {qty > 0 && (
                      <View style={styles.controls}>
                        <Pressable onPress={() => onRemove(a.id)} hitSlop={8} style={styles.minusBtn}>
                          <Text style={styles.minusText}>−</Text>
                        </Pressable>
                        <View style={styles.countBadge}>
                          <Text style={styles.countText}>{qty}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            {filtered.length === 0 && (
              <Text style={styles.empty}>No jobs match "{query}".</Text>
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
  sheet: { backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  done: { fontSize: 16, fontWeight: '700', color: colors.accent },
  search: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16, marginBottom: space.sm },
  filterContainer: { height: 44, marginBottom: space.sm },
  filterRow: { gap: space.sm, alignItems: 'center' },
  chip: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline },
  chipText: { ...type.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.accentInk, fontWeight: '800' },
  grid: { flex: 1 },
  gridContent: { paddingBottom: space.xl },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl, ...type.body },

  tileOuter: { width: '50%', padding: space.xs },
  tile: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tilePressed: { backgroundColor: colors.surfacePressed, transform: [{ scale: 0.97 }] },
  band: { height: 4, width: '100%' },
  tileBody: { padding: space.md, gap: space.xs },
  eyebrow: { ...type.eyebrow, color: colors.textMuted },
  label: { ...type.tileLabel, color: colors.textPrimary },
  price: { ...type.money, color: colors.textSecondary },
  controls: { position: 'absolute', top: space.sm, right: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs, zIndex: 2 },
  minusBtn: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  minusText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', lineHeight: 20 },
  countBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.accentSecondary, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.accentInk, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
