/**
 * Projects tab — list of real, persisted projects. Tap one to manage its
 * floors/rooms (and later, reference photos). Replaces the hardcoded sample.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { EstimateStatus, Material, Project } from '@/src/domain/types';
import { loadProjects, loadLocations } from '@/src/data/project-repo';
import { loadProjectEstimate } from '@/src/data/project-estimate-repo';
import { loadCatalogue } from '@/src/data/catalogue-repo';
import { VoiceAddModal } from '@/src/ui/voice/VoiceAddModal';
import { colors, space, radius, type as typo } from '@/src/ui/theme/tokens';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', approved: 'Approved', declined: 'Declined', signed: 'Signed',
};
const STATUS_COLORS: Record<string, string> = {
  draft: '#6B8DAE', sent: '#1B8FFF', approved: '#06D6A0', declined: '#E5564B', signed: '#9B5DE5',
};

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<Record<string, EstimateStatus>>({});
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const reload = useCallback(async () => {
    const [ps, cat] = await Promise.all([loadProjects(), loadCatalogue()]);
    setProjects(ps);
    setMaterials(cat.materials);
    const counts: Record<string, number> = {};
    const sts: Record<string, EstimateStatus> = {};
    for (const p of ps) {
      const [locs, est] = await Promise.all([loadLocations(p.id), loadProjectEstimate(p.id)]);
      // Only count actual rooms (nested locations) — loadLocations also
      // returns top-level floors, which aren't rooms.
      counts[p.id] = locs.filter((l) => l.parentId != null).length;
      if (est) sts[p.id] = est.status;
    }
    setRoomCounts(counts);
    setStatuses(sts);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pressable style={styles.micBtn} onPress={() => setVoiceOpen(true)} hitSlop={8}>
            <Text style={styles.micBtnText}>🎤</Text>
          </Pressable>
          <Pressable style={styles.newBtn} onPress={() => router.push('/project/new' as any)}>
            <Text style={styles.newText}>+ New project</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={
            <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptyText}>Create a project to organise rooms and reference photos for a job.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/project/${item.id}` as any)}>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  {statuses[item.id] && (
                    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[statuses[item.id]] + '22', borderColor: STATUS_COLORS[statuses[item.id]] + '55' }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[statuses[item.id]] }]}>
                        {STATUS_LABELS[statuses[item.id]]}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>
                  {item.clientName ? `${item.clientName} · ` : ''}
                  {roomCounts[item.id] ?? 0} room{(roomCounts[item.id] ?? 0) === 1 ? '' : 's'}
                </Text>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text>
            </Pressable>
          )}
        />
      )}
      <VoiceAddModal
        visible={voiceOpen}
        materials={materials}
        projects={projects}
        currency="GBP"
        onAdded={reload}
        onClose={() => setVoiceOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  micBtn: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  micBtnText: { fontSize: 16 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  newText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, marginBottom: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 3, opacity: 0.7 },
  empty: { alignItems: 'center', marginTop: space.xxl * 2, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { color: colors.textSecondary, fontSize: 17, fontWeight: '700', marginTop: space.sm },
  emptyText: { color: colors.textMuted, textAlign: 'center', ...typo.body },
});
