/**
 * Floor-plan viewer and wall tracer.
 *
 * Route id = the FLOOR's location id (a top-level Location). Two modes:
 *  - View: pinch-zoom/pan the imported plan image; tap a wall to open its
 *    detail screen (attach/view its photo, place electrical symbols there —
 *    see app/project/wall/[id].tsx).
 *  - Trace walls: tap two points to trace a wall, assign it to a room.
 *
 * Wall selection is handled entirely inside the shared tap gesture (not a
 * nested Pressable) — a native Pressable nested inside a GestureDetector's
 * target view competes with that detector's own recognizers (here, the
 * pinch/double-tap-reset gestures active in View mode) for the same
 * touches, which made wall taps register unreliably. Routing every tap
 * through one gesture-driven handler avoids that.
 *
 * Pinch-zoom is only enabled in View mode and reset to scale=1 whenever
 * leaving it — Trace tap math assumes the container is unscaled, and
 * gesture-handler's e.x/e.y are relative to the view's untransformed layout,
 * not its visually zoomed size, so combining live zoom with precise tap
 * placement would misplace every wall.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import Svg from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import type { Location, Wall, WallSymbol } from '@/src/domain/types';
import { loadLocation, loadLocations } from '@/src/data/project-repo';
import {
  loadFloorPlanForLocation, addFloorPlan, updateFloorPlanFile, deleteFloorPlan,
  addWall, loadWallsForFloorPlan, loadWallSymbolsForFloorPlan,
} from '@/src/data/floor-plan-repo';
import { importFloorPlanImage, deleteFloorPlanImage } from '@/src/media/floor-plan-service';
import {
  containerPointToImageNorm, imageNormToContainerPoint,
  findNearestWall, wallPointAt, NEAREST_WALL_MAX_DISTANCE,
  type Point,
} from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type Mode = 'view' | 'trace';

function Dot({ point, color }: { point: Point; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.dot, { left: point.x - 8, top: point.y - 8, backgroundColor: color }]}
    />
  );
}

function WallLine({ start, end }: { start: Point; end: Point }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: midX - len / 2,
        top: midY - 1.5,
        width: len,
        height: 3,
        backgroundColor: colors.accent,
        opacity: 0.9,
        borderRadius: 1.5,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

export default function FloorPlanScreen() {
  const router = useRouter();
  const { id: floorId } = useLocalSearchParams<{ id: string }>();

  const [floor, setFloor] = useState<Location | null>(null);
  const [rooms, setRooms] = useState<Location[]>([]);
  const [floorPlan, setFloorPlan] = useState<{
    id: string; filePath: string; width: number; height: number;
  } | null>(null);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [symbols, setSymbols] = useState<WallSymbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const [mode, setModeState] = useState<Mode>('view');
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });

  // Trace-walls state
  const [pendingStart, setPendingStart] = useState<Point | null>(null);
  const [roomPicker, setRoomPicker] = useState<{ start: Point; end: Point } | null>(null);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const setMode = (next: Mode) => {
    if (next !== 'view') scale.value = 1; // tap math assumes an unscaled container
    setModeState(next);
    setPendingStart(null);
  };

  const reload = useCallback(async () => {
    if (!floorId) return;
    const loc = await loadLocation(floorId);
    setFloor(loc);
    const allLocs = await loadLocations(loc.projectId);
    setRooms(allLocs.filter((l) => l.parentId === floorId));

    const plan = await loadFloorPlanForLocation(floorId);
    setFloorPlan(plan);
    if (plan) {
      const [w, s] = await Promise.all([
        loadWallsForFloorPlan(plan.id),
        loadWallSymbolsForFloorPlan(plan.id),
      ]);
      setWalls(w);
      setSymbols(s);
    } else {
      setWalls([]);
      setSymbols([]);
    }
    setLoading(false);
  }, [floorId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const imageSize = floorPlan ? { width: floorPlan.width, height: floorPlan.height } : { width: 1, height: 1 };

  const pickAndImportPlan = async () => {
    if (!floor) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets.length) return;
      setImporting(true);
      const asset = result.assets[0]!;
      const newId = await addFloorPlan(floor.projectId, floor.id, '', 0, 0);
      const { filePath, width, height } = await importFloorPlanImage(asset.uri, mediaPaths, floor.projectId, newId);
      await updateFloorPlanFile(newId, filePath, width, height);
      await reload();
    } catch (e) {
      Alert.alert('Import failed', String(e));
    } finally {
      setImporting(false);
    }
  };

  const confirmReplacePlan = () => {
    Alert.alert(
      'Replace floor plan?',
      'All walls, tagged symbols, and wall photos on the current plan will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            if (!floorPlan) return;
            const { deletedPhotoFilePaths, planFilePath } = await deleteFloorPlan(floorPlan.id);
            await deleteFloorPlanImage(planFilePath);
            await Promise.all(deletedPhotoFilePaths.map((p) => FileSystem.deleteAsync(p, { idempotent: true })));
            await pickAndImportPlan();
          },
        },
      ],
    );
  };

  const confirmDeletePlan = () => {
    Alert.alert(
      'Delete floor plan?',
      'All walls, tagged symbols, and wall photos on this plan will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!floorPlan) return;
            const { deletedPhotoFilePaths, planFilePath } = await deleteFloorPlan(floorPlan.id);
            await deleteFloorPlanImage(planFilePath);
            await Promise.all(deletedPhotoFilePaths.map((p) => FileSystem.deleteAsync(p, { idempotent: true })));
            await reload();
          },
        },
      ],
    );
  };

  const openOverflow = () => {
    Alert.alert('Floor plan', undefined, [
      { text: 'Replace floor plan', onPress: confirmReplacePlan },
      { text: 'Delete floor plan', style: 'destructive', onPress: confirmDeletePlan },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Trace walls ──────────────────────────────────────────────────────────

  const handleTraceTap = (norm: Point) => {
    if (!pendingStart) {
      setPendingStart(norm);
    } else {
      setRoomPicker({ start: pendingStart, end: norm });
      setPendingStart(null);
    }
  };

  const commitWall = async (roomId: string) => {
    if (!floorPlan || !roomPicker) return;
    const label = `Wall ${walls.length + 1}`;
    const newWallId = await addWall(floorPlan.id, roomId, roomPicker.start, roomPicker.end, label);
    setRoomPicker(null);
    // Straight to the photo-attach prompt — no separate trip back through
    // View mode to find and tap the wall you just traced.
    router.push(`/project/wall/${newWallId}` as any);
  };

  // ── View mode: tap a wall to open it ─────────────────────────────────────

  const handleViewTap = (norm: Point) => {
    const nearest = findNearestWall(norm, walls);
    if (nearest && nearest.distance <= NEAREST_WALL_MAX_DISTANCE) {
      router.push(`/project/wall/${nearest.wall.id}` as any);
    }
  };

  // ── Gestures ─────────────────────────────────────────────────────────────

  const handleTap = (containerX: number, containerY: number) => {
    const norm = containerPointToImageNorm({ x: containerX, y: containerY }, containerSize, imageSize);
    if (mode === 'trace') handleTraceTap(norm);
    else handleViewTap(norm);
  };

  const pinchGesture = Gesture.Pinch()
    .enabled(mode === 'view')
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale)); });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(mode === 'view')
    .onEnd(() => { scale.value = withSpring(1); });

  const singleTap = Gesture.Tap()
    .onEnd((e) => { runOnJS(handleTap)(e.x, e.y); });

  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pinchGesture, doubleTap), singleTap);

  const imageAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  if (!floor) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        </View>
        <Text style={styles.empty}>Floor not found.</Text>
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
          <Text style={styles.title} numberOfLines={1}>{floor.name}</Text>
          {floorPlan ? (
            <Pressable onPress={openOverflow} hitSlop={12}>
              <Text style={styles.moreBtn}>•••</Text>
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        {!floorPlan ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No floor plan yet.</Text>
            <Text style={styles.emptyHint}>Import an image of this floor's plan to trace its walls.</Text>
            <Pressable style={styles.importBtn} onPress={pickAndImportPlan} disabled={importing}>
              <Text style={styles.importBtnText}>{importing ? 'Importing…' : 'Import floor plan'}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.modeToggle}>
              {(['view', 'trace'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                  hitSlop={6}
                >
                  <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                    {m === 'view' ? 'View' : 'Trace walls'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <GestureDetector gesture={gesture}>
              <View
                style={styles.canvas}
                onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
              >
                <Animated.View style={[StyleSheet.absoluteFill, imageAnimStyle]}>
                  <Image
                    source={{ uri: floorPlan.filePath }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                  />
                  <Svg width={containerSize.width} height={containerSize.height} style={StyleSheet.absoluteFillObject}>
                    {symbols.map((sym) => {
                      const wall = walls.find((w) => w.id === sym.wallId);
                      if (!wall) return null;
                      const planPoint = wallPointAt(wall, sym.positionAlongWall);
                      const pixel = imageNormToContainerPoint(planPoint, containerSize, imageSize);
                      return (
                        <PlacedSymbolGroup
                          key={sym.id}
                          symbol={{ id: sym.id, type: sym.type, x: pixel.x, y: pixel.y, color: sym.color ?? '#FFFFFF' }}
                        />
                      );
                    })}
                  </Svg>

                  {walls.map((wall) => (
                    <WallLine
                      key={wall.id}
                      start={imageNormToContainerPoint(wall.start, containerSize, imageSize)}
                      end={imageNormToContainerPoint(wall.end, containerSize, imageSize)}
                    />
                  ))}

                  {pendingStart && (
                    <Dot point={imageNormToContainerPoint(pendingStart, containerSize, imageSize)} color={colors.accent} />
                  )}
                </Animated.View>
              </View>
            </GestureDetector>

            <Text style={styles.hint}>
              {mode === 'view' && 'Pinch to zoom · Tap a wall to attach/view its photo'}
              {mode === 'trace' && (pendingStart ? 'Tap the wall\'s other end' : 'Tap one end of a wall')}
            </Text>
          </>
        )}
      </SafeAreaView>

      {/* Room picker — after tracing a wall. Modal, not an inline sibling
          View: a flex:1 sibling of the SafeAreaView above would split the
          screen's height with it as soon as it appears, squeezing the plan
          canvas underneath. */}
      <Modal visible={roomPicker != null} transparent animationType="fade" onRequestClose={() => setRoomPicker(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setRoomPicker(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Which room is this wall in?</Text>
            {rooms.length === 0 ? (
              <Text style={styles.emptyHint}>No rooms under this floor yet — add one from the project screen first.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }}>
                {rooms.map((room) => (
                  <Pressable key={room.id} style={styles.sheetRow} onPress={() => commitWall(room.id)}>
                    <Text style={styles.sheetRowText}>{room.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable onPress={() => setRoomPicker(null)} style={styles.sheetCancel}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
  title: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  moreBtn: { color: colors.textSecondary, fontSize: 20, fontWeight: '700', letterSpacing: 2, width: 24, textAlign: 'right' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  emptyText: { color: colors.textSecondary, fontSize: 17, fontWeight: '700', marginBottom: space.xs },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: space.xl, lineHeight: 19 },
  importBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.md },
  importBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

  modeToggle: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill,
    padding: 3, marginHorizontal: space.lg, marginBottom: space.sm,
  },
  modeBtn: { flex: 1, paddingVertical: space.sm, borderRadius: radius.pill, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  modeBtnTextActive: { color: colors.accentInk },

  canvas: { flex: 1, position: 'relative', backgroundColor: '#000' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: space.md },

  dot: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: '#fff',
  },

  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    padding: space.xl, paddingBottom: space.xxl,
  },
  sheetTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: space.md },
  sheetRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  sheetRowText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  sheetCancel: { alignItems: 'center', paddingTop: space.md },
  sheetCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
