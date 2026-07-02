/**
 * Wall detail — capture/view the wall's one reference photo, and see the
 * electrical symbols tagged for this wall (from the floor plan) rendered
 * automatically at the matching horizontal position on the photo. The
 * vertical position is photo-only (the plan is top-down) — drag a symbol
 * up/down to nudge it; tap (without dragging) to remove it.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import Svg from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import type { Location, Wall, WallSymbol } from '@/src/domain/types';
import type { Photo } from '@/src/media/media-types';
import { loadLocation } from '@/src/data/project-repo';
import { loadPhoto, addLocationPhoto, deleteLocationPhoto } from '@/src/data/photo-repo';
import { saveCapture, deletePhoto } from '@/src/media/camera-service';
import {
  loadWall, loadWallSymbols, renameWall, setWallPhoto, clearWallPhoto,
  updateWallSymbolPhotoY, deleteWallSymbol, deleteWall,
} from '@/src/data/floor-plan-repo';
import { symbolPhotoX } from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type CameraState = 'live' | 'preview';

function DraggableSymbol({
  symbol, x, baseY, containerHeight, onDragEnd, onTap,
}: {
  symbol: WallSymbol;
  x: number;
  baseY: number;
  containerHeight: number;
  onDragEnd: (photoY: number) => void;
  onTap: () => void;
}) {
  const dragOffset = useSharedValue(0);

  const handleDragEnd = (translationY: number) => {
    const clamped = Math.max(0, Math.min(containerHeight, baseY + translationY));
    onDragEnd(clamped / containerHeight);
  };

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => { dragOffset.value = e.translationY; })
    .onEnd((e) => {
      runOnJS(handleDragEnd)(e.translationY);
      dragOffset.value = 0;
    });

  const tapGesture = Gesture.Tap().onEnd(() => { runOnJS(onTap)(); });

  const gesture = Gesture.Exclusive(tapGesture, panGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOffset.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left: x - 20, top: baseY - 20, width: 40, height: 40 }, animStyle]}>
        <Svg width={40} height={40}>
          <PlacedSymbolGroup symbol={{ id: symbol.id, type: symbol.type, x: 20, y: 20, color: symbol.color ?? '#FFFFFF' }} />
        </Svg>
      </Animated.View>
    </GestureDetector>
  );
}

export default function WallScreen() {
  const router = useRouter();
  const { id: wallId } = useLocalSearchParams<{ id: string }>();

  const [wall, setWall] = useState<Wall | null>(null);
  const [room, setRoom] = useState<Location | null>(null);
  const [symbols, setSymbols] = useState<WallSymbol[]>([]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('live');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelText, setLabelText] = useState('');

  const reload = useCallback(async () => {
    if (!wallId) return;
    const w = await loadWall(wallId);
    setWall(w);
    const [r, syms] = await Promise.all([loadLocation(w.locationId), loadWallSymbols(w.id)]);
    setRoom(r);
    setSymbols(syms);
    setPhoto(w.photoId ? await loadPhoto(w.photoId) : null);
    setLoading(false);
  }, [wallId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // Contain-fit rendered rect of the photo within its container — symbol
  // pixel positions must use this, not the raw container size, or they'd
  // drift into the letterbox margin whenever the photo's aspect ratio
  // doesn't match the container's.
  const renderedRect = (() => {
    if (!naturalSize) return null;
    const scale = Math.min(containerSize.width / naturalSize.width, containerSize.height / naturalSize.height);
    const width = naturalSize.width * scale;
    const height = naturalSize.height * scale;
    return { width, height, offsetX: (containerSize.width - width) / 2, offsetY: (containerSize.height - height) / 2 };
  })();

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
    if (!capturedUri || !wall) return;
    setSaving(true);
    try {
      if (!room) return;
      const newPhoto = await saveCapture({
        sourceUri: capturedUri,
        paths: mediaPaths,
        projectId: room.projectId,
        locationId: wall.locationId,
        quality: 'medium',
      });
      await addLocationPhoto(room.projectId, wall.locationId, newPhoto.filePath, newPhoto.quality, newPhoto.capturedAt);
      await setWallPhoto(wall.id, newPhoto.id);
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

  const confirmRemovePhoto = () => {
    if (!wall || !photo) return;
    Alert.alert('Remove photo?', 'Tagged symbols for this wall are kept and will reappear once you attach a new photo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearWallPhoto(wall.id);
          await deleteLocationPhoto(photo.id);
          await deletePhoto(photo);
          await reload();
        },
      },
    ]);
  };

  const startEditLabel = () => {
    setLabelText(wall?.label ?? '');
    setEditingLabel(true);
  };

  const saveLabel = async () => {
    if (!wall) return;
    await renameWall(wall.id, labelText.trim());
    setEditingLabel(false);
    reload();
  };

  const confirmDeleteWall = () => {
    if (!wall) return;
    Alert.alert('Delete wall?', 'This wall, its tagged symbols, and its photo will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { deletedPhotoId } = await deleteWall(wall.id);
          if (deletedPhotoId) {
            const p = await loadPhoto(deletedPhotoId);
            await deleteLocationPhoto(deletedPhotoId);
            if (p) await deletePhoto(p);
          }
          router.back();
        },
      },
    ]);
  };

  const openOverflow = () => {
    Alert.alert(wall?.label || 'Wall', undefined, [
      { text: 'Rename', onPress: startEditLabel },
      ...(photo ? [{ text: 'Retake photo', onPress: openCamera }, { text: 'Remove photo', style: 'destructive' as const, onPress: confirmRemovePhoto }] : []),
      { text: 'Delete wall', style: 'destructive', onPress: confirmDeleteWall },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmRemoveSymbol = (symbol: WallSymbol) => {
    Alert.alert('Remove symbol?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteWallSymbol(symbol.id); reload(); } },
    ]);
  };

  const handleSymbolDragEnd = async (symbol: WallSymbol, photoY: number) => {
    setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? { ...s, photoY } : s)));
    await updateWallSymbolPhotoY(symbol.id, photoY);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  if (!wall) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        </View>
        <Text style={styles.empty}>Wall not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title} numberOfLines={1}>{wall.label || 'Wall'}</Text>
            {room && <Text style={styles.subtitle}>{room.name}</Text>}
          </View>
          <Pressable onPress={openOverflow} hitSlop={12}>
            <Text style={styles.moreBtn}>•••</Text>
          </Pressable>
        </View>

        {!photo ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No photo yet.</Text>
            <Text style={styles.emptyHint}>
              {symbols.length > 0
                ? `${symbols.length} symbol${symbols.length === 1 ? '' : 's'} tagged on the plan — attach a photo to see them placed.`
                : "Attach a reference photo of this wall."}
            </Text>
            <Pressable style={styles.addBtn} onPress={openCamera}>
              <Text style={styles.addBtnText}>+ Take photo</Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={styles.photoWrap}
            onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <Image
              source={{ uri: photo.filePath }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              onLoad={(e) => setNaturalSize({ width: e.source.width, height: e.source.height })}
            />
            {renderedRect && symbols.map((symbol) => {
              const x = renderedRect.offsetX + symbolPhotoX(symbol.positionAlongWall, renderedRect.width);
              const y = renderedRect.offsetY + symbol.photoY * renderedRect.height;
              return (
                <DraggableSymbol
                  key={symbol.id}
                  symbol={symbol}
                  x={x}
                  baseY={y}
                  containerHeight={containerSize.height}
                  onDragEnd={(photoY) => handleSymbolDragEnd(symbol, photoY)}
                  onTap={() => confirmRemoveSymbol(symbol)}
                />
              );
            })}
          </View>
        )}

        {photo && <Text style={styles.hint}>Drag a symbol to adjust height · Tap to remove</Text>}
      </SafeAreaView>

      {/* Rename sheet */}
      <Modal visible={editingLabel} transparent animationType="fade" onRequestClose={() => setEditingLabel(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setEditingLabel(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Wall name</Text>
            <TextInput
              value={labelText}
              onChangeText={setLabelText}
              style={styles.sheetInput}
              autoFocus
              onSubmitEditing={saveLabel}
              placeholder="e.g. North wall"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable style={styles.sheetConfirm} onPress={saveLabel}>
              <Text style={styles.sheetConfirmText}>Save</Text>
            </Pressable>
          </Pressable>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 60 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  moreBtn: { color: colors.textSecondary, fontSize: 20, fontWeight: '700', letterSpacing: 2, width: 60, textAlign: 'right' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  emptyText: { color: colors.textSecondary, fontSize: 17, fontWeight: '700', marginBottom: space.xs },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: space.xl, lineHeight: 19 },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.md },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

  photoWrap: { flex: 1, position: 'relative', backgroundColor: '#000' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: space.md },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    padding: space.xl, paddingBottom: space.xxl,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: space.md },
  sheetInput: {
    backgroundColor: colors.ground, color: colors.textPrimary, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.sm, fontSize: 15,
  },
  sheetConfirm: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingVertical: space.md, alignItems: 'center', marginTop: space.md },
  sheetConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

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
  useBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.md },
  useBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
