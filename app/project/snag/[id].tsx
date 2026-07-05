import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import {
  snagItemsForProject, createSnagItem, toggleSnagItem, deleteSnagItem, updateSnagItemPhoto,
} from '@/src/data/snag-repo';
import { loadProjects, loadLocations } from '@/src/data/project-repo';
import { importSnagPhoto, deleteSnagPhoto } from '@/src/media/snag-photo-service';
import { useVoiceAction } from '@/src/voice/voice-bus';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import type { SnagItem, Location } from '@/src/domain/types';

const ACCENT = '#F0B730'; // amber — snag/punch list colour

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type CameraState = 'live' | 'preview';

export default function SnagListScreen() {
  const router = useRouter();
  const { id: projectId, promptPhotoFor } = useLocalSearchParams<{ id: string; promptPhotoFor?: string }>();
  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState<SnagItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const [draftLocationId, setDraftLocationId] = useState<string | undefined>(undefined);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [draftPhotoUri, setDraftPhotoUri] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('live');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  // When set, the next captured/picked photo attaches to this ALREADY-CREATED
  // item (a snag voice just added) instead of the "+ Add" draft flow.
  const [voicePhotoTargetId, setVoicePhotoTargetId] = useState<string | null>(null);

  const promptForSnagPhoto = (snagId: string) => {
    setVoicePhotoTargetId(snagId);
    Alert.alert('Add a photo?', 'Take a photo or choose one from your library for this snag.', [
      { text: 'Take Photo', onPress: () => openCamera() },
      { text: 'Choose from Library', onPress: () => pickFromLibrary() },
      { text: 'Skip', style: 'cancel', onPress: () => setVoicePhotoTargetId(null) },
    ]);
  };

  useVoiceAction('snagPhotoPrompt', ({ snagId }) => promptForSnagPhoto(snagId));

  // Voice can create a snag from any screen, not just this one — when this
  // screen wasn't already mounted to catch the live voice-bus event, the
  // caller navigates here instead with the new snag's id, so offer the same
  // photo prompt once on arrival.
  const promptedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (promptPhotoFor && promptedForRef.current !== promptPhotoFor) {
      promptedForRef.current = promptPhotoFor;
      promptForSnagPhoto(promptPhotoFor);
    }
  }, [promptPhotoFor]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [projects, snagItems, locs] = await Promise.all([
      loadProjects(),
      snagItemsForProject(projectId),
      loadLocations(projectId),
    ]);
    setProjectName(projects.find((p) => p.id === projectId)?.name ?? '');
    setItems(snagItems);
    setLocations(locs);
    setLoading(false);
  }, [projectId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const resetAddState = () => {
    setDraft('');
    setDraftLocationId(undefined);
    setDraftPhotoUri(undefined);
    setAdding(false);
  };

  const commitAdd = async () => {
    const desc = draft.trim();
    if (!desc || !projectId) { resetAddState(); return; }
    setSaving(true);
    try {
      const item = await createSnagItem(projectId, desc, draftLocationId);
      if (draftPhotoUri) {
        const filePath = await importSnagPhoto(draftPhotoUri, mediaPaths, projectId, item.id);
        await updateSnagItemPhoto(item.id, filePath);
      }
      resetAddState();
      reload();
    } catch (e) {
      Alert.alert('Could not save', String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: SnagItem) => {
    swipeRefs.current.get(item.id)?.close();
    await toggleSnagItem(item.id);
    reload();
  };

  const confirmDelete = (item: SnagItem) => {
    Alert.alert('Delete item?', `"${item.description}" will be removed.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => swipeRefs.current.get(item.id)?.close() },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSnagItem(item.id);
          if (item.photoPath) await deleteSnagPhoto(item.photoPath);
          reload();
        },
      },
    ]);
  };

  // ── Location picker ───────────────────────────────────────────────────────

  const floors = locations.filter((l) => l.parentId == null);
  const roomsOf = (floorId: string) => locations.filter((l) => l.parentId === floorId);
  const locationLabel = (locationId?: string) => {
    if (!locationId) return null;
    const loc = locations.find((l) => l.id === locationId);
    if (!loc) return null;
    if (loc.parentId == null) return loc.name;
    const floor = locations.find((l) => l.id === loc.parentId);
    return floor ? `${loc.name} · ${floor.name}` : loc.name;
  };

  // ── Photo capture ─────────────────────────────────────────────────────────

  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos.');
        return;
      }
    }
    setCameraState('live');
    setCapturedUri(null);
    setCameraOpen(true);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (result?.uri) {
        setCapturedUri(result.uri);
        setCameraState('preview');
      }
    } catch {
      Alert.alert('Capture failed', 'Could not take the photo. Please try again.');
    }
  };

  const attachPhotoToVoiceSnag = async (uri: string, snagId: string) => {
    const filePath = await importSnagPhoto(uri, mediaPaths, projectId, snagId);
    await updateSnagItemPhoto(snagId, filePath);
    setVoicePhotoTargetId(null);
    reload();
  };

  const confirmPhoto = () => {
    if (!capturedUri) return;
    if (voicePhotoTargetId) {
      attachPhotoToVoiceSnag(capturedUri, voicePhotoTargetId).catch((e) => Alert.alert('Could not save photo', String(e)));
    } else {
      setDraftPhotoUri(capturedUri);
    }
    setCameraOpen(false);
    setCapturedUri(null);
  };

  const retake = () => {
    setCapturedUri(null);
    setCameraState('live');
  };

  const pickFromLibrary = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets.length) return;
    const uri = result.assets[0]!.uri;
    if (voicePhotoTargetId) {
      attachPhotoToVoiceSnag(uri, voicePhotoTargetId).catch((e) => Alert.alert('Could not save photo', String(e)));
    } else {
      setDraftPhotoUri(uri);
    }
  };

  const open = items.filter((i) => !i.resolved);
  const done = items.filter((i) => i.resolved);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ActivityIndicator color={ACCENT} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <Text style={styles.title}>Snag List</Text>
          {projectName ? <Text style={styles.sub}>{projectName}</Text> : null}
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => { setAdding(true); setDraft(''); setDraftLocationId(undefined); setDraftPhotoUri(undefined); }}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={[...open, ...done]}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !adding ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No snag items</Text>
              <Text style={styles.emptyText}>Tap "+ Add" to log something that needs fixing before the job is signed off.</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          adding ? (
            <View style={styles.addCard}>
              <TextInput
                style={styles.addInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Describe the issue…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitAdd}
              />

              <Pressable style={styles.locationBtn} onPress={() => setLocationPickerOpen(true)}>
                <Text style={styles.locationBtnText}>
                  {locationLabel(draftLocationId) ?? 'Choose floor / room (optional)'}
                </Text>
              </Pressable>

              {draftPhotoUri ? (
                <View style={styles.draftPhotoRow}>
                  <Image source={{ uri: draftPhotoUri }} style={styles.draftPhotoThumb} contentFit="cover" />
                  <Pressable onPress={() => setDraftPhotoUri(undefined)} hitSlop={8}>
                    <Text style={styles.draftPhotoRemove}>Remove photo</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.photoBtnRow}>
                  <Pressable style={styles.photoBtn} onPress={openCamera}>
                    <Text style={styles.photoBtnText}>Take photo</Text>
                  </Pressable>
                  <Pressable style={styles.photoBtnSecondary} onPress={pickFromLibrary}>
                    <Text style={styles.photoBtnSecondaryText}>Choose from library</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.addRow}>
                <Pressable onPress={resetAddState} hitSlop={8}>
                  <Text style={styles.addCancel}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.addConfirm} onPress={commitAdd} disabled={saving}>
                  <Text style={styles.addConfirmText}>{saving ? 'Saving…' : 'Add'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
        ListFooterComponent={
          done.length > 0 ? (
            <Text style={styles.doneLabel}>{done.length} resolved</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Swipeable
            ref={(ref) => {
              if (ref) swipeRefs.current.set(item.id, ref);
              else swipeRefs.current.delete(item.id);
            }}
            onSwipeableWillOpen={() => {
              swipeRefs.current.forEach((r, id) => { if (id !== item.id) r?.close(); });
            }}
            renderRightActions={() => (
              <Pressable style={styles.deleteAction} onPress={() => confirmDelete(item)}>
                <Text style={styles.deleteActionText}>Delete</Text>
              </Pressable>
            )}
          >
            <Pressable style={[styles.row, item.resolved && styles.rowDone]} onPress={() => toggle(item)}>
              <View style={[styles.checkbox, item.resolved && styles.checkboxDone]}>
                {item.resolved && <Text style={styles.checkmark}>✓</Text>}
              </View>
              {item.photoPath && (
                <Pressable onPress={() => setLightboxUri(item.photoPath!)} hitSlop={4}>
                  <Image source={{ uri: item.photoPath }} style={styles.rowThumb} contentFit="cover" />
                </Pressable>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.desc, item.resolved && styles.descDone]} numberOfLines={2}>
                  {item.description}
                </Text>
                {locationLabel(item.locationId) && (
                  <Text style={styles.rowLocation}>{locationLabel(item.locationId)}</Text>
                )}
              </View>
            </Pressable>
          </Swipeable>
        )}
      />

      {/* Location picker */}
      <Modal visible={locationPickerOpen} transparent animationType="fade" onRequestClose={() => setLocationPickerOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setLocationPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Which floor / room?</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Pressable
                style={styles.sheetRow}
                onPress={() => { setDraftLocationId(undefined); setLocationPickerOpen(false); }}
              >
                <Text style={styles.sheetRowText}>No specific location</Text>
              </Pressable>
              {floors.map((floor) => (
                <View key={floor.id}>
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => { setDraftLocationId(floor.id); setLocationPickerOpen(false); }}
                  >
                    <Text style={styles.sheetRowTextBold}>{floor.name}</Text>
                  </Pressable>
                  {roomsOf(floor.id).map((room) => (
                    <Pressable
                      key={room.id}
                      style={[styles.sheetRow, styles.sheetRowIndent]}
                      onPress={() => { setDraftLocationId(room.id); setLocationPickerOpen(false); }}
                    >
                      <Text style={styles.sheetRowText}>{room.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              {floors.length === 0 && (
                <Text style={styles.emptyHintSmall}>No floors/rooms yet in this project.</Text>
              )}
            </ScrollView>
            <Pressable onPress={() => setLocationPickerOpen(false)} style={styles.sheetCancel}>
              <Text style={styles.sheetCancelText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo lightbox */}
      <Modal visible={lightboxUri != null} animationType="fade" statusBarTranslucent onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightboxUri(null)}>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} contentFit="contain" />
          )}
        </Pressable>
      </Modal>

      {/* Camera modal */}
      <Modal visible={cameraOpen} animationType="slide" statusBarTranslucent onRequestClose={() => setCameraOpen(false)}>
        <View style={styles.cameraScreen}>
          {cameraOpen && cameraState === 'live' && (
            <>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
              <SafeAreaView style={styles.cameraControls} edges={['bottom']}>
                <Pressable onPress={() => setCameraOpen(false)} hitSlop={12}>
                  <Text style={styles.camCancel}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.shutter} onPress={takePhoto}>
                  <View style={styles.shutterInner} />
                </Pressable>
                <View style={{ width: 60 }} />
              </SafeAreaView>
            </>
          )}

          {cameraState === 'preview' && capturedUri && (
            <>
              <Image source={{ uri: capturedUri }} style={styles.camera} contentFit="cover" />
              <SafeAreaView style={styles.cameraControls} edges={['bottom']}>
                <Pressable onPress={retake} hitSlop={12}>
                  <Text style={styles.camCancel}>Retake</Text>
                </Pressable>
                <Pressable style={styles.useBtn} onPress={confirmPhoto}>
                  <Text style={styles.useBtnText}>Use Photo</Text>
                </Pressable>
                <View style={{ width: 60 }} />
              </SafeAreaView>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  addBtn: {
    backgroundColor: ACCENT, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },

  list: { padding: space.lg, paddingBottom: space.xxl },

  addCard: {
    backgroundColor: colors.surface, borderRadius: radius.tile,
    borderWidth: 1, borderColor: ACCENT, padding: space.md,
    marginBottom: space.md, gap: space.sm,
  },
  addRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  addCancel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  addInput: {
    backgroundColor: colors.ground, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
    color: colors.textPrimary, fontSize: 15,
  },
  addConfirm: {
    backgroundColor: ACCENT, borderRadius: radius.tile,
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  addConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },

  locationBtn: {
    backgroundColor: colors.ground, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  locationBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },

  photoBtnRow: { flexDirection: 'row', gap: space.sm },
  photoBtn: { backgroundColor: colors.ground, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  photoBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  photoBtnSecondary: { backgroundColor: colors.ground, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  photoBtnSecondaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },

  draftPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  draftPhotoThumb: { width: 48, height: 48, borderRadius: radius.tile / 2 },
  draftPhotoRemove: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile,
    padding: space.lg, marginBottom: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  rowDone: { opacity: 0.5 },
  rowThumb: { width: 40, height: 40, borderRadius: radius.tile / 2 },
  rowLocation: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkmark: { color: colors.accentInk, fontSize: 14, fontWeight: '900' },

  desc: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  descDone: { textDecorationLine: 'line-through', color: colors.textMuted },

  doneLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1, textAlign: 'center', marginTop: space.lg,
  },

  deleteAction: {
    backgroundColor: colors.danger, justifyContent: 'center',
    alignItems: 'center', width: 80, borderRadius: radius.tile,
    marginBottom: space.sm,
  },
  deleteActionText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  empty: { alignItems: 'center', marginTop: space.xxl * 2, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { color: colors.textSecondary, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  emptyHintSmall: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: space.md },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    padding: space.xl, paddingBottom: space.xxl,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: space.md },
  sheetRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  sheetRowIndent: { paddingLeft: space.lg },
  sheetRowText: { color: colors.textSecondary, fontSize: 15, fontWeight: '500' },
  sheetRowTextBold: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  sheetCancel: { alignItems: 'center', paddingTop: space.md },
  sheetCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },

  lightbox: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  lightboxImage: { width: '100%', height: '100%' },

  cameraScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingVertical: space.xl, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  camCancel: { color: '#fff', fontSize: 16, fontWeight: '600', width: 60 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  useBtn: { backgroundColor: ACCENT, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.md },
  useBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
