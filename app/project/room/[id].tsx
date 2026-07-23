/**
 * Room detail screen — reference photos for a single room.
 * Photos are internal-only; they never appear in the client PDF.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert,
  ActivityIndicator, Modal, Dimensions, TextInput, KeyboardAvoidingView, Platform,
  Image as RNImage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Path } from 'react-native-svg';
import type { Location, Wall, WallSymbol } from '@/src/domain/types';
import type { Photo } from '@/src/media/media-types';
import { loadLocation, setLocationHeight } from '@/src/data/project-repo';
import {
  photosForLocation, addLocationPhoto, deleteLocationPhoto, updatePhotoDetails,
  markPhotoDimensionsStamped,
} from '@/src/data/photo-repo';
import {
  loadWallsForLocation, loadWallSymbols, loadFloorPlanForLocation, deleteWall,
  addWallSymbol, deleteWallSymbol,
} from '@/src/data/floor-plan-repo';
import { roomFootprintMeters } from '@/src/domain/wall-geometry';
import { saveCapture, deletePhoto, overwritePhotoFile } from '@/src/media/camera-service';
import { useCameraOrientation } from '@/src/media/useCameraOrientation';
import { useVoiceAction } from '@/src/voice/voice-bus';
import {
  loadAnnotations, hasAnnotations, deleteAnnotations, denormalizeStroke, denormalizeSymbol,
  type AnnotationStroke, type PlacedSymbol,
} from '@/src/media/annotation-service';
import { AnnotationEditor } from '@/src/ui/annotations/AnnotationEditor';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';
import { WallShareCapture } from '@/src/ui/walls/WallShareCapture';
import { PhotoDimensionStamp } from '@/src/ui/photos/PhotoDimensionStamp';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import * as Sharing from 'expo-sharing';
import Share from 'react-native-share';
import type { PhotoStage } from '@/src/media/media-types';

const STAGE_LABELS: Record<PhotoStage, string> = { before: 'Before', during: 'During', after: 'After' };
const STAGE_COLORS: Record<PhotoStage, string> = { before: '#3B82F6', during: '#FFB020', after: '#06D6A0' };

const COLS = 3;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const THUMB = (SCREEN_W - space.lg * 2 - space.xs * (COLS - 1)) / COLS;

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type CameraState = 'live' | 'preview';

type PlanInfo = { width: number; height: number; pxPerMeter?: number } | null;

function computeFootprint(plan: PlanInfo, walls: Wall[]) {
  return plan?.pxPerMeter && walls.length > 0
    ? roomFootprintMeters(walls, { width: plan.width, height: plan.height }, plan.pxPerMeter)
    : null;
}

function buildDimensionsCaption(
  roomName: string,
  footprint: { lengthM: number; widthM: number },
  heightMeters?: number,
): string {
  const size = `L: ${footprint.lengthM.toFixed(1)}m${heightMeters != null ? `  H: ${heightMeters.toFixed(1)}m` : ''}`;
  return `${roomName} — ${size}`;
}

export default function RoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [location, setLocation] = useState<Location | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [floorPlan, setFloorPlan] = useState<PlanInfo>(null);
  const [heightModalOpen, setHeightModalOpen] = useState(false);
  const [heightText, setHeightText] = useState('');
  const [stampQueue, setStampQueue] = useState<{ photo: Photo; caption: string }[]>([]);
  const [stampItem, setStampItem] = useState<{ photo: Photo; caption: string } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWallIds, setSelectedWallIds] = useState<Set<string>>(new Set());
  const [shareQueue, setShareQueue] = useState<Wall[]>([]);
  const [renderedSharePaths, setRenderedSharePaths] = useState<string[]>([]);
  const [captureItem, setCaptureItem] = useState<{ wall: Wall; photo: Photo; symbols: WallSymbol[] } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('live');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  useCameraOrientation(cameraOpen);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const [lightboxStrokes, setLightboxStrokes] = useState<AnnotationStroke[]>([]);
  const [lightboxSymbols, setLightboxSymbols] = useState<PlacedSymbol[]>([]);
  const [lightboxImageSize, setLightboxImageSize] = useState<{ width: number; height: number } | null>(null);
  // Set when the open lightbox photo is a wall's attached photo — its
  // symbols are then sourced from (and synced back to) wall_symbols instead
  // of the photo's own local annotation file, so they also show up on the
  // floor plan overlay and in wall-photo shares. positionAlongWall/photoY
  // and PlacedSymbol's x/y are the same normalized-to-photo-content space
  // (see wall/[id].tsx), so no conversion is needed either direction.
  const [lightboxAttachedWall, setLightboxAttachedWall] = useState<Wall | null>(null);
  const [annotatedIds, setAnnotatedIds] = useState<Set<string>>(new Set());
  const [annotatorOpen, setAnnotatorOpen] = useState(false);

  const [captionModalOpen, setCaptionModalOpen] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [selectedStage, setSelectedStage] = useState<PhotoStage | null>(null);
  const [stageFilter, setStageFilter] = useState<PhotoStage | 'all'>('all');

  const reload = useCallback(async () => {
    if (!id) return;
    const loc = await loadLocation(id);
    setLocation(loc);
    const ps = await photosForLocation(id);
    setPhotos(ps);
    const w = await loadWallsForLocation(id);
    setWalls(w);
    const plan = loc.parentId ? await loadFloorPlanForLocation(loc.parentId) : null;
    setFloorPlan(plan);

    // Queue any photo that hasn't had the room-dimensions caption burned in
    // yet — covers both photos taken before the room's size was known and
    // freshly captured ones (which always start unstamped).
    const fp = computeFootprint(plan, w);
    if (fp) {
      const caption = buildDimensionsCaption(loc.name, fp, loc.heightMeters);
      const unstamped = ps.filter((p) => !p.dimensionsStamped);
      setStampQueue(unstamped.map((photo) => ({ photo, caption })));
    } else {
      setStampQueue([]);
    }

    // Check which photos have saved annotations
    const ids = new Set<string>();
    await Promise.all(ps.map(async (p) => { if (await hasAnnotations(p.id)) ids.add(p.id); }));
    setAnnotatedIds(ids);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // Process the stamp queue one photo at a time (an off-screen captureRef
  // composite, like WallShareCapture, can only reliably do one at once).
  useEffect(() => {
    if (stampQueue.length === 0 || stampItem) return;
    setStampItem(stampQueue[0]!);
  }, [stampQueue, stampItem]);

  const handleStamped = async (newUri: string) => {
    const item = stampItem;
    setStampItem(null);
    if (item) {
      await overwritePhotoFile(item.photo, newUri);
      await markPhotoDimensionsStamped(item.photo.id);
      // Default cachePolicy is 'disk' — clearing only memory would still let
      // a disk-cached pre-stamp bitmap resurface for this same file path.
      await Image.clearMemoryCache();
      await Image.clearDiskCache();
      setPhotos((prev) => prev.map((p) => (p.id === item.photo.id ? { ...p, dimensionsStamped: true } : p)));
    }
    setStampQueue((q) => q.slice(1));
  };

  const handleStampError = (e: unknown) => {
    console.warn('Dimension stamp failed', e);
    setStampItem(null);
    setStampQueue((q) => q.slice(1));
  };

  const footprint = computeFootprint(floorPlan, walls);

  const openCamera = async () => {
    if (!footprint) {
      Alert.alert(
        'Room size needed',
        "This room's dimensions aren't set yet, so photos can't be stamped with them. Calibrate the floor plan and trace this room's walls first.",
        [
          { text: 'Cancel', style: 'cancel' },
          ...(location?.parentId
            ? [{ text: 'Open floor plan', onPress: () => router.push(`/project/plan/${location.parentId}` as any) }]
            : []),
        ],
      );
      return;
    }
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

  useVoiceAction('takePhoto', openCamera);

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

  const openLightbox = async (photo: Photo) => {
    const { strokes, symbols } = await loadAnnotations(photo.id);
    const attachedWall = walls.find((w) => w.photoId === photo.id) ?? null;
    setLightboxAttachedWall(attachedWall);
    setLightboxStrokes(strokes);
    if (attachedWall) {
      const wallSymbols = await loadWallSymbols(attachedWall.id);
      setLightboxSymbols(wallSymbols.map((s) => ({ id: s.id, type: s.type, x: s.positionAlongWall, y: s.photoY, color: s.color ?? '#FFFFFF' })));
    } else {
      setLightboxSymbols(symbols);
    }
    setLightboxPhoto(photo);
    // Strokes/symbols are stored normalized to the photo's own image content
    // (see annotation-service.ts) — need the photo's natural pixel size to
    // convert them into this full-screen lightbox's own letterboxing.
    setLightboxImageSize(null);
    RNImage.getSize(
      photo.filePath,
      (width, height) => setLightboxImageSize({ width, height }),
      () => setLightboxImageSize(null),
    );
  };

  const openCaptionEdit = () => {
    if (!lightboxPhoto) return;
    setCaptionText(lightboxPhoto.caption ?? '');
    setNoteText(lightboxPhoto.note ?? '');
    setSelectedStage(lightboxPhoto.stage ?? null);
    setCaptionModalOpen(true);
  };

  const sharePhoto = async (photo: Photo) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing not available', 'Your device does not support sharing files.');
        return;
      }
      await Sharing.shareAsync(photo.filePath, { mimeType: 'image/jpeg', UTI: 'public.image', dialogTitle: photo.caption ?? 'Share photo' });
    } catch (e) {
      Alert.alert('Share failed', String(e));
    }
  };

  // ── Share selected wall photos (with symbols flattened in) ───────────────

  const toggleWallSelected = (wallId: string) => {
    setSelectedWallIds((prev) => {
      const next = new Set(prev);
      if (next.has(wallId)) next.delete(wallId); else next.add(wallId);
      return next;
    });
  };

  const startShareSelected = () => {
    const selected = walls.filter((w) => selectedWallIds.has(w.id) && w.photoId);
    if (selected.length === 0) return;
    setSharing(true);
    setRenderedSharePaths([]);
    setShareQueue(selected);
  };

  // Advance the queue: load the next wall's photo+symbols so WallShareCapture
  // can render and flatten it to a file. This is a render-only pass — nothing
  // is shared until every selected wall has been flattened, then they're all
  // handed to the OS share sheet in one ACTION_SEND_MULTIPLE call (see below),
  // so WhatsApp/email get one message with every photo attached instead of a
  // separate message per photo.
  useEffect(() => {
    if (shareQueue.length === 0) {
      if (sharing) {
        setSharing(false);
        setSelectMode(false);
        setSelectedWallIds(new Set());
        if (renderedSharePaths.length > 0) {
          Share.open({
            urls: renderedSharePaths,
            type: 'image/jpeg',
            title: 'Wall photos',
            failOnCancel: false,
          }).catch(() => {});
          setRenderedSharePaths([]);
        }
      }
      return;
    }
    const wall = shareQueue[0]!;
    const wallPhoto = wall.photoId ? photos.find((p) => p.id === wall.photoId) : undefined;
    if (!wallPhoto) {
      setShareQueue((q) => q.slice(1));
      return;
    }
    (async () => {
      const wallSymbols = await loadWallSymbols(wall.id);
      setCaptureItem({ wall, photo: wallPhoto, symbols: wallSymbols });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareQueue]);

  const handleCaptured = (filePath: string) => {
    setCaptureItem(null);
    setRenderedSharePaths((prev) => [...prev, filePath]);
    setShareQueue((q) => q.slice(1));
  };

  const handleCaptureError = (e: unknown) => {
    Alert.alert('Share failed', String(e));
    setCaptureItem(null);
    setShareQueue((q) => q.slice(1));
  };

  const saveCaptionEdit = async () => {
    if (!lightboxPhoto) return;
    const trimCaption = captionText.trim();
    const trimNote = noteText.trim();
    await updatePhotoDetails(lightboxPhoto.id, trimCaption, trimNote, selectedStage);
    setCaptionModalOpen(false);
    setLightboxPhoto(prev =>
      prev
        ? { ...prev, caption: trimCaption || undefined, note: trimNote || undefined, stage: selectedStage ?? undefined }
        : null,
    );
    reload();
  };

  const confirmDelete = (photo: Photo) => {
    const attachedWall = walls.find((w) => w.photoId === photo.id);
    Alert.alert(
      'Delete photo?',
      attachedWall
        ? `This cannot be undone. "${attachedWall.label || 'Wall'}" and its tagged symbols will also be deleted.`
        : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLocationPhoto(photo.id);
            await deletePhoto(photo);
            await deleteAnnotations(photo.id);
            // A wall's photo is its whole purpose here, so deleting it takes
            // the wall (and its tagged symbols) with it — same rule as the
            // wall screen's own delete action.
            if (attachedWall) await deleteWall(attachedWall.id);
            reload();
          },
        },
      ],
    );
  };

  const openHeightEdit = () => {
    setHeightText(location?.heightMeters != null ? String(location.heightMeters) : '');
    setHeightModalOpen(true);
  };

  const saveHeight = async () => {
    if (!location) return;
    const trimmed = heightText.trim();
    if (trimmed === '') {
      await setLocationHeight(location.id, null);
    } else {
      const meters = parseFloat(trimmed);
      if (!Number.isFinite(meters) || meters <= 0) {
        Alert.alert('Enter a height', 'Type the ceiling height in metres, e.g. 2.4.');
        return;
      }
      await setLocationHeight(location.id, meters);
    }
    setHeightModalOpen(false);
    await reload();
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
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
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
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
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

        {(footprint || walls.length > 0) && (
          <View style={styles.sizeRow}>
            {footprint ? (
              <Text style={styles.sizeText}>
                L: {footprint.lengthM.toFixed(1)}m
                {location.heightMeters != null ? `  H: ${location.heightMeters.toFixed(1)}m` : ''}
              </Text>
            ) : (
              <Pressable onPress={() => location.parentId && router.push(`/project/plan/${location.parentId}` as any)}>
                <Text style={styles.sizeHint}>Calibrate the floor plan to see room size ›</Text>
              </Pressable>
            )}
            {footprint && (
              <Pressable onPress={openHeightEdit} hitSlop={8}>
                <Text style={styles.sizeEditLink}>{location.heightMeters != null ? 'Edit height' : '+ Add height'}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Stage filter bar */}
        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
            {(['all', 'before', 'during', 'after'] as const).map((f) => {
              const active = stageFilter === f;
              const count = f === 'all' ? photos.length : photos.filter(p => p.stage === f).length;
              const color = f === 'all' ? colors.textSecondary : STAGE_COLORS[f];
              return (
                <Pressable
                  key={f}
                  style={[styles.filterChip, active && { backgroundColor: f === 'all' ? colors.surface : color }]}
                  onPress={() => setStageFilter(f)}
                  hitSlop={4}
                >
                  <Text style={[styles.filterChipText, active && { color: f === 'all' ? colors.textPrimary : '#000' }]}>
                    {f === 'all' ? 'All' : STAGE_LABELS[f]} {count > 0 ? `(${count})` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {photos.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>[  ]</Text>
            <Text style={styles.emptyText}>No photos yet.</Text>
            <Text style={styles.emptyHint}>Tap "+ Add photo" to capture the room.</Text>
          </View>
        ) : photos.filter(p => stageFilter === 'all' || p.stage === stageFilter).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No {stageFilter} photos.</Text>
            <Text style={styles.emptyHint}>Tag a photo as "{STAGE_LABELS[stageFilter as PhotoStage]}" in its Edit sheet.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {photos.filter(p => stageFilter === 'all' || p.stage === stageFilter).map((photo) => (
              <Pressable
                key={photo.id}
                style={styles.thumb}
                onPress={() => openLightbox(photo)}
                onLongPress={() => confirmDelete(photo)}
                delayLongPress={400}
              >
                <Image
                  source={{ uri: photo.filePath }}
                  style={styles.thumbImage}
                  contentFit="cover"
                  transition={150}
                />
                {photo.stage && (
                  <View style={[styles.stageBadge, { backgroundColor: STAGE_COLORS[photo.stage] }]}>
                    <Text style={styles.stageBadgeText}>{STAGE_LABELS[photo.stage]}</Text>
                  </View>
                )}
                {photo.caption ? (
                  <View style={styles.thumbCaption}>
                    <Text style={styles.thumbCaptionText} numberOfLines={1}>{photo.caption}</Text>
                  </View>
                ) : null}
                {annotatedIds.has(photo.id) && (
                  <View style={styles.annotationBadge}>
                    <Text style={styles.annotationBadgeText}>✏</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {photos.length > 0 && (
          <Text style={styles.hint}>Tap to view / name  ·  Hold to delete</Text>
        )}

        <View style={styles.wallsHeaderRow}>
          <Text style={[styles.subtitle, styles.wallsSubtitle, { marginBottom: 0 }]}>Walls</Text>
          {walls.some((w) => w.photoId) && (
            <Pressable
              onPress={() => { setSelectMode((v) => !v); setSelectedWallIds(new Set()); }}
              hitSlop={8}
            >
              <Text style={styles.wallsSelectToggle}>{selectMode ? 'Cancel' : 'Select'}</Text>
            </Pressable>
          )}
        </View>

        {walls.length === 0 ? (
          <View style={styles.wallsEmpty}>
            <Text style={styles.emptyHint}>No walls traced yet.</Text>
            {location.parentId && (
              <Pressable onPress={() => router.push(`/project/plan/${location.parentId}` as any)}>
                <Text style={styles.wallsEmptyLink}>Trace walls from the floor plan ›</Text>
              </Pressable>
            )}
          </View>
        ) : (
          walls.map((wall) => {
            const wallPhoto = wall.photoId ? photos.find((p) => p.id === wall.photoId) : undefined;
            const selected = selectedWallIds.has(wall.id);
            return (
              <Pressable
                key={wall.id}
                style={styles.wallRow}
                onPress={() => {
                  if (selectMode) {
                    if (wall.photoId) toggleWallSelected(wall.id);
                  } else {
                    router.push(`/project/wall/${wall.id}` as any);
                  }
                }}
              >
                {selectMode && (
                  <View style={[styles.checkbox, selected && styles.checkboxChecked, !wall.photoId && styles.checkboxDisabled]}>
                    {selected && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                )}
                {wallPhoto ? (
                  <Image source={{ uri: wallPhoto.filePath }} style={styles.wallThumb} contentFit="cover" />
                ) : (
                  <View style={styles.wallThumbEmpty} />
                )}
                <Text style={styles.wallRowText}>{wall.label || 'Wall'}</Text>
                {!selectMode && <Text style={styles.wallChevron}>›</Text>}
              </Pressable>
            );
          })
        )}

        {selectMode && selectedWallIds.size > 0 && (
          <Pressable style={styles.shareWallsBtn} onPress={startShareSelected} disabled={sharing}>
            <Text style={styles.shareWallsBtnText}>
              {sharing ? 'Preparing share…' : `Share ${selectedWallIds.size} photo${selectedWallIds.size === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Off-screen capture used to flatten a wall's photo + symbols before sharing */}
      {captureItem && (
        <WallShareCapture
          photo={captureItem.photo}
          symbols={captureItem.symbols}
          onReady={handleCaptured}
          onError={handleCaptureError}
        />
      )}

      {/* Off-screen capture used to burn the room-dimensions caption into a photo */}
      {stampItem && (
        <PhotoDimensionStamp
          photoUri={stampItem.photo.filePath}
          caption={stampItem.caption}
          onReady={handleStamped}
          onError={handleStampError}
        />
      )}

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
          {/* Annotation overlay — strokes + symbols, denormalized to this
              full-screen container's own letterboxing (see openLightbox). */}
          {lightboxImageSize && (lightboxStrokes.length > 0 || lightboxSymbols.length > 0) && (
            <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFillObject} pointerEvents="none">
              {lightboxStrokes
                .map((s) => denormalizeStroke(s, { width: SCREEN_W, height: SCREEN_H }, lightboxImageSize))
                .map((s, i) => (
                  <Path key={i} d={s.path} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              {lightboxSymbols
                .map((sym) => denormalizeSymbol(sym, { width: SCREEN_W, height: SCREEN_H }, lightboxImageSize))
                .map((sym) => (
                  <PlacedSymbolGroup key={sym.id} symbol={sym} />
                ))}
            </Svg>
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
                  <View style={styles.lightboxActions}>
                    <Pressable onPress={() => sharePhoto(lightboxPhoto)} hitSlop={8}>
                      <Text style={styles.lightboxShareBtn}>Share</Text>
                    </Pressable>
                    <Pressable onPress={() => setAnnotatorOpen(true)} hitSlop={8}>
                      <Text style={styles.lightboxAnnotateBtn}>Annotate</Text>
                    </Pressable>
                    <Pressable onPress={openCaptionEdit} hitSlop={8}>
                      <Text style={styles.lightboxEditBtn}>Edit</Text>
                    </Pressable>
                  </View>
                </View>
              </SafeAreaView>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      {/* Annotation editor */}
      {lightboxPhoto && (
        <AnnotationEditor
          visible={annotatorOpen}
          photoUri={lightboxPhoto.filePath}
          photoId={lightboxPhoto.id}
          initialStrokes={lightboxStrokes}
          initialSymbols={lightboxSymbols}
          linkedWallLabel={lightboxAttachedWall?.label}
          onClose={() => setAnnotatorOpen(false)}
          onSaved={async (strokes, symbols) => {
            let finalSymbols = symbols;
            if (lightboxAttachedWall) {
              // lightboxSymbols here is still the pre-edit snapshot loaded in
              // openLightbox — diff by id against the newly-returned list to
              // find what changed, and push that into wall_symbols (the
              // source of truth for the floor plan overlay / wall shares).
              const wall = lightboxAttachedWall;
              const beforeIds = new Set(lightboxSymbols.map((s) => s.id));
              const afterIds = new Set(symbols.map((s) => s.id));
              const removed = lightboxSymbols.filter((s) => !afterIds.has(s.id));
              const added = symbols.filter((s) => !beforeIds.has(s.id));
              await Promise.all([
                ...removed.map((s) => deleteWallSymbol(s.id)),
                ...added.map((s) => addWallSymbol(wall.id, s.type, s.x, s.y, s.color)),
              ]);
              const refreshed = await loadWallSymbols(wall.id);
              finalSymbols = refreshed.map((s) => ({ id: s.id, type: s.type, x: s.positionAlongWall, y: s.photoY, color: s.color ?? '#FFFFFF' }));
            }
            setLightboxStrokes(strokes);
            setLightboxSymbols(finalSymbols);
            setAnnotatedIds((prev) => {
              const next = new Set(prev);
              if (strokes.length > 0 || finalSymbols.length > 0) next.add(lightboxPhoto.id);
              else next.delete(lightboxPhoto.id);
              return next;
            });
            setAnnotatorOpen(false);
            reload();
          }}
        />
      )}

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
            <Text style={styles.captionLabel}>Stage</Text>
            <View style={styles.stageRow}>
              {(['before', 'during', 'after'] as const).map((s) => {
                const active = selectedStage === s;
                return (
                  <Pressable
                    key={s}
                    style={[styles.stageChip, active && { backgroundColor: STAGE_COLORS[s] }]}
                    onPress={() => setSelectedStage(active ? null : s)}
                    hitSlop={4}
                  >
                    <Text style={[styles.stageChipText, active && styles.stageChipTextActive]}>
                      {STAGE_LABELS[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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

      {/* Ceiling height edit sheet */}
      <Modal
        visible={heightModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setHeightModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.captionOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.captionBackdrop} onPress={() => setHeightModalOpen(false)} />
          <View style={styles.captionSheet}>
            <Text style={styles.captionSheetTitle}>Ceiling height</Text>
            <Text style={styles.captionLabel}>Metres</Text>
            <TextInput
              style={styles.captionInput}
              value={heightText}
              onChangeText={setHeightText}
              placeholder="e.g. 2.4"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveHeight}
            />
            <View style={styles.captionBtns}>
              <Pressable onPress={() => setHeightModalOpen(false)} hitSlop={8}>
                <Text style={styles.captionCancel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.captionSaveBtn} onPress={saveHeight}>
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
  sizeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  sizeText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  sizeHint: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  sizeEditLink: { color: colors.accent, fontSize: 13, fontWeight: '700' },
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

  wallsSubtitle: { marginTop: space.xl, marginBottom: space.md },
  wallsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wallsSelectToggle: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  wallsEmpty: { alignItems: 'flex-start' },
  wallsEmptyLink: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: space.xs },
  wallRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile,
    padding: space.sm, marginBottom: space.xs,
  },
  wallThumb: { width: 44, height: 44, borderRadius: radius.tile / 2 },
  wallThumbEmpty: { width: 44, height: 44, borderRadius: radius.tile / 2, backgroundColor: colors.ground },
  wallRowText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  wallChevron: { color: colors.textMuted, fontSize: 20 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: colors.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxDisabled: { opacity: 0.3 },
  checkboxTick: { color: colors.accentInk, fontSize: 13, fontWeight: '800' },
  shareWallsBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: space.md, alignItems: 'center', marginTop: space.sm,
  },
  shareWallsBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

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

  stageBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  stageBadgeText: { color: '#000', fontSize: 9, fontWeight: '800' },

  filterBar: { marginBottom: space.md },
  filterBarContent: { gap: space.xs, paddingBottom: 2 },
  filterChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  filterChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  stageRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  stageChip: {
    flex: 1,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  stageChipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  stageChipTextActive: { color: '#000' },

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
  lightboxActions: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  lightboxShareBtn: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  lightboxAnnotateBtn: { color: '#06D6A0', fontSize: 14, fontWeight: '700' },
  lightboxEditBtn: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  annotationBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  annotationBadgeText: { color: '#06D6A0', fontSize: 10 },

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
  captionCancel: { color: colors.danger, fontSize: 15, fontWeight: '600' },
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
