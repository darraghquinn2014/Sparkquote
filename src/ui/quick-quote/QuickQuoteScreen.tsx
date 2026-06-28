/**
 * QuickQuoteScreen (spec §3.2).
 *
 * The fast maintenance/service-call workflow: a searchable, category-filterable
 * grid of tap-to-add job tiles with a persistent live total. Built on the
 * useQuickQuote hook, which delegates all pricing to the engine.
 *
 * Each tile's displayed unit price is computed by pricing a one-off single-line
 * estimate through the SAME engine — there is no second pricing path. This is
 * the §6 build-risk discipline: one source of truth for money.
 *
 * Verified by typecheck + review (no device runtime here).
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import type { Assembly, LaborToggle, Material } from '../../domain/types';
import { materialLookupFrom } from '../../domain/assembly';
import { priceLine } from '../../domain/pricing';
import { lineFromAssembly } from '../../data/estimate-service';
import { colors, space, radius, type, categoryColor } from '../theme/tokens';
import { QuickQuoteTile } from './QuickQuoteTile';
import { RunningTotalBar } from './RunningTotalBar';
import { useQuickQuote, type QuickQuoteConfig } from './useQuickQuote';

interface Props {
  assemblies: Assembly[];
  materials: Material[];
  toggles: LaborToggle[];
  config: QuickQuoteConfig;
  onReview: (estimateId: string) => void;
  onManage: () => void;
}

export function QuickQuoteScreen({ assemblies, materials, toggles, config, onReview, onManage }: Props) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const lookup = useMemo(() => materialLookupFrom(materials), [materials]);
  const toggleIndex = useMemo(() => new Map(toggles.map((t) => [t.id, t])), [toggles]);
  const qq = useQuickQuote(materials, toggles, config);

  // unique categories for the filter row
  const categories = useMemo(
    () => Array.from(new Set(assemblies.map((a) => a.category))).sort(),
    [assemblies],
  );

  // per-assembly all-in unit price, via the engine (no separate math)
  const unitPrice = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assemblies) {
      const line = lineFromAssembly(a, lookup);
      const b = priceLine(line, config.hourlyRateMinor, toggleIndex, []);
      map.set(a.id, b.lineTotalMinor);
    }
    return map;
  }, [assemblies, lookup, toggleIndex, config.hourlyRateMinor]);

  // quantity already in the estimate, per assembly, for the tile badge
  const quantityByAssembly = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of qq.estimate.lineItems) {
      if (!l.sourceAssemblyId) continue;
      map.set(l.sourceAssemblyId, (map.get(l.sourceAssemblyId) ?? 0) + (l.quantity ?? 1));
    }
    return map;
  }, [qq.estimate.lineItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assemblies
      .filter((a) => (activeCategory ? a.category === activeCategory : true))
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true));
  }, [assemblies, activeCategory, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Quick Quote</Text>
          <Pressable onPress={onManage} accessibilityRole="button" style={styles.manageButton}>
            <Text style={styles.manageText}>Manage</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search jobs"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          accessibilityLabel="Search jobs"
        />
      </View>

      {/* category filter row */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[null, ...categories]}
        keyExtractor={(c) => c ?? '__all'}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = activeCategory === item;
          const tint = item ? categoryColor(item) : colors.accent;
          return (
            <Pressable
              onPress={() => setActiveCategory(item)}
              accessibilityRole="button"
              style={[styles.chip, active && { backgroundColor: tint, borderColor: tint }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item ?? 'All'}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* tile grid */}
      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <QuickQuoteTile
            assembly={item}
            unitPriceMinor={unitPrice.get(item.id) ?? 0}
            currency={config.currency}
            quantityInEstimate={quantityByAssembly.get(item.id) ?? 0}
            onPress={qq.addAssembly}
            onRemove={qq.removeAssembly}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No jobs match “{query}”. Try a different search.</Text>
        }
      />

      <RunningTotalBar
        subtotalMinor={qq.pricing.subtotalMinor}
        vatAmountMinor={qq.pricing.vatAmountMinor}
        grandTotalMinor={qq.pricing.grandTotalMinor}
        currency={config.currency}
        lineCount={qq.lineCount}
        vatRatePct={config.vatRatePct}
        onReview={() => onReview(qq.estimate.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  manageButton: { borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  manageText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.bar,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  filterRow: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginRight: space.sm,
  },
  chipText: { ...type.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.accentInk, fontWeight: '800' },
  grid: { paddingHorizontal: space.sm, paddingTop: space.sm, paddingBottom: space.xl },
  gridRow: { gap: 0 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl, ...type.body },
});


