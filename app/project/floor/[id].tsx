/**
 * Floor detail — a focused page for managing one floor's rooms (add, edit,
 * delete), reached by tapping a floor's name on the project screen. The
 * project screen keeps its own inline floor/room overview alongside this;
 * this page is an additional, more focused way to manage a busy floor.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { Project, Location } from '@/src/domain/types';
import { loadProjects, loadLocation, loadLocations, addLocation, renameLocation, deleteLocation } from '@/src/data/project-repo';
import { loadProjectEstimate } from '@/src/data/project-estimate-repo';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { COMMON_ROOM_NAMES } from '@/src/domain/room-names';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const allToggles = seedLaborToggles.map(toLaborToggle);

export default function FloorDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [floor, setFloor] = useState<Location | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [rooms, setRooms] = useState<Location[]>([]);
  const [roomTotals, setRoomTotals] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [customRoom, setCustomRoom] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    const loc = await loadLocation(id).catch(() => null);
    setFloor(loc);
    if (!loc) { setLoading(false); return; }

    const [projects, locs, estimate] = await Promise.all([
      loadProjects(),
      loadLocations(loc.projectId),
      loadProjectEstimate(loc.projectId),
    ]);
    setProject(projects.find((p) => p.id === loc.projectId) ?? null);
    setRooms(locs.filter((l) => l.parentId === id));

    if (estimate) {
      const priced = priceEstimate(estimate, allToggles);
      const lineTotals = new Map(priced.lines.map((l) => [l.lineId, l.lineTotalMinor]));
      const totals = new Map<string, number>();
      for (const line of estimate.lineItems) {
        if (!line.locationId) continue;
        totals.set(line.locationId, (totals.get(line.locationId) ?? 0) + (lineTotals.get(line.id) ?? 0));
      }
      setRoomTotals(totals);
    } else {
      setRoomTotals(new Map());
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const resetAdd = () => { setAdding(false); setCustomRoom(false); setDraftName(''); };

  const quickAddRoom = async (name: string) => {
    if (!floor) return;
    await addLocation(floor.projectId, name, floor.id);
    resetAdd();
    reload();
  };

  const commitAdd = async () => {
    const name = draftName.trim();
    if (!name || !floor) { resetAdd(); return; }
    await addLocation(floor.projectId, name, floor.id);
    resetAdd();
    reload();
  };

  const startEdit = (roomId: string, current: string) => { setEditingId(roomId); setEditName(current); };
  const commitEdit = async (roomId: string) => {
    const n = editName.trim();
    if (n) await renameLocation(roomId, n);
    setEditingId(null);
    reload();
  };

  const confirmDelete = (room: Location) => {
    Alert.alert('Delete room?', `Remove "${room.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteLocation(room.id); reload(); } },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} /></SafeAreaView>;
  }

  if (!floor) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        </View>
        <Text style={styles.empty}>Floor not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Pressable style={styles.planBtn} onPress={() => router.push(`/project/plan/${floor.id}` as any)} hitSlop={8}>
          <Text style={styles.planBtnText}>Plan</Text>
        </Pressable>
        <View style={styles.headerTitleOverlay} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>{floor.name.toUpperCase()}</Text>
          {project?.name ? <Text style={styles.sub} numberOfLines={1}>{project.name}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        {rooms.map((room) => (
          <View key={room.id} style={styles.roomRow}>
            {editingId === room.id ? (
              <>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={[styles.editInput, { flex: 1 }]}
                  autoFocus
                  onSubmitEditing={() => commitEdit(room.id)}
                />
                <Pressable style={styles.addConfirm} onPress={() => commitEdit(room.id)}><Text style={styles.addConfirmText}>Save</Text></Pressable>
              </>
            ) : (
              <>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/project/room/${room.id}` as any)}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  {(roomTotals.get(room.id) ?? 0) > 0 && (
                    <Text style={styles.roomTotalText}>{formatMoney(roomTotals.get(room.id)!, 'GBP')}</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => startEdit(room.id, room.name)} hitSlop={8}>
                  <Text style={styles.editBtn}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(room)} hitSlop={8} style={{ marginLeft: space.sm }}>
                  <Text style={styles.deleteBtn}>Delete</Text>
                </Pressable>
              </>
            )}
          </View>
        ))}

        {rooms.length === 0 && !adding && (
          <Text style={styles.noRooms}>No rooms yet on this floor.</Text>
        )}

        {adding && !customRoom ? (
          <View style={styles.chipRow}>
            {COMMON_ROOM_NAMES.map((name) => (
              <Pressable key={name} style={styles.chip} onPress={() => quickAddRoom(name)}>
                <Text style={styles.chipText}>{name}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.chip} onPress={() => setCustomRoom(true)}>
              <Text style={styles.chipText}>+ Custom</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={resetAdd}>
              <Text style={styles.chipText}>Cancel</Text>
            </Pressable>
          </View>
        ) : adding && customRoom ? (
          <View style={styles.addRow}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Room name (e.g. Kitchen)"
              placeholderTextColor={colors.textMuted}
              style={styles.addInput}
              autoFocus
              onSubmitEditing={commitAdd}
            />
            <Pressable style={styles.addCancel} onPress={resetAdd}><Text style={styles.addCancelText}>Cancel</Text></Pressable>
            <Pressable style={styles.addConfirm} onPress={commitAdd}><Text style={styles.addConfirmText}>Add</Text></Pressable>
          </View>
        ) : (
          <Pressable style={styles.addRoomBtn} onPress={() => { setAdding(true); setDraftName(''); setCustomRoom(false); }}>
            <Text style={styles.addRoomText}>+ Add room</Text>
          </Pressable>
        )}
      </ScrollView>
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
  headerTitleOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  sub: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 1 },
  planBtn: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5, borderWidth: 1, borderColor: colors.hairline },
  planBtnText: { color: colors.accent, fontWeight: '700', fontSize: 12 },

  roomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: space.md, paddingVertical: space.md, marginBottom: space.sm },
  roomName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  roomTotalText: { color: colors.accent, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
  editBtn: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  deleteBtn: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  editInput: { backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 15, marginRight: space.sm },

  noFloors: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic', marginTop: space.sm },
  noRooms: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic', marginTop: space.sm, marginBottom: space.sm },

  addRoomBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: space.sm, marginTop: space.xs },
  addRoomText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: space.md, paddingVertical: space.sm },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, marginBottom: space.sm },
  addInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 15 },
  addConfirm: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: space.sm },
  addConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  addCancel: { borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  addCancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },

  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
});
