/**
 * Projects tab — list of real, persisted projects. Tap one to manage its
 * floors/rooms (and later, reference photos). Replaces the hardcoded sample.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Project } from '@/src/domain/types';
import { loadProjects, loadLocations } from '@/src/data/project-repo';
import { colors, space, radius, type as typo } from '@/src/ui/theme/tokens';
import { TabBarHeightReporter } from '@/src/ui/TabBarHeightReporter';
import { HeaderMicButton } from '@/src/ui/voice/HeaderMicButton';

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.clientName ?? '').toLowerCase().includes(q) ||
      (p.address ?? '').toLowerCase().includes(q)
    );
  }, [projects, query]);

  const reload = useCallback(async () => {
    const ps = await loadProjects();
    setProjects(ps);
    const counts: Record<string, number> = {};
    for (const p of ps) {
      const locs = await loadLocations(p.id);
      // Only count actual rooms (nested locations) — loadLocations also
      // returns top-level floors, which aren't rooms.
      counts[p.id] = locs.filter((l) => l.parentId != null).length;
    }
    setRoomCounts(counts);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <TabBarHeightReporter />
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pressable style={styles.newBtn} onPress={() => router.push('/project/new' as any)}>
            <Text style={styles.newText}>+ New project</Text>
          </Pressable>
          <HeaderMicButton />
        </View>
      </View>

      {!loading && projects.length > 0 && (
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            accessibilityLabel="Search projects"
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={
            <View style={styles.empty}>
              {projects.length === 0 ? (
                <>
                  <Text style={styles.emptyTitle}>No projects yet</Text>
                  <Text style={styles.emptyText}>Create a project to organise rooms and reference photos for a job.</Text>
                </>
              ) : (
                <Text style={styles.emptyText}>No projects match "{query}"</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/project/${item.id}` as any)}>
              {item.photoPath ? (
                <Image source={{ uri: item.photoPath }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Text style={styles.thumbPlaceholderText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.finishedAt ? <Text style={styles.finishedBadge}>✓ Finished</Text> : null}
                </View>
                <Text style={styles.meta}>
                  {item.clientName ? `${item.clientName} · ` : ''}
                  {roomCounts[item.id] ?? 0} room{(roomCounts[item.id] ?? 0) === 1 ? '' : 's'}
                </Text>
                {item.address ? (
                  <Text style={styles.address} numberOfLines={1}>📍 {item.address}</Text>
                ) : null}
                <Text style={styles.date}>
                  {item.finishedAt
                    ? `Finished ${new Date(item.finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  newText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  searchWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  search: { backgroundColor: colors.surface, borderRadius: radius.bar, paddingHorizontal: space.lg, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, marginBottom: space.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.tile / 2 },
  thumbPlaceholder: { width: 48, height: 48, borderRadius: radius.tile / 2, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { color: colors.textMuted, fontSize: 18, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  finishedBadge: { color: '#06D6A0', fontSize: 11, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  address: { color: colors.textMuted, fontSize: 12, marginTop: 2, opacity: 0.85 },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 3, opacity: 0.7 },
  empty: { alignItems: 'center', marginTop: space.xxl * 2, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { color: colors.textSecondary, fontSize: 17, fontWeight: '700', marginTop: space.sm },
  emptyText: { color: colors.textMuted, textAlign: 'center', ...typo.body },
});
