/**
 * Quotes — every sent/saved quote (quick and project) with its status, and a
 * "To chase" filter for sent quotes with no reply after a few days.
 */
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { loadQuotes, type QuoteSummary } from '@/src/data/quote-repo';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { needsChaseUp, QUOTE_STATUS_LABELS } from '@/src/domain/quotes';
import type { EstimateStatus } from '@/src/domain/types';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { StatusChip } from '@/src/ui/quotes/StatusChip';
import { colors, radius, space } from '@/src/ui/theme/tokens';

const toggles = seedLaborToggles.map(toLaborToggle);
type Filter = 'all' | 'chase' | EstimateStatus;

function quoteDate(q: QuoteSummary): string {
  const ts = q.estimate.sentAt ?? q.estimate.createdAt;
  return ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export default function QuotesScreen() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(useCallback(() => {
    loadQuotes()
      .then((q) => { setQuotes(q); setLoaded(true); })
      .catch((e) => console.error('load quotes failed', e));
  }, []));

  const now = Date.now();
  const chaseCount = quotes.filter((q) => needsChaseUp(q.estimate, now)).length;
  const filtered = quotes.filter((q) =>
    filter === 'all' ? true : filter === 'chase' ? needsChaseUp(q.estimate, now) : q.estimate.status === filter,
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(chaseCount > 0 ? [{ id: 'chase' as Filter, label: `To chase (${chaseCount})` }] : []),
    ...(['sent', 'accepted', 'invoiced', 'declined'] as const).map((s) => ({ id: s as Filter, label: QUOTE_STATUS_LABELS[s] })),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Quotes</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((f) => {
            const active = filter === f.id;
            const danger = f.id === 'chase';
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[styles.filterChip, active && { backgroundColor: danger ? colors.danger : colors.accent, borderColor: danger ? colors.danger : colors.accent }]}
              >
                <Text style={[styles.filterText, danger && !active && { color: colors.danger }, active && styles.filterTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(q) => q.estimate.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={loaded ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{quotes.length === 0 ? 'No quotes yet' : 'Nothing here'}</Text>
            {quotes.length === 0 && (
              <Text style={styles.emptySub}>
                When you send a quote (or the client signs it), it’s saved here so you can track it and chase it up.
              </Text>
            )}
          </View>
        ) : null}
        renderItem={({ item }) => {
          const total = priceEstimate(item.estimate, toggles).grandTotalMinor;
          const chase = needsChaseUp(item.estimate, now);
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/quote/${item.estimate.id}` as any)}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>{item.clientName || item.projectName || 'No client'}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.projectName ?? 'Quick quote', quoteDate(item)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.total}>{formatMoney(total, item.estimate.currency)}</Text>
                <StatusChip status={item.estimate.status} chaseUp={chase} />
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 50 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  filterWrap: { height: 52 },
  filterRow: { gap: space.xs, alignItems: 'center', paddingHorizontal: space.lg },
  filterChip: {
    paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface,
  },
  filterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: colors.accentInk },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg,
  },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13 },
  total: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyWrap: { alignItems: 'center', paddingTop: space.xxl, gap: space.md, paddingHorizontal: space.xl },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
