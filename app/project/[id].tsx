/**
 * Project detail — manage a project's floors and rooms.
 * Floors are top-level locations; rooms are nested under a floor.
 * (Reference photos per room come in Phase 2.)
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { Project, Location } from '@/src/domain/types';
import { loadProjects, loadLocations, addLocation, deleteLocation, deleteProject, renameProject, renameLocation } from '@/src/data/project-repo';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // inline-add state: which parent we're adding to (null = adding a floor)
  const [addingTo, setAddingTo] = useState<string | 'floor' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | 'project' | null>(null);
  const [editName, setEditName] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    const ps = await loadProjects();
    setProject(ps.find((p) => p.id === id) ?? null);
    setLocations(await loadLocations(id));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const floors = locations.filter((l) => l.parentId == null);
  const roomsOf = (floorId: string) => locations.filter((l) => l.parentId === floorId);

  const commitAdd = async (parentId?: string) => {
    const name = draftName.trim();
    if (!name || !id) { setAddingTo(null); setDraftName(''); return; }
    await addLocation(id, name, parentId);
    setDraftName('');
    setAddingTo(null);
    reload();
  };

  const startEdit = (id: string | 'project', current: string) => { setEditingId(id); setEditName(current); };
  const commitEditProject = async () => {
    const n = editName.trim();
    if (n && project) await renameProject(project.id, n, project.clientName);
    setEditingId(null); reload();
  };
  const commitEditLocation = async (locId: string) => {
    const n = editName.trim();
    if (n) await renameLocation(locId, n);
    setEditingId(null); reload();
  };

  const confirmDeleteLocation = (loc: Location) => {
    const isFloor = loc.parentId == null;
    Alert.alert(
      isFloor ? 'Delete floor?' : 'Delete room?',
      isFloor ? `"${loc.name}" and all its rooms will be removed.` : `Remove "${loc.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { await deleteLocation(loc.id); reload(); } },
      ],
    );
  };

  const confirmDeleteProject = () => {
    if (!project) return;
    Alert.alert('Delete project?', `"${project.name}" and all its rooms will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteProject(project.id); router.back(); } },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} /></SafeAreaView>;
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable></View>
        <Text style={styles.empty}>Project not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pressable style={styles.quoteBtn} onPress={() => router.push(`/project/quote/${id}` as any)} hitSlop={8}>
            <Text style={styles.quoteBtnText}>Quote</Text>
          </Pressable>
          <Pressable onPress={confirmDeleteProject} hitSlop={12}><Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text></Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        {editingId === "project" ? (
          <View style={styles.editRow}>
            <TextInput value={editName} onChangeText={setEditName} style={styles.editInput} autoFocus onSubmitEditing={commitEditProject} />
            <Pressable style={styles.addConfirm} onPress={commitEditProject}><Text style={styles.addConfirmText}>Save</Text></Pressable>
          </View>
        ) : (
          <View style={styles.nameRow}>
            <Text style={styles.projectName}>{project.name}</Text>
            <Pressable onPress={() => startEdit("project", project.name)} hitSlop={8}><Text style={styles.editBtn}>Edit</Text></Pressable>
          </View>
        )}
        {project.clientName ? <Text style={styles.client}>{project.clientName}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Floors & rooms</Text>
          <Pressable style={styles.addFloorBtn} onPress={() => { setAddingTo('floor'); setDraftName(''); }}>
            
            <Text style={styles.addFloorText}>+ Add floor</Text>
          </Pressable>
        </View>

        {floors.length === 0 && addingTo !== 'floor' && (
          <Text style={styles.noFloors}>No floors yet. Add a floor, then add rooms to it.</Text>
        )}

        {addingTo === 'floor' && (
          <View style={styles.addRow}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Floor name (e.g. Ground Floor)"
              placeholderTextColor={colors.textMuted}
              style={styles.addInput}
              autoFocus
              onSubmitEditing={() => commitAdd(undefined)}
            />
            <Pressable style={styles.addConfirm} onPress={() => commitAdd(undefined)}><Text style={styles.addConfirmText}>Add</Text></Pressable>
          </View>
        )}

        {floors.map((floor) => (
          <View key={floor.id} style={styles.floorBlock}>
            <View style={styles.floorRow}>
              {editingId === floor.id ? (
                <>
                  <TextInput value={editName} onChangeText={setEditName} style={[styles.editInput, { flex: 1 }]} autoFocus onSubmitEditing={() => commitEditLocation(floor.id)} />
                  <Pressable style={styles.addConfirm} onPress={() => commitEditLocation(floor.id)}><Text style={styles.addConfirmText}>Save</Text></Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.floorName}>{floor.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <Pressable onPress={() => startEdit(floor.id, floor.name)} hitSlop={8}><Text style={styles.editBtn}>Edit</Text></Pressable>
                    <Pressable onPress={() => confirmDeleteLocation(floor)} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 13 }}>Delete</Text></Pressable>
                  </View>
                </>
              )}
            </View>

            {roomsOf(floor.id).map((room) => (
              <View key={room.id} style={styles.roomRow}>
                {editingId === room.id ? (
                  <>
                    <TextInput value={editName} onChangeText={setEditName} style={[styles.editInput, { flex: 1 }]} autoFocus onSubmitEditing={() => commitEditLocation(room.id)} />
                    <Pressable style={styles.addConfirm} onPress={() => commitEditLocation(room.id)}><Text style={styles.addConfirmText}>Save</Text></Pressable>
                  </>
                ) : (
                  <>
                    <Pressable style={{ flex: 1 }} onPress={() => router.push(`/project/room/${room.id}` as any)}>
                      <Text style={styles.roomName}>{room.name}</Text>
                    </Pressable>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                      <Pressable onPress={() => startEdit(room.id, room.name)} hitSlop={8}><Text style={styles.editBtn}>Edit</Text></Pressable>
                      <Pressable onPress={() => confirmDeleteLocation(room)} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 13 }}>Delete</Text></Pressable>
                      <Text style={{ color: colors.textMuted }}>›</Text>
                    </View>
                  </>
                )}
              </View>
            ))}

            {addingTo === floor.id ? (
              <View style={styles.addRow}>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Room name (e.g. Kitchen)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.addInput}
                  autoFocus
                  onSubmitEditing={() => commitAdd(floor.id)}
                />
                <Pressable style={styles.addConfirm} onPress={() => commitAdd(floor.id)}><Text style={styles.addConfirmText}>Add</Text></Pressable>
              </View>
            ) : (
              <Pressable style={styles.addRoomBtn} onPress={() => { setAddingTo(floor.id); setDraftName(''); }}>
                
                <Text style={styles.addRoomText}>+ Add room</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  quoteBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  quoteBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBtn: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  projectName: { color: colors.textPrimary, fontSize: 26, fontWeight: '800' },
  client: { color: colors.textSecondary, fontSize: 15, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  addFloorBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline },
  addFloorText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  noFloors: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic', marginTop: space.sm },
  floorBlock: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginBottom: space.md },
  floorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  floorName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  roomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, marginBottom: space.xs },
  roomName: { color: colors.textPrimary, fontSize: 15 },
  addRoomBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: space.sm, marginTop: space.xs },
  addRoomText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, marginBottom: space.sm },
  addInput: { flex: 1, backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 15 },
  addConfirm: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: space.sm },
  addConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
});
