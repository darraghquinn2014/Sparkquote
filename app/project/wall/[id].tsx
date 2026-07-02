/**
 * Wall detail — attach the wall's one reference photo (camera or library),
 * and place electrical symbols directly on that photo to jog your memory of
 * what's on this wall/ceiling. Tagged symbols persist as WallSymbol rows
 * (positionAlongWall/photoY, both normalized 0-1 within the photo); drag one
 * up/down to nudge its height, tap (without dragging) to remove it.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Modal, TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import Svg from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import type { Location, Wall, WallSymbol } from '@/src/domain/types';
import type { Photo } from '@/src/media/media-types';
import type { SymbolType } from '@/src/media/annotation-service';
import { loadLocation } from '@/src/data/project-repo';
import { loadPhoto, addLocationPhoto, deleteLocationPhoto } from '@/src/data/photo-repo';
import { saveCapture, deletePhoto } from '@/src/media/camera-service';
import {
  loadWall, loadWallSymbols, renameWall, setWallPhoto, clearWallPhoto,
  addWallSymbol, updateWallSymbolPhotoY, deleteWallSymbol, deleteWall,
} from '@/src/data/floor-plan-repo';
import { symbolPhotoX } from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup, SYMBOL_TYPES, SYMBOL_LABELS, SYMBOL_TYPE_COLORS } from '@/src/ui/annotations/symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type CameraState = 'live' | 'preview';

function DraggableSymbol({
  symbol, x, baseY, containerHeight, enabled, onDragEnd, onTap,
}: {
  symbol: WallSymbol;
  x: number;
  baseY: number;
  containerHeight: number;
  enabled: boolean;
  onDragEnd: (photoY: number) => void;
  onTap: () => void;
}) {
  const dragOffset = useSharedValue(0);

  const handleDragEnd = (translationY: number) => {
    const clamped = Math.max(0, Math.min(containerHeight, baseY + translationY));
    onDragEnd(clamped / containerHeight);
  };

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .minDistance(10)
    .onUpdate((e) => { dragOffset.value = e.translationY; })
    .onEnd((e) => {
      runOnJS(handleDragEnd)(e.translationY);
      dragOffset.value = 0;
    });

  const tapGesture = Gesture.Tap().enabled(enabled).onEnd(() => { runOnJS(onTap)(); });

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

  const [addingSymbol, setAddingSymbol] = useState(false);
  const [pendingTap, setPendingTap] = useState<{ x: number; y: number } | null>(null);
  const [selectedSymbolType, setSelectedSymbolType] = useState<SymbolType>('socket');

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

  const attachPhoto = async (sourceUri: string) => {
    if (!wall || !room) return;
    const newPhoto = await saveCapture({
      sourceUri,
      paths: mediaPaths,
      projectId: room.projectId,
      locationId: wall.locationId,
      quality: 'medium',
    });
    // addLocationPhoto's return value is the REAL WatermelonDB row id — newPhoto.id
    // is only a client-side placeholder saveCapture used to build the file path
    // before the row existed, and does not match any row in the photos table.
    const photoId = await addLocationPhoto(room.projectId, wall.locationId, newPhoto.filePath, newPhoto.quality, newPhoto.capturedAt);
    await setWallPhoto(wall.id, photoId);
    await reload();
  };

  const confirmPhoto = async () => {
    if (!capturedUri) return;
    setSaving(true);
    try {
      await attachPhoto(capturedUri);
    } catch {
      Alert.alert('Save failed', 'Could not save the photo. Please try again.');
    } finally {
      setSaving(false);
      setCameraOpen(false);
      setCapturedUri(null);
    }
  };

  const pickFromLibrary = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets.length) return;
      setSaving(true);
      await attachPhoto(result.assets[0]!.uri);
    } catch {
      Alert.alert('Save failed', 'Could not save the photo. Please try again.');
    } finally {
      setSaving(false);
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
      ...(photo
        ? [
            { text: 'Retake photo', onPress: openCamera },
            { text: 'Choose different photo', onPress: pickFromLibrary },
            { text: 'Remove photo', style: 'destructive' as const, onPress: confirmRemovePhoto },
          ]
        : []),
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

  // ── Add symbol (tap the photo while in "adding" mode) ────────────────────

  const handlePlaceTap = (containerX: number, containerY: number) => {
    if (!renderedRect) return;
    setPendingTap({ x: containerX, y: containerY });
  };

  const placeTapGesture = Gesture.Tap()
    .enabled(addingSymbol)
    .onEnd((e) => { runOnJS(handlePlaceTap)(e.x, e.y); });

  const commitSymbol = async () => {
    if (!wall || !pendingTap || !renderedRect) return;
    const positionAlongWall = Math.max(0, Math.min(1, (pendingTap.x - renderedRect.offsetX) / renderedRect.width));
    const photoY = Math.max(0, Math.min(1, (pendingTap.y - renderedRect.offsetY) / renderedRect.height));
    await addWallSymbol(wall.id, selectedSymbolType, positionAlongWall, photoY, SYMBOL_TYPE_COLORS[selectedSymbolType]);
    setPendingTap(null);
    reload();
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
              Attach a photo of this wall or ceiling so you can mark what's on it while it's fresh in your memory.
            </Text>
            <View style={styles.emptyBtnRow}>
              <Pressable style={styles.addBtn} onPress={openCamera}>
                <Text style={styles.addBtnText}>Take photo</Text>
              </Pressable>
              <Pressable style={styles.addBtnSecondary} onPress={pickFromLibrary}>
                <Text style={styles.addBtnSecondaryText}>Choose from library</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.symbolModeToggle}>
              <Pressable
                style={[styles.symbolModeBtn, addingSymbol && styles.symbolModeBtnActive]}
                onPress={() => setAddingSymbol((v) => !v)}
                hitSlop={6}
              >
                <Text style={[styles.symbolModeBtnText, addingSymbol && styles.symbolModeBtnTextActive]}>
                  {addingSymbol ? 'Done adding' : '+ Add symbol'}
                </Text>
              </Pressable>
            </View>

            <GestureDetector gesture={placeTapGesture}>
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
                      enabled={!addingSymbol}
                      onDragEnd={(photoY) => handleSymbolDragEnd(symbol, photoY)}
                      onTap={() => confirmRemoveSymbol(symbol)}
                    />
                  );
                })}
              </View>
            </GestureDetector>
          </>
        )}

        {photo && (
          <Text style={styles.hint}>
            {addingSymbol ? 'Tap the photo to place a symbol' : 'Drag a symbol to adjust height · Tap to remove'}
          </Text>
        )}
      </SafeAreaView>

      {/* Symbol palette — after tapping the photo while adding a symbol.
          Modal, not an inline sibling View: an inline flex:1 sibling of the
          SafeAreaView above would split the screen's height with it as soon
          as it appears, shrinking the photo container and changing its
          onLayout size AFTER pendingTap was captured — corrupting the
          coordinate math in commitSymbol and pushing every placement down. */}
      <Modal visible={pendingTap != null} transparent animationType="fade" onRequestClose={() => setPendingTap(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setPendingTap(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>What symbol is this?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.symbolRow}>
              {SYMBOL_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.symbolBtn, selectedSymbolType === type && styles.symbolBtnActive]}
                  onPress={() => setSelectedSymbolType(type)}
                  hitSlop={4}
                >
                  <Text style={[styles.symbolBtnText, selectedSymbolType === type && styles.symbolBtnTextActive]}>
                    {SYMBOL_LABELS[type]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.sheetConfirm} onPress={commitSymbol}>
              <Text style={styles.sheetConfirmText}>Place {SYMBOL_LABELS[selectedSymbolType]}</Text>
            </Pressable>
            <Pressable onPress={() => setPendingTap(null)} style={styles.sheetCancel}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  emptyBtnRow: { flexDirection: 'row', gap: space.md },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.md },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  addBtnSecondary: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: 1, borderColor: colors.hairline },
  addBtnSecondaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },

  photoWrap: { flex: 1, position: 'relative', backgroundColor: '#000' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: space.md },

  symbolModeToggle: { alignItems: 'center', paddingVertical: space.sm },
  symbolModeBtn: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline },
  symbolModeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  symbolModeBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  symbolModeBtnTextActive: { color: colors.accentInk },

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
  sheetCancel: { alignItems: 'center', paddingTop: space.md },
  sheetCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },

  symbolRow: { gap: space.sm, paddingBottom: space.xs },
  symbolBtn: {
    paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline,
  },
  symbolBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  symbolBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  symbolBtnTextActive: { color: colors.accentInk },

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
