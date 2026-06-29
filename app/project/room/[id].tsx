/**
 * Room detail screen — reference photos for a single room.
 * Photos are internal-only; they never appear in the client PDF.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Modal, Dimensions, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import type { Location } from '@/src/domain/types';
import type { Photo } from '@/src/media/media-types';
import { loadLocation } from '@/src/data/project-repo';
import { photosForLocation, addLocationPhoto, deleteLocationPhoto, updatePhotoCaption } from '@/src/data/photo-repo';
import { saveCapture, deletePhoto } from '@/src/media/camera-service';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const COLS = 3;
const SCREEN_W = Dimensions.get('window').width;
const THUMB = (SCREEN_W - space.lg * 2 - space.xs * (COLS - 1)) / COLS;

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type CameraState = 'live' | 'preview';

export default function RoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [location, setLocation] = useState<Location | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('live');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  const [captionModalOpen, setCaptionModalOpen] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [noteText, setNoteText] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    const loc = await loadLocation(id);
    setLocation(loc);
    setPhotos(await photosForLocation(id));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

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

  const confirmPhoto = async () => {
    if (!capturedUri || !location) return;
    setSaving(true);
    try {
      const photo = await saveCapture({
        sourceUri: capturedUri,
        paths: mediaPaths,
        projectId: location.projectId,
        locationId: location.id,
        quality: 'medium',
      });
      await addLocationPhoto(
        location.projectId,
        location.id,
        photo.filePath,
        photo.quality,
        photo.capturedAt,
      );
      await reload();
    } catch {
      Alert.alert('Save failed', 'Could not save the photo. Please try again.');
    } finally {
      setSaving(false);
      setCameraOpen(false);
      setCapturedUri(null);
    }
  };

  const retake = () => {
    setCapturedUri(null);
    setCameraState('live');
  };

  const openCaptionEdit = () => {
    if (!lightboxPhoto) return;
    setCaptionText(lightboxPhoto.caption ?? '');
    setNoteText(lightboxPhoto.note ?? '');
    setCaptionModalOpen(true);
  };

  const saveCaptionEdit = async () => {
    if (!lightboxPhoto) return;
    const trimCaption = captionText.trim();
    const trimNote = noteText.trim();
    await updatePhotoCaption(lightboxPhoto.id, trimCaption, trimNote);
    setCaptionModalOpen(false);
    setLightboxPhoto(prev =>
      prev ? { ...prev, caption: trimCaption || undefined, note: trimNote || undefined } : null,
    );
    reload();
  };

  const confirmDelete = (photo: Photo) => {
    Alert.alert(
      'Delete photo?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLocationPhoto(photo.id);
            await deletePhoto(photo);
            reload();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        </View>
        <Text style={styles.empty}>Room not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={openCamera} hitSlop={8}>
          <Text style={styles.addBtnText}>+ Add photo</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.roomName}>{location.name}</Text>
        <Text style={styles.subtitle}>Reference photos</Text>

        {photos.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>[  ]</Text>
            <Text style={styles.emptyText}>No photos yet.</Text>
            <Text style={styles.emptyHint}>Tap "+ Add photo" to capture the room.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {photos.map((photo) => (
              <Pressable
                key={photo.id}
                style={styles.thumb}
                onPress={() => setLightboxPhoto(photo)}
                onLongPress={() => confirmDelete(photo)}
                delayLongPress={400}
              >
                <Image
                  source={{ uri: photo.filePath }}
                  style={styles.thumbImage}
                  contentFit="cover"
                  transition={150}
                />
                {photo.caption ? (
                  <View style={styles.thumbCaption}>
                    <Text style={styles.thumbCaptionText} numberOfLines={1}>{photo.caption}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {photos.length > 0 && (
          <Text style={styles.hint}>Tap to view / name  ·  Hold to delete</Text>
        )}
      </ScrollView>

      {/* Lightbox */}
      <Modal
        visible={lightboxPhoto != null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLightboxPhoto(null)}
      >
        <Pressable style={styles.lightbox} onPress={() => setLightboxPhoto(null)}>
          {lightboxPhoto && (
            <Image
              source={{ uri: lightboxPhoto.filePath }}
              style={styles.lightboxImage}
              contentFit="contain"
            />
          )}
          <SafeAreaView style={styles.lightboxClose} edges={['top']}>
            <Pressable onPress={() => setLightboxPhoto(null)} hitSlop={16}>
              <Text style={styles.lightboxCloseText}>✕</Text>
            </Pressable>
          </SafeAreaView>
          {lightboxPhoto && (
            <Pressable style={styles.lightboxInfoBar} onPress={() => {}}>
              <SafeAreaView edges={['bottom']}>
                <View style={styles.lightboxInfoContent}>
                  <View style={{ flex: 1 }}>
                    {lightboxPhoto.caption ? (
                      <Text style={styles.lightboxCaption}>{lightboxPhoto.caption}</Text>
                    ) : (
                      <Text style={styles.lightboxCaptionEmpty}>No name — tap Edit to add one</Text>
                    )}
                    {lightboxPhoto.note ? (
                      <Text style={styles.lightboxNote}>{lightboxPhoto.note}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={openCaptionEdit} hitSlop={8}>
                    <Text style={styles.lightboxEditBtn}>Edit</Text>
                  </Pressable>
                </View>
              </SafeAreaView>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      {/* Caption / note edit sheet */}
      <Modal
        visible={captionModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCaptionModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.captionOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.captionBackdrop} onPress={() => setCaptionModalOpen(false)} />
          <View style={styles.captionSheet}>
            <Text style={styles.captionSheetTitle}>Photo details</Text>
            <Text style={styles.captionLabel}>Name</Text>
            <TextInput
              style={styles.captionInput}
              value={captionText}
              onChangeText={setCaptionText}
              placeholder="e.g. Consumer unit, North wall socket..."
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="next"
              maxLength={80}
            />
            <Text style={styles.captionLabel}>Note</Text>
            <TextInput
              style={[styles.captionInput, styles.captionNoteInput]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Any extra details..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              maxLength={300}
            />
            <View style={styles.captionBtns}>
              <Pressable onPress={() => setCaptionModalOpen(false)} hitSlop={8}>
                <Text style={styles.captionCancel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.captionSaveBtn} onPress={saveCaptionEdit}>
                <Text style={styles.captionSaveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Camera modal */}
      <Modal
        visible={cameraOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCameraOpen(false)}
      >
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
              <Image
                source={{ uri: capturedUri }}
                style={styles.camera}
                contentFit="cover"
              />
              <SafeAreaView style={styles.cameraControls} edges={['bottom']}>
                <Pressable onPress={retake} hitSlop={12}>
                  <Text style={styles.camCancel}>Retake</Text>
                </Pressable>
                {saving ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Pressable style={styles.useBtn} onPress={confirmPhoto}>
                    <Text style={styles.useBtnText}>Use Photo</Text>
                  </Pressable>
                )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  roomName: { color: colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 2 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: space.xl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: { width: '100%', height: '100%' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: space.lg },
  emptyState: { alignItems: 'center', marginTop: space.xxl * 2 },
  emptyIcon: { color: colors.hairline, fontSize: 48, marginBottom: space.lg },
  emptyText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', marginBottom: space.xs },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },

  thumbCaption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  thumbCaptionText: { color: '#fff', fontSize: 9, fontWeight: '600' },

  // Lightbox
  lightbox: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  lightboxImage: { width: '100%', height: '100%' },
  lightboxClose: { position: 'absolute', top: 0, right: 0, padding: space.lg },
  lightboxCloseText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  lightboxInfoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  lightboxInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  lightboxCaption: { color: '#fff', fontSize: 15, fontWeight: '700' },
  lightboxCaptionEmpty: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontStyle: 'italic' },
  lightboxNote: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  lightboxEditBtn: { color: colors.accent, fontSize: 14, fontWeight: '700' },

  // Caption edit sheet
  captionOverlay: { flex: 1, justifyContent: 'flex-end' },
  captionBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  captionSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.bar,
    borderTopRightRadius: radius.bar,
    padding: space.xl,
    paddingBottom: space.xxl,
  },
  captionSheetTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: space.lg,
  },
  captionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: space.xs },
  captionInput: {
    backgroundColor: colors.ground,
    color: colors.textPrimary,
    borderRadius: radius.tile,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
    marginBottom: space.md,
  },
  captionNoteInput: { height: 80, textAlignVertical: 'top', paddingTop: space.sm },
  captionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  captionCancel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  captionSaveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
  },
  captionSaveBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

  // Camera
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  camCancel: { color: '#fff', fontSize: 16, fontWeight: '600', width: 60 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  useBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  useBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
