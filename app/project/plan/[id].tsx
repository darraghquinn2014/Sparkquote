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
 * Pinch-zoom and one-finger pan (while zoomed) work in every mode (reset to
 * scale=1/translate=0 whenever the mode is switched). gesture-handler's
 * e.x/e.y are always relative to the canvas's untransformed layout, not its
 * visually zoomed/panned position, so every tap is first projected back
 * through the current scale+translate (see unscaleContainerPoint) before
 * being converted to a normalized image point. The canvas clips its
 * contents (`overflow: 'hidden'`) so a zoomed-in image can't visually bleed
 * over the header/mode-toggle above it and steal their touches.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import Svg from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import type { Project, Location, Wall, WallSymbol } from '@/src/domain/types';
import { loadProjects, loadLocation, loadLocations, setLocationHeight } from '@/src/data/project-repo';
import {
  loadFloorPlanForLocation, addFloorPlan, updateFloorPlanFile, deleteFloorPlan,
  addWall, loadWallsForFloorPlan, loadWallSymbolsForFloorPlan, setFloorPlanScale,
} from '@/src/data/floor-plan-repo';
import { importFloorPlanImage, deleteFloorPlanImage } from '@/src/media/floor-plan-service';
import {
  containerPointToImageNorm, imageNormToContainerPoint,
  findNearestWall, wallPointAt, NEAREST_WALL_MAX_DISTANCE, calibrateScale,
  type Point,
} from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type Mode = 'view' | 'trace' | 'calibrate';

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

  const insets = useSafeAreaInsets();
  const [floor, setFloor] = useState<Location | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [rooms, setRooms] = useState<Location[]>([]);
  const [floorPlan, setFloorPlan] = useState<{
    id: string; filePath: string; width: number; height: number; pxPerMeter?: number;
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

  // Calibrate-scale state
  const [calibStart, setCalibStart] = useState<Point | null>(null);
  const [calibPrompt, setCalibPrompt] = useState<{ start: Point; end: Point } | null>(null);
  const [calibDistanceText, setCalibDistanceText] = useState('');

  // Optional follow-up after saving scale — ceiling height, applied to every
  // room on this floor at once since calibration itself has no single room
  // in mind (it's just two taps on the plan).
  const [heightPromptOpen, setHeightPromptOpen] = useState(false);
  const [heightText, setHeightText] = useState('');

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const setMode = (next: Mode) => {
    // start each mode unzoomed/uncentred; pinch and pan still work once in it
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    setModeState(next);
    setPendingStart(null);
    setCalibStart(null);
  };

  const reload = useCallback(async () => {
    if (!floorId) return;
    const loc = await loadLocation(floorId);
    setFloor(loc);
    const [allLocs, projects] = await Promise.all([
      loadLocations(loc.projectId),
      loadProjects(),
    ]);
    setRooms(allLocs.filter((l) => l.parentId === floorId));
    setProject(projects.find((p) => p.id === loc.projectId) ?? null);

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

  // ── Calibrate scale ──────────────────────────────────────────────────────

  const handleCalibrateTap = (norm: Point) => {
    if (!calibStart) {
      setCalibStart(norm);
    } else {
      setCalibPrompt({ start: calibStart, end: norm });
      setCalibStart(null);
    }
  };

  const cancelCalibration = () => {
    setCalibPrompt(null);
    setCalibDistanceText('');
  };

  const commitCalibration = async () => {
    if (!floorPlan || !calibPrompt) return;
    const meters = parseFloat(calibDistanceText);
    if (!Number.isFinite(meters) || meters <= 0) {
      Alert.alert('Enter a distance', 'Type how many metres apart the two points you tapped are.');
      return;
    }
    const pxPerMeter = calibrateScale(calibPrompt.start, calibPrompt.end, imageSize, meters);
    await setFloorPlanScale(floorPlan.id, pxPerMeter);
    setCalibPrompt(null);
    setCalibDistanceText('');
    setHeightText('');
    setHeightPromptOpen(true);
    await reload();
  };

  const skipHeight = () => { setHeightPromptOpen(false); setHeightText(''); };

  const saveFloorHeight = async () => {
    const meters = parseFloat(heightText);
    if (!Number.isFinite(meters) || meters <= 0) {
      Alert.alert('Enter a height', 'Type the ceiling height in metres, e.g. 2.4 — or Skip.');
      return;
    }
    await Promise.all(rooms.map((room) => setLocationHeight(room.id, meters)));
    setHeightPromptOpen(false);
    setHeightText('');
    await reload();
  };

  // ── View mode: tap a wall to open it ─────────────────────────────────────

  const handleViewTap = (norm: Point) => {
    const nearest = findNearestWall(norm, walls);
    if (nearest && nearest.distance <= NEAREST_WALL_MAX_DISTANCE) {
      router.push(`/project/wall/${nearest.wall.id}` as any);
    }
  };

  // ── Gestures ─────────────────────────────────────────────────────────────

  // Gesture-handler reports tap x/y relative to the canvas's own unscaled
  // layout — the pinch/pan transform below only visually magnifies/shifts
  // the image, it doesn't change that layout. So a raw tap while zoomed
  // and/or panned lands on the wrong spot unless it's first projected back
  // through the same scale-about-centre-then-translate the image was given.
  // Transform order in imageAnimStyle is [translateX, translateY, scale];
  // RN composes that as scale applied first (about the view's own centre),
  // THEN translate added on top in raw, unscaled screen pixels — so the
  // inverse here undoes translate first, then unscales about the centre.
  const unscaleContainerPoint = (x: number, y: number) => {
    const s = scale.value;
    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;
    return {
      x: (x - translateX.value - cx) / s + cx,
      y: (y - translateY.value - cy) / s + cy,
    };
  };

  const handleTap = (containerX: number, containerY: number) => {
    const unscaled = unscaleContainerPoint(containerX, containerY);
    const norm = containerPointToImageNorm(unscaled, containerSize, imageSize);
    if (mode === 'trace') handleTraceTap(norm);
    else if (mode === 'calibrate') handleCalibrateTap(norm);
    else handleViewTap(norm);
  };

  // Max pan offset (raw screen pixels, matching translateX/Y — translate is
  // applied on top of scale, unscaled) that keeps the image from drifting
  // fully off-canvas: the visual overhang a zoomed image has past the
  // container edge on each side.
  const clampTranslate = (value: number, containerDim: number, s: number) => {
    'worklet';
    const maxOffset = (containerDim * (s - 1)) / 2;
    return Math.max(-maxOffset, Math.min(maxOffset, value));
  };

  const pinchGesture = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale));
      translateX.value = clampTranslate(translateX.value, containerSize.width, scale.value);
      translateY.value = clampTranslate(translateY.value, containerSize.height, scale.value);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1) return; // nothing to pan when not zoomed
      translateX.value = clampTranslate(
        savedTranslateX.value + e.translationX,
        containerSize.width,
        scale.value,
      );
      translateY.value = clampTranslate(
        savedTranslateY.value + e.translationY,
        containerSize.height,
        scale.value,
      );
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(1);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const singleTap = Gesture.Tap()
    .onEnd((e) => { runOnJS(handleTap)(e.x, e.y); });

  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pinchGesture, panGesture, doubleTap), singleTap);

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

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
          {floorPlan ? (
            <Pressable onPress={openOverflow} hitSlop={12}>
              <Text style={styles.moreBtn}>•••</Text>
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
          <View style={styles.headerTitleOverlay} pointerEvents="none">
            <Text style={styles.title} numberOfLines={1}>{floor.name.toUpperCase()}</Text>
            {project?.name ? <Text style={styles.sub} numberOfLines={1}>{project.name}</Text> : null}
          </View>
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
              {(['view', 'trace', 'calibrate'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                  hitSlop={6}
                >
                  <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                    {m === 'view' ? 'View' : m === 'trace' ? 'Trace walls' : 'Calibrate'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.scaleStatus}>
              {floorPlan.pxPerMeter
                ? `Scale set — room sizes will show on each room's screen`
                : 'Scale not set — calibrate to see room sizes'}
            </Text>

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
                  {calibStart && (
                    <Dot point={imageNormToContainerPoint(calibStart, containerSize, imageSize)} color="#3B82F6" />
                  )}
                </Animated.View>
              </View>
            </GestureDetector>

            <Text style={styles.hint}>
              {mode === 'view' && 'Pinch to zoom · Tap a wall to attach/view its photo'}
              {mode === 'trace' && (pendingStart ? 'Tap the wall\'s other end' : 'Tap one end of a wall')}
              {mode === 'calibrate' && (calibStart ? 'Tap the second point' : 'Tap two points a known distance apart (e.g. skirting board ends)')}
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
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.xxl }]} onPress={() => {}}>
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
              <Text style={[styles.sheetCancelText, { color: colors.danger }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Calibration prompt — after tapping two points, ask their real-world distance. */}
      <Modal visible={calibPrompt != null} transparent animationType="fade" onRequestClose={cancelCalibration}>
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={cancelCalibration} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xxl }]}>
            <Text style={styles.sheetTitle}>How far apart are those two points?</Text>
            <Text style={styles.emptyHint}>Measure it on site (e.g. a wall length) and enter it here.</Text>
            <View style={styles.calibInputRow}>
              <TextInput
                style={styles.calibInput}
                value={calibDistanceText}
                onChangeText={setCalibDistanceText}
                placeholder="4.2"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitCalibration}
              />
              <Text style={styles.calibUnit}>metres</Text>
            </View>
            <View style={styles.calibBtnRow}>
              <Pressable onPress={cancelCalibration} style={styles.sheetCancel}>
                <Text style={[styles.sheetCancelText, { color: colors.danger }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={commitCalibration} style={styles.calibSaveBtn}>
                <Text style={styles.calibSaveBtnText}>Save scale</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Optional follow-up after saving scale — set every room's ceiling
          height on this floor in one go, or skip it entirely. */}
      <Modal visible={heightPromptOpen} transparent animationType="fade" onRequestClose={skipHeight}>
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={skipHeight} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xxl }]}>
            <Text style={styles.sheetTitle}>Ceiling height for this floor? (optional)</Text>
            <Text style={styles.emptyHint}>
              Applied to every room on this floor — adjust any single room later from its own screen. Skip if it varies room to room.
            </Text>
            <View style={styles.calibInputRow}>
              <TextInput
                style={styles.calibInput}
                value={heightText}
                onChangeText={setHeightText}
                placeholder="2.4"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveFloorHeight}
              />
              <Text style={styles.calibUnit}>metres</Text>
            </View>
            <View style={styles.calibBtnRow}>
              <Pressable onPress={skipHeight} style={styles.sheetCancel}>
                <Text style={styles.sheetCancelText}>Skip</Text>
              </Pressable>
              <Pressable onPress={saveFloorHeight} style={styles.calibSaveBtn}>
                <Text style={styles.calibSaveBtnText}>Save height</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  headerTitleOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  sub: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 1 },
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

  canvas: { flex: 1, position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: space.md },
  scaleStatus: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: space.sm },

  calibInputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  calibInput: {
    flex: 1, backgroundColor: colors.ground, color: colors.textPrimary,
    borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, fontSize: 16,
  },
  calibUnit: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  calibBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  calibSaveBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.sm },
  calibSaveBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

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
