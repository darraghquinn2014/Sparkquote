import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, ScrollView, Share,
} from 'react-native';
import RNShare from 'react-native-share';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import {
  snagItemsForProject, createSnagItem, setSnagResolved, updateSnagResolutionNote,
  updateSnagResolvedPhoto, deleteSnagItem, updateSnagItemPhoto,
} from '@/src/data/snag-repo';
import { loadProjects, loadLocations } from '@/src/data/project-repo';
import { importSnagPhoto, deleteSnagPhoto } from '@/src/media/snag-photo-service';
import { useCameraOrientation } from '@/src/media/useCameraOrientation';
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
  useCameraOrientation(cameraOpen);

  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const [noteModalItem, setNoteModalItem] = useState<SnagItem | null>(null);
  const [noteModalIsNewResolve, setNoteModalIsNewResolve] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [resolvePhotoUri, setResolvePhotoUri] = useState<string | undefined>(undefined);
  const [resolvePhotoIsNew, setResolvePhotoIsNew] = useState(false);
  const [resolvePhotoRemoved, setResolvePhotoRemoved] = useState(false);

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
    if (!item.resolved) {
      setNoteModalIsNewResolve(true);
      setNoteDraft('');
      setResolvePhotoUri(undefined);
      setResolvePhotoIsNew(false);
      setResolvePhotoRemoved(false);
      setNoteModalItem(item);
      return;
    }
    await setSnagResolved(item.id, false);
    reload();
  };

  const openEditNote = (item: SnagItem) => {
    setNoteModalIsNewResolve(false);
    setNoteDraft(item.resolutionNote ?? '');
    setResolvePhotoUri(item.resolvedPhotoPath);
    setResolvePhotoIsNew(false);
    setResolvePhotoRemoved(false);
    setNoteModalItem(item);
  };

  const closeNoteModal = () => {
    setNoteModalItem(null);
    setNoteDraft('');
    setResolvePhotoUri(undefined);
    setResolvePhotoIsNew(false);
    setResolvePhotoRemoved(false);
  };

  const removeResolvePhoto = () => {
    setResolvePhotoUri(undefined);
    setResolvePhotoIsNew(false);
    setResolvePhotoRemoved(true);
  };

  const saveNote = async () => {
    if (!noteModalItem) return;
    let resolvedPhotoPath = noteModalItem.resolvedPhotoPath;
    try {
      if (resolvePhotoIsNew && resolvePhotoUri) {
        const filePath = await importSnagPhoto(resolvePhotoUri, mediaPaths, projectId, `${noteModalItem.id}-after`);
        if (noteModalItem.resolvedPhotoPath) await deleteSnagPhoto(noteModalItem.resolvedPhotoPath);
        resolvedPhotoPath = filePath;
      } else if (resolvePhotoRemoved && noteModalItem.resolvedPhotoPath) {
        await deleteSnagPhoto(noteModalItem.resolvedPhotoPath);
        resolvedPhotoPath = undefined;
      }
      if (noteModalIsNewResolve) {
        await setSnagResolved(noteModalItem.id, true, noteDraft);
      } else {
        await updateSnagResolutionNote(noteModalItem.id, noteDraft);
      }
      if (resolvedPhotoPath !== noteModalItem.resolvedPhotoPath) {
        await updateSnagResolvedPhoto(noteModalItem.id, resolvedPhotoPath);
      }
      closeNoteModal();
      reload();
    } catch (e) {
      Alert.alert('Could not save', String(e));
    }
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
          if (item.resolvedPhotoPath) await deleteSnagPhoto(item.resolvedPhotoPath);
          reload();
        },
      },
    ]);
  };

  const shareSnag = async (item: SnagItem) => {
    const loc = locationLabel(item.locationId);
    const hasBoth = !!item.photoPath && !!item.resolvedPhotoPath;
    const message = `${item.description}${loc ? ` (${loc})` : ''} — resolved`
      + (item.resolutionNote ? `\nNote: ${item.resolutionNote}` : '')
      + (hasBoth ? '\n(Before & after photos attached)' : '');
    try {
      const photos = [item.photoPath, item.resolvedPhotoPath].filter((p): p is string => !!p);
      if (photos.length > 0) {
        // react-native-share's Android FileProvider only exposes the cache
        // dir by default, not app-private "files" storage where snag photos
        // live — sharing the raw path fails silently (logcat: "Failed to
        // find configured root"). Copy into cache first.
        const cachePaths = await Promise.all(photos.map(async (p, i) => {
          const cachePath = `${mediaPaths.cacheDir}share-snag-${item.id}-${i}.jpg`;
          await FileSystem.copyAsync({ from: p, to: cachePath });
          return cachePath;
        }));
        // Some mail apps (Gmail) are more reliable attaching a single file
        // via `url` than a one-item `urls` array — only use `urls` when
        // there's genuinely more than one photo to attach.
        if (cachePaths.length === 1) {
          await RNShare.open({ url: cachePaths[0], type: 'image/jpeg', message, failOnCancel: false });
        } else {
          await RNShare.open({ urls: cachePaths, type: 'image/jpeg', message, failOnCancel: false });
        }
        return;
      }
      await Share.share({ message });
    } catch (e) {
      Alert.alert('Could not share', String(e));
    }
  };

  const shareAll = async () => {
    const lines = items.map((i) => {
      const loc = locationLabel(i.locationId);
      const note = i.resolved && i.resolutionNote ? ` — ${i.resolutionNote}` : '';
      return `${i.resolved ? '[x]' : '[ ]'} ${i.description}${loc ? ` — ${loc}` : ''}${note}`;
    });
    const message = `Snag list — ${projectName}\n\n${lines.join('\n')}`;
    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert('Could not share', String(e));
    }
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
    } else if (noteModalItem) {
      setResolvePhotoUri(capturedUri);
      setResolvePhotoIsNew(true);
      setResolvePhotoRemoved(false);
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
    } else if (noteModalItem) {
      setResolvePhotoUri(uri);
      setResolvePhotoIsNew(true);
      setResolvePhotoRemoved(false);
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
        <Pressable
          style={styles.addBtn}
          onPress={() => { setAdding(true); setDraft(''); setDraftLocationId(undefined); setDraftPhotoUri(undefined); }}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
        <View style={styles.headerTitleOverlay} pointerEvents="none">
          <Text style={styles.title}>Snag List</Text>
          {projectName ? <Text style={styles.sub}>{projectName}</Text> : null}
        </View>
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
            <View style={styles.footerRow}>
              <Text style={styles.doneLabel}>{done.length} resolved</Text>
              <Pressable onPress={shareAll} hitSlop={8}>
                <Text style={styles.shareAllLink}>Share all</Text>
              </Pressable>
            </View>
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
            <View style={[styles.row, item.resolved && styles.rowDone]}>
              <Pressable onPress={() => toggle(item)} hitSlop={10}>
                <View style={[styles.checkbox, item.resolved && styles.checkboxDone]}>
                  {item.resolved && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </Pressable>
              {(item.photoPath || item.resolvedPhotoPath) && (
                <View style={styles.thumbPair}>
                  {item.photoPath && (
                    <Pressable onPress={() => setLightboxUri(item.photoPath!)} hitSlop={4}>
                      <Image source={{ uri: item.photoPath }} style={styles.rowThumb} contentFit="cover" />
                    </Pressable>
                  )}
                  {item.resolvedPhotoPath && (
                    <Pressable onPress={() => setLightboxUri(item.resolvedPhotoPath!)} hitSlop={4}>
                      <Image source={{ uri: item.resolvedPhotoPath }} style={styles.rowThumb} contentFit="cover" />
                    </Pressable>
                  )}
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.desc, item.resolved && styles.descDone]} numberOfLines={2}>
                  {item.description}
                </Text>
                {locationLabel(item.locationId) && (
                  <Text style={styles.rowLocation}>{locationLabel(item.locationId)}</Text>
                )}
                {item.resolved && item.resolutionNote && (
                  <Text style={styles.resolutionNote} numberOfLines={3}>{item.resolutionNote}</Text>
                )}
              </View>
              {item.resolved && (
                <View style={styles.resolvedLinks}>
                  <Pressable onPress={() => shareSnag(item)} hitSlop={8}>
                    <Text style={styles.shareLink}>Share</Text>
                  </Pressable>
                  <Pressable onPress={() => openEditNote(item)} hitSlop={8}>
                    <Text style={styles.noteLink}>{item.resolutionNote ? 'Edit note' : '+ Note'}</Text>
                  </Pressable>
                </View>
              )}
              <Text style={styles.swipeHint}>‹</Text>
            </View>
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

      {/* Resolution note — anchored near the top of the screen (not a bottom
          sheet) so it stays clear of the keyboard regardless of platform
          resize quirks, same fix as MaterialPicker's floating panel. */}
      <Modal visible={noteModalItem != null} transparent animationType="fade" onRequestClose={closeNoteModal}>
        <Pressable style={styles.noteOverlay} onPress={closeNoteModal}>
          <Pressable style={styles.noteCard} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{noteModalIsNewResolve ? 'Mark resolved' : 'Resolution note'}</Text>
            {noteModalItem && (
              <Text style={styles.noteItemDesc} numberOfLines={2}>{noteModalItem.description}</Text>
            )}
            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="How was this fixed? (optional)"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />

            <Text style={styles.fieldLabel}>After photo (optional)</Text>
            {resolvePhotoUri ? (
              <View style={styles.draftPhotoRow}>
                <Image source={{ uri: resolvePhotoUri }} style={styles.draftPhotoThumb} contentFit="cover" />
                <Pressable onPress={removeResolvePhoto} hitSlop={8}>
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

            <View style={[styles.addRow, { marginTop: space.md }]}>
              <Pressable onPress={closeNoteModal} hitSlop={8}>
                <Text style={styles.addCancel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.addConfirm} onPress={saveNote}>
                <Text style={styles.addConfirmText}>{noteModalIsNewResolve ? 'Mark resolved' : 'Save'}</Text>
              </Pressable>
            </View>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  headerTitleOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 1, textAlign: 'center' },
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
  addCancel: { color: colors.danger, fontSize: 14, fontWeight: '600' },
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

  noteInput: {
    backgroundColor: colors.ground, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
    color: colors.textPrimary, fontSize: 15, minHeight: 80, textAlignVertical: 'top',
    marginBottom: space.md,
  },

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
  thumbPair: { flexDirection: 'row', gap: 4 },
  rowThumb: { width: 40, height: 40, borderRadius: radius.tile / 2 },
  rowLocation: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  resolutionNote: { color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 4 },

  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkmark: { color: colors.accentInk, fontSize: 14, fontWeight: '900' },

  desc: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  descDone: { textDecorationLine: 'line-through', color: colors.textMuted },

  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space.md, marginTop: space.lg,
  },
  doneLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1,
  },
  shareAllLink: { fontSize: 12, fontWeight: '700', color: ACCENT },
  resolvedLinks: { alignItems: 'flex-end', gap: 4 },
  shareLink: { color: ACCENT, fontSize: 13, fontWeight: '700' },
  noteLink: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  swipeHint: { color: colors.textMuted, fontSize: 16, fontWeight: '600', opacity: 0.5 },

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
  noteOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', paddingTop: space.xxl * 2, paddingHorizontal: space.lg,
  },
  noteCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.bar, padding: space.xl },
  noteItemDesc: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: space.md },
  fieldLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: space.xs,
  },
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
