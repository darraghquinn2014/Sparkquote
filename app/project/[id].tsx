/**
 * Project detail — manage a project's floors and rooms.
 * Floors are top-level locations; rooms are nested under a floor.
 * (Reference photos per room come in Phase 2.)
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { Project, Location } from '@/src/domain/types';
import { loadProjects, loadLocations, addLocation, deleteLocation, deleteProject, renameProject, renameLocation } from '@/src/data/project-repo';
import { loadFloorPlanForLocation, loadWallsForFloorPlan } from '@/src/data/floor-plan-repo';
import { loadProjectEstimate } from '@/src/data/project-estimate-repo';
import { photosForLocation } from '@/src/data/photo-repo';
import { loadBusinessProfile, readLogoDataUri } from '@/src/data/business-profile';
import { renderProjectReportHtml } from '@/src/pdf/render-project-report';
import type { ReportFloor, ReportRoom, ReportPhoto } from '@/src/pdf/render-project-report';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const allToggles = seedLaborToggles.map(toLaborToggle);

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [roomTotals, setRoomTotals] = useState<Map<string, number>>(new Map());
  const [planInfo, setPlanInfo] = useState<Map<string, { hasPlan: boolean; wallCount: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [reportBusy, setReportBusy] = useState(false);

  // inline-add state: which parent we're adding to (null = adding a floor)
  const [addingTo, setAddingTo] = useState<string | 'floor' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | 'project' | null>(null);
  const [editName, setEditName] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    const [ps, locs, estimate] = await Promise.all([
      loadProjects(),
      loadLocations(id),
      loadProjectEstimate(id),
    ]);
    setProject(ps.find((p) => p.id === id) ?? null);
    setLocations(locs);

    const floorLocs = locs.filter((l) => l.parentId == null);
    const planEntries = await Promise.all(floorLocs.map(async (floor): Promise<[string, { hasPlan: boolean; wallCount: number }]> => {
      const plan = await loadFloorPlanForLocation(floor.id);
      const wallCount = plan ? (await loadWallsForFloorPlan(plan.id)).length : 0;
      return [floor.id, { hasPlan: plan != null, wallCount }];
    }));
    setPlanInfo(new Map(planEntries));

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

  const generateReport = async () => {
    if (!project || !id) return;
    setReportBusy(true);
    try {
      const [locs, estimate, profile, logoUri] = await Promise.all([
        loadLocations(id),
        loadProjectEstimate(id),
        loadBusinessProfile(),
        readLogoDataUri(),
      ]);

      const priced = estimate ? priceEstimate(estimate, allToggles) : null;
      const lineTotals = new Map(priced?.lines.map((l) => [l.lineId, l.lineTotalMinor]) ?? []);
      const currency = estimate?.currency ?? 'GBP';

      const floorLocs = locs.filter((l) => l.parentId == null);
      const reportFloors: ReportFloor[] = [];

      for (const floor of floorLocs) {
        const rooms = locs.filter((l) => l.parentId === floor.id);
        const reportRooms: ReportRoom[] = [];

        for (const room of rooms) {
          const roomPhotos = await photosForLocation(room.id);
          const reportPhotos: ReportPhoto[] = [];
          for (const photo of roomPhotos) {
            try {
              // Shrink to 400px wide thumbnail before base64 — keeps HTML small enough
              // for printToFileAsync to handle without hanging.
              const resized = await ImageManipulator.manipulateAsync(
                photo.filePath,
                [{ resize: { width: 400 } }],
                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
              );
              if (resized.base64) {
                reportPhotos.push({
                  dataUri: `data:image/jpeg;base64,${resized.base64}`,
                  caption: photo.caption,
                  note: photo.note,
                });
              }
            } catch { /* skip unreadable files */ }
          }

          const roomLines = (estimate?.lineItems ?? []).filter((l) => l.locationId === room.id);
          const lineItems = roomLines.map((l) => ({
            description: l.description,
            quantityLabel: l.quantityMeters != null ? `${l.quantityMeters} m` : l.quantity != null ? String(l.quantity) : '1',
            lineTotalMinor: lineTotals.get(l.id) ?? 0,
          }));
          const roomTotal = lineItems.reduce((s, l) => s + l.lineTotalMinor, 0);
          reportRooms.push({ name: room.name, lineItems, roomTotalMinor: roomTotal, photos: reportPhotos });
        }

        const floorTotal = reportRooms.reduce((s, r) => s + r.roomTotalMinor, 0);
        reportFloors.push({ name: floor.name, rooms: reportRooms, floorTotalMinor: floorTotal });
      }

      const html = renderProjectReportHtml({
        projectName: project.name,
        clientName: project.clientName,
        businessName: profile.businessName || undefined,
        logoDataUri: logoUri ?? undefined,
        dateIso: new Date().toISOString(),
        currency,
        floors: reportFloors,
        subtotalMinor: priced?.subtotalMinor ?? 0,
        vatRatePct: estimate?.vatRatePct ?? 20,
        vatAmountMinor: priced?.vatAmountMinor ?? 0,
        grandTotalMinor: priced?.grandTotalMinor ?? 0,
      });

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${project.name} — Report` });
    } catch (e) {
      Alert.alert('Report error', String(e));
    } finally {
      setReportBusy(false);
    }
  };

  const floors = locations.filter((l) => l.parentId == null);
  const roomsOf = (floorId: string) => locations.filter((l) => l.parentId === floorId);
  const floorTotal = (floorId: string) =>
    roomsOf(floorId).reduce((s, r) => s + (roomTotals.get(r.id) ?? 0), 0);

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

  const openOverflow = () => {
    if (!project) return;
    Alert.alert(project.name, undefined, [
      { text: 'Documents', onPress: () => router.push(`/project/drawings/${id}` as any) },
      { text: 'Delete project', style: 'destructive', onPress: confirmDeleteProject },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const longPressFloor = (floor: Location) => {
    Alert.alert(floor.name, undefined, [
      { text: 'Rename', onPress: () => startEdit(floor.id, floor.name) },
      { text: 'Delete floor', style: 'destructive', onPress: () => confirmDeleteLocation(floor) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const longPressRoom = (room: Location) => {
    Alert.alert(room.name, undefined, [
      { text: 'Rename', onPress: () => startEdit(room.id, room.name) },
      { text: 'Delete room', style: 'destructive', onPress: () => confirmDeleteLocation(room) },
      { text: 'Cancel', style: 'cancel' },
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pressable style={styles.quoteBtn} onPress={() => router.push(`/project/quote/${id}` as any)} hitSlop={8}>
            <Text style={styles.quoteBtnText}>Quote</Text>
          </Pressable>
          <Pressable style={styles.reportBtn} onPress={() => router.push(`/project/snag/${id}` as any)} hitSlop={8}>
            <Text style={styles.reportBtnText}>Snags</Text>
          </Pressable>
          <Pressable style={styles.reportBtn} onPress={generateReport} disabled={reportBusy} hitSlop={8}>
            <Text style={styles.reportBtnText}>{reportBusy ? '…' : 'Report'}</Text>
          </Pressable>
          <Pressable onPress={openOverflow} hitSlop={12}>
            <Text style={styles.moreBtn}>•••</Text>
          </Pressable>
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
            <Pressable onLongPress={() => longPressFloor(floor)} style={styles.floorRow}>
              {editingId === floor.id ? (
                <>
                  <TextInput value={editName} onChangeText={setEditName} style={[styles.editInput, { flex: 1 }]} autoFocus onSubmitEditing={() => commitEditLocation(floor.id)} />
                  <Pressable style={styles.addConfirm} onPress={() => commitEditLocation(floor.id)}><Text style={styles.addConfirmText}>Save</Text></Pressable>
                </>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.floorName}>{floor.name}</Text>
                    {floorTotal(floor.id) > 0 && (
                      <Text style={styles.floorTotalText}>{formatMoney(floorTotal(floor.id), 'GBP')}</Text>
                    )}
                  </View>
                  <View style={styles.floorRowActions}>
                    <Pressable
                      style={styles.planBtn}
                      onPress={() => router.push(`/project/plan/${floor.id}` as any)}
                      hitSlop={8}
                    >
                      <Text style={styles.planBtnText}>
                        {planInfo.get(floor.id)?.hasPlan
                          ? `Plan (${planInfo.get(floor.id)?.wallCount} wall${planInfo.get(floor.id)?.wallCount === 1 ? '' : 's'})`
                          : 'Plan'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => startEdit(floor.id, floor.name)} hitSlop={8}>
                      <Text style={styles.editBtn}>Edit</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Pressable>

            {roomsOf(floor.id).map((room) => (
              <Pressable
                key={room.id}
                style={styles.roomRow}
                onPress={() => router.push(`/project/room/${room.id}` as any)}
                onLongPress={() => longPressRoom(room)}
              >
                {editingId === room.id ? (
                  <>
                    <TextInput value={editName} onChangeText={setEditName} style={[styles.editInput, { flex: 1 }]} autoFocus onSubmitEditing={() => commitEditLocation(room.id)} />
                    <Pressable style={styles.addConfirm} onPress={() => commitEditLocation(room.id)}><Text style={styles.addConfirmText}>Save</Text></Pressable>
                  </>
                ) : (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roomName}>{room.name}</Text>
                      {(roomTotals.get(room.id) ?? 0) > 0 && (
                        <Text style={styles.roomTotalText}>{formatMoney(roomTotals.get(room.id)!, 'GBP')}</Text>
                      )}
                    </View>
                    <Text style={styles.roomChevron}>›</Text>
                  </>
                )}
              </Pressable>
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
      {reportBusy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.busyText}>Building report…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  quoteBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  quoteBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },
  reportBtn: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  reportBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  moreBtn: { color: colors.textSecondary, fontSize: 20, fontWeight: '700', letterSpacing: 2 },
  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,16,30,0.88)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  busyText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
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
  floorBlock: { backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline, padding: space.md, marginBottom: space.md },
  floorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  floorRowActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  planBtn: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5, borderWidth: 1, borderColor: colors.hairline },
  planBtnText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  floorName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  floorTotalText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },
  roomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, marginBottom: space.xs },
  roomName: { color: colors.textPrimary, fontSize: 15 },
  roomTotalText: { color: colors.accent, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
  roomChevron: { color: colors.textMuted, fontSize: 20 },
  addRoomBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: space.sm, marginTop: space.xs },
  addRoomText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, marginBottom: space.sm },
  addInput: { flex: 1, backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 15 },
  addConfirm: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: space.sm },
  addConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
});
