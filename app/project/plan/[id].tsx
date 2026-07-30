/**
 * Floor-plan viewer and wall tracer.
 *
 * Route id = the FLOOR's location id (a top-level Location). Three modes:
 *  - View: pinch-zoom/pan the imported plan image; tap a wall to open its
 *    detail screen (attach/view its photo, place electrical symbols there —
 *    see app/project/wall/[id].tsx).
 *  - Trace walls: place → adjust → confirm. Taps place endpoint rings that
 *    can be dragged to fine-tune (with a magnifier loupe while dragging)
 *    before "Save wall" commits; tapping the middle of an existing wall
 *    selects it for editing (drag its endpoints, delete it, open it).
 *  - Calibrate: same two-ring line over a known distance, then type what it
 *    really measures.
 *
 * Wall selection/point placement is handled entirely inside the shared tap
 * gesture (not a nested Pressable) — a native Pressable nested inside a
 * GestureDetector's target view competes with that detector's own
 * recognizers for the same touches, which made wall taps register
 * unreliably. Routing every touch through the one gesture layer avoids that.
 * For the same reason the endpoint handles aren't their own touchables: the
 * pan gesture hit-tests against handle positions itself on begin, and either
 * drags a handle or pans the zoomed image.
 *
 * Pinch-zoom and one-finger pan (while zoomed) work in every mode (reset to
 * scale=1/translate=0 whenever the mode is switched). gesture-handler's
 * e.x/e.y are always relative to the canvas's untransformed layout, not its
 * visually zoomed/panned position, so every touch is first projected back
 * through the current scale+translate (see unscaleContainerPoint) before
 * being converted to a normalized image point. The canvas clips its contents
 * (`overflow: 'hidden'`) so a zoomed-in image can't visually bleed over the
 * header/mode-toggle above it and steal their touches. The endpoint handles
 * and the loupe render OUTSIDE the transformed view (positions derived from
 * the same shared values) so they keep a constant on-screen size at any
 * zoom.
 */
import React, { useCallback, useRef, useState } from 'react';
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
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';
import type { Project, Location, Wall, WallSymbol } from '@/src/domain/types';
import { loadProjects, loadLocation, loadLocations, setLocationHeight } from '@/src/data/project-repo';
import {
  loadFloorPlanForLocation, addFloorPlan, updateFloorPlanFile, deleteFloorPlan,
  addWall, loadWallsForFloorPlan, loadWallSymbolsForFloorPlan, setFloorPlanScale,
  updateWallEndpoints, deleteWall,
} from '@/src/data/floor-plan-repo';
import { loadPhoto, deleteLocationPhoto } from '@/src/data/photo-repo';
import { deletePhoto } from '@/src/media/camera-service';
import { importFloorPlanImage, deleteFloorPlanImage } from '@/src/media/floor-plan-service';
import { SimpleCameraCapture } from '@/src/ui/photos/SimpleCameraCapture';
import {
  containerPointToImageNorm, imageNormToContainerPoint, imageFitRect,
  findNearestWall, wallPointAt, calibrateScale, wallLengthMeters, snapDraftPoint,
  type Point,
} from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type Mode = 'view' | 'trace' | 'calibrate';
type DragTarget = 'draftA' | 'draftB' | 'selStart' | 'selEnd';

/** Calibration line colour — must read as "not a wall" next to accent-blue walls. */
const CALIB_COLOR = '#E8590C';
/** Handle border while magnet-snapped onto another wall's endpoint. */
const SNAP_COLOR = '#12B76A';

/** Screen-pixel finger tolerances (converted to the right space where used). */
const GRAB_RADIUS_PX = 34;
const ENDPOINT_SNAP_PX = 14;
const AXIS_SNAP_PX = 7;
/** Selecting an existing wall: how close (fraction of plan diagonal) and how
 * central along the wall the tap must be — taps near a wall's ENDS place a
 * new (corner-snapped) point instead, so tracing can continue from corners. */
const SELECT_WALL_MAX_DISTANCE = 0.02;
const SELECT_WALL_MID_BAND: [number, number] = [0.2, 0.8];

const LOUPE_SIZE = 120;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function WallLine({ start, end, color, thickness = 3, opacity = 0.9 }: {
  start: Point; end: Point; color: string; thickness?: number; opacity?: number;
}) {
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
        top: midY - thickness / 2,
        width: len,
        height: thickness,
        backgroundColor: color,
        opacity,
        borderRadius: thickness / 2,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

/**
 * Endpoint ring rendered OUTSIDE the zoomed view so it keeps a constant
 * on-screen size — its position tracks the zoom/pan transform via the same
 * shared values, on the UI thread.
 */
function ScreenHandle({ point, containerSize, scale, translateX, translateY, color }: {
  point: Point; // unscaled container coords
  containerSize: { width: number; height: number };
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const s = scale.value;
    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;
    return {
      transform: [
        { translateX: (point.x - cx) * s + cx + translateX.value },
        { translateY: (point.y - cy) * s + cy + translateY.value },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.handle, { borderColor: color }, style]}>
      <View style={[styles.handleDot, { backgroundColor: color }]} />
    </Animated.View>
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
  const [cameraOpen, setCameraOpen] = useState(false);

  const [mode, setModeState] = useState<Mode>('view');
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });

  // The line being placed (trace or calibrate — cleared on mode switch).
  // Mirrored into a ref so gesture callbacks mid-drag never act on a stale
  // closure's copy.
  const [draft, setDraftState] = useState<{ a: Point | null; b: Point | null }>({ a: null, b: null });
  const draftRef = useRef(draft);
  const setDraft = (d: { a: Point | null; b: Point | null }) => { draftRef.current = d; setDraftState(d); };

  // Existing wall selected for editing (trace mode) — a local editable copy
  // of its endpoints; persisted on each drag end.
  const [selected, setSelectedState] = useState<{ id: string; start: Point; end: Point } | null>(null);
  const selectedRef = useRef(selected);
  const setSelected = (s: { id: string; start: Point; end: Point } | null) => { selectedRef.current = s; setSelectedState(s); };

  // Active handle drag (drives the loupe). startNorm anchors relative
  // dragging: the ring moves by the finger's DELTA, so the finger can sit
  // beside the ring instead of covering it.
  const dragRef = useRef<{ target: DragTarget; startNorm: Point; magnification: number } | null>(null);
  const [drag, setDrag] = useState<{ target: DragTarget; magnification: number; snapped: boolean } | null>(null);

  const [roomPickerOpen, setRoomPickerOpen] = useState(false);

  const [calibPromptOpen, setCalibPromptOpen] = useState(false);
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
    setDraft({ a: null, b: null });
    setSelected(null);
    dragRef.current = null;
    setDrag(null);
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

  const importPlanFromUri = async (uri: string) => {
    if (!floor) return;
    setImporting(true);
    try {
      const newId = await addFloorPlan(floor.projectId, floor.id, '', 0, 0);
      const { filePath, width, height } = await importFloorPlanImage(uri, mediaPaths, floor.projectId, newId);
      await updateFloorPlanFile(newId, filePath, width, height);
      await reload();
    } catch (e) {
      Alert.alert('Import failed', String(e));
    } finally {
      setImporting(false);
    }
  };

  const pickFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets.length) return;
    await importPlanFromUri(result.assets[0]!.uri);
  };

  const handlePlanCaptured = async (uri: string) => {
    setCameraOpen(false);
    await importPlanFromUri(uri);
  };

  const promptImportPlan = () => {
    Alert.alert('Add floor plan', undefined, [
      { text: 'Take a photo', onPress: () => setCameraOpen(true) },
      { text: 'Choose from files', onPress: pickFromFiles },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
            await reload();
            promptImportPlan();
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

  // ── Snapping ─────────────────────────────────────────────────────────────

  /** Snap a normalized point against other walls' endpoints + its own line's
   * other end. Thresholds are given in screen pixels and converted to image
   * pixels at the current zoom, so the magnet feel is constant on screen. */
  const snapNorm = (raw: Point, anchor: Point | null, excludeWallId?: string) => {
    const rect = imageFitRect(containerSize, imageSize);
    if (rect.width <= 0) return { point: raw, snappedToEndpoint: false, snappedAxis: null };
    const imgPxPerScreenPx = imageSize.width / (rect.width * scale.value);
    const magnets: Point[] = [];
    for (const w of walls) {
      if (w.id === excludeWallId) continue;
      magnets.push(w.start, w.end);
    }
    return snapDraftPoint(
      raw, anchor, magnets, imageSize,
      ENDPOINT_SNAP_PX * imgPxPerScreenPx,
      AXIS_SNAP_PX * imgPxPerScreenPx,
    );
  };

  // ── Taps ─────────────────────────────────────────────────────────────────

  const handleTraceTap = (norm: Point) => {
    if (selectedRef.current) {
      // editing a wall — any tap away finishes the edit (drags already saved)
      setSelected(null);
      return;
    }
    const d = draftRef.current;
    if (d.a && d.b) return; // waiting on Save/Cancel — drag the rings to adjust
    if (!d.a) {
      // Tapping an existing wall's MIDDLE selects it for editing; tapping near
      // its ends starts a new wall from that (snapped) corner instead.
      const nearest = findNearestWall(norm, walls);
      if (
        nearest && nearest.distance <= SELECT_WALL_MAX_DISTANCE &&
        nearest.positionAlongWall >= SELECT_WALL_MID_BAND[0] &&
        nearest.positionAlongWall <= SELECT_WALL_MID_BAND[1]
      ) {
        setSelected({
          id: nearest.wall.id,
          start: { ...nearest.wall.start },
          end: { ...nearest.wall.end },
        });
        return;
      }
      setDraft({ a: snapNorm(norm, null).point, b: null });
    } else {
      setDraft({ a: d.a, b: snapNorm(norm, d.a).point });
    }
  };

  const handleCalibrateTap = (norm: Point) => {
    const d = draftRef.current;
    if (d.a && d.b) return;
    if (!d.a) setDraft({ a: snapNorm(norm, null).point, b: null });
    else setDraft({ a: d.a, b: snapNorm(norm, d.a).point });
  };

  const handleViewTap = (norm: Point) => {
    const nearest = findNearestWall(norm, walls);
    if (nearest && nearest.distance <= 0.05) {
      router.push(`/project/wall/${nearest.wall.id}` as any);
    }
  };

  // ── Draft actions ────────────────────────────────────────────────────────

  const undoPoint = () => {
    const d = draftRef.current;
    if (d.b) setDraft({ a: d.a, b: null });
    else setDraft({ a: null, b: null });
  };

  const cancelDraft = () => setDraft({ a: null, b: null });

  const draftLengthM = (): number | null => {
    const d = draft;
    if (!d.a || !d.b || !floorPlan?.pxPerMeter) return null;
    return wallLengthMeters({ start: d.a, end: d.b }, imageSize, floorPlan.pxPerMeter);
  };

  const commitWall = async (roomId: string) => {
    const d = draftRef.current;
    if (!floorPlan || !d.a || !d.b) return;
    const label = `Wall ${walls.length + 1}`;
    const newWallId = await addWall(floorPlan.id, roomId, d.a, d.b, label);
    setRoomPickerOpen(false);
    setDraft({ a: null, b: null });
    // Straight to the photo-attach prompt — no separate trip back through
    // View mode to find and tap the wall you just traced.
    router.push(`/project/wall/${newWallId}` as any);
  };

  // ── Selected-wall actions ────────────────────────────────────────────────

  const selectedWallRow = selected ? walls.find((w) => w.id === selected.id) ?? null : null;

  const selectedLengthM = (): number | null => {
    if (!selected || !floorPlan?.pxPerMeter) return null;
    return wallLengthMeters({ start: selected.start, end: selected.end }, imageSize, floorPlan.pxPerMeter);
  };

  const confirmDeleteSelected = () => {
    const sel = selectedRef.current;
    if (!sel) return;
    Alert.alert('Delete wall?', 'This wall, its tagged symbols, and its photo will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { deletedPhotoId } = await deleteWall(sel.id);
          if (deletedPhotoId) {
            const p = await loadPhoto(deletedPhotoId);
            await deleteLocationPhoto(deletedPhotoId);
            if (p) await deletePhoto(p);
          }
          setSelected(null);
          await reload();
        },
      },
    ]);
  };

  // ── Calibration ──────────────────────────────────────────────────────────

  const cancelCalibrationPrompt = () => {
    setCalibPromptOpen(false);
    setCalibDistanceText('');
  };

  /** Live sanity read on the typed distance — how wide the whole plan would
   * come out. Catches an off-by-10x or wrong-line mistake before it poisons
   * every measurement on the floor. */
  const calibPlanWidthM = (): number | null => {
    const d = draft;
    const meters = parseFloat(calibDistanceText);
    if (!d.a || !d.b || !Number.isFinite(meters) || meters <= 0) return null;
    const pxPerMeter = calibrateScale(d.a, d.b, imageSize, meters);
    if (pxPerMeter <= 0) return null;
    return imageSize.width / pxPerMeter;
  };

  const commitCalibration = async () => {
    const d = draftRef.current;
    if (!floorPlan || !d.a || !d.b) return;
    const meters = parseFloat(calibDistanceText);
    if (!Number.isFinite(meters) || meters <= 0) {
      Alert.alert('Enter a distance', 'Type how many metres long the marked line really is.');
      return;
    }
    const pxPerMeter = calibrateScale(d.a, d.b, imageSize, meters);
    await setFloorPlanScale(floorPlan.id, pxPerMeter);
    setCalibPromptOpen(false);
    setCalibDistanceText('');
    setDraft({ a: null, b: null });
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

  // ── Gestures ─────────────────────────────────────────────────────────────

  // Gesture-handler reports touch x/y relative to the canvas's own unscaled
  // layout — the pinch/pan transform below only visually magnifies/shifts
  // the image, it doesn't change that layout. So a raw touch while zoomed
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

  // One pan gesture, two jobs, decided on touch-down: begin near an endpoint
  // ring → drag that ring (with loupe); otherwise → pan the zoomed image.
  // Runs on the JS thread because handle dragging is React state.
  const panStart = (x: number, y: number) => {
    const s = scale.value;
    const unscaled = unscaleContainerPoint(x, y);
    const candidates: { target: DragTarget; norm: Point }[] = [];
    if (mode !== 'view') {
      const d = draftRef.current;
      if (d.a) candidates.push({ target: 'draftA', norm: d.a });
      if (d.b) candidates.push({ target: 'draftB', norm: d.b });
      const sel = selectedRef.current;
      if (mode === 'trace' && sel) {
        candidates.push({ target: 'selStart', norm: sel.start });
        candidates.push({ target: 'selEnd', norm: sel.end });
      }
    }
    let best: { target: DragTarget; norm: Point } | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const pos = imageNormToContainerPoint(c.norm, containerSize, imageSize);
      const dist = Math.hypot(pos.x - unscaled.x, pos.y - unscaled.y);
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    if (best && bestDist <= GRAB_RADIUS_PX / s) {
      const magnification = Math.min(Math.max(s * 2.5, 3), 10);
      dragRef.current = { target: best.target, startNorm: { ...best.norm }, magnification };
      setDrag({ target: best.target, magnification, snapped: false });
    } else {
      dragRef.current = null;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    }
  };

  const panUpdate = (translationX: number, translationY: number) => {
    const dr = dragRef.current;
    const s = scale.value;
    if (dr) {
      const rect = imageFitRect(containerSize, imageSize);
      if (rect.width <= 0 || rect.height <= 0) return;
      const raw = {
        x: clamp01(dr.startNorm.x + translationX / s / rect.width),
        y: clamp01(dr.startNorm.y + translationY / s / rect.height),
      };
      const d = draftRef.current;
      const sel = selectedRef.current;
      if (dr.target === 'draftA' || dr.target === 'draftB') {
        const anchor = dr.target === 'draftA' ? d.b : d.a;
        const snap = snapNorm(raw, anchor);
        if (dr.target === 'draftA') setDraft({ a: snap.point, b: d.b });
        else setDraft({ a: d.a, b: snap.point });
        setDrag((prev) => (prev ? { ...prev, snapped: snap.snappedToEndpoint } : prev));
      } else if (sel) {
        const anchor = dr.target === 'selStart' ? sel.end : sel.start;
        const snap = snapNorm(raw, anchor, sel.id);
        if (dr.target === 'selStart') setSelected({ ...sel, start: snap.point });
        else setSelected({ ...sel, end: snap.point });
        setDrag((prev) => (prev ? { ...prev, snapped: snap.snappedToEndpoint } : prev));
      }
    } else {
      if (s <= 1) return; // nothing to pan when not zoomed
      translateX.value = clampTranslate(savedTranslateX.value + translationX, containerSize.width, s);
      translateY.value = clampTranslate(savedTranslateY.value + translationY, containerSize.height, s);
    }
  };

  const panFinalize = () => {
    const dr = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (dr && (dr.target === 'selStart' || dr.target === 'selEnd')) {
      const sel = selectedRef.current;
      if (sel) {
        updateWallEndpoints(sel.id, sel.start, sel.end);
        // keep the walls list in step so symbols/lines don't jump on Done
        setWalls((ws) => ws.map((w) => (w.id === sel.id ? { ...w, start: sel.start, end: sel.end } : w)));
      }
    }
  };

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .maxPointers(1)
    .onStart((e) => panStart(e.x, e.y))
    .onUpdate((e) => panUpdate(e.translationX, e.translationY))
    .onFinalize(() => panFinalize());

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

  // ── Derived render helpers ───────────────────────────────────────────────

  /** Selected wall renders (line + its symbols) from the live edited copy. */
  const wallGeometry = (w: Wall): { start: Point; end: Point } =>
    selected && selected.id === w.id ? selected : w;

  const toContainer = (p: Point) => imageNormToContainerPoint(p, containerSize, imageSize);

  const activeDragNorm = (): Point | null => {
    if (!drag) return null;
    if (drag.target === 'draftA') return draft.a;
    if (drag.target === 'draftB') return draft.b;
    if (drag.target === 'selStart') return selected?.start ?? null;
    return selected?.end ?? null;
  };

  const fmtM = (m: number) => `${m.toFixed(2)} m`;

  const draftColor = mode === 'calibrate' ? CALIB_COLOR : colors.accent;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  if (!floor) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
        </View>
        <Text style={styles.empty}>Floor not found.</Text>
      </SafeAreaView>
    );
  }

  // ── Loupe geometry (only while dragging) ─────────────────────────────────
  const dragNorm = activeDragNorm();
  let loupe: { left: number; top: number; m: number; point: Point; lineA: Point | null; lineB: Point | null } | null = null;
  if (drag && dragNorm) {
    const p = toContainer(dragNorm); // unscaled container coords
    const s = scale.value;
    const vx = (p.x - containerSize.width / 2) * s + containerSize.width / 2 + translateX.value;
    const vy = (p.y - containerSize.height / 2) * s + containerSize.height / 2 + translateY.value;
    const left = vx < containerSize.width / 2 ? containerSize.width - LOUPE_SIZE - space.md : space.md;
    const top = vy < LOUPE_SIZE + 80 ? containerSize.height - LOUPE_SIZE - space.md : space.md;
    const pair: { a: Point | null; b: Point | null } =
      drag.target === 'selStart' || drag.target === 'selEnd'
        ? { a: selected?.start ?? null, b: selected?.end ?? null }
        : draft;
    loupe = {
      left, top, m: drag.magnification, point: p,
      lineA: pair.a ? toContainer(pair.a) : null,
      lineB: pair.b ? toContainer(pair.b) : null,
    };
  }

  // ── Bottom action bar content ────────────────────────────────────────────
  const renderActionBar = () => {
    if (mode === 'view') {
      return <Text style={styles.hint}>Pinch to zoom · Tap a wall to open its photo & symbols</Text>;
    }

    if (mode === 'trace' && selected) {
      const len = selectedLengthM();
      return (
        <View style={styles.barRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.barTitle} numberOfLines={1}>{selectedWallRow?.label || 'Wall'}</Text>
            <Text style={styles.barSub}>{len != null ? fmtM(len) : 'Drag the rings to move it'}</Text>
          </View>
          <Pressable onPress={confirmDeleteSelected} hitSlop={8} style={styles.barBtnPlain}>
            <Text style={[styles.barBtnPlainText, { color: colors.danger }]}>Delete</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/project/wall/${selected.id}` as any)} hitSlop={8} style={styles.barBtnPlain}>
            <Text style={styles.barBtnPlainText}>Open ›</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.barBtnPrimary}>
            <Text style={styles.barBtnPrimaryText}>Done</Text>
          </Pressable>
        </View>
      );
    }

    const isCalib = mode === 'calibrate';
    if (!draft.a) {
      return (
        <Text style={styles.hint}>
          {isCalib
            ? 'Tap both ends of a known distance — a dimension printed on the plan, or one you measured on site'
            : 'Tap one end of a wall · Tap the middle of a traced wall to edit it'}
        </Text>
      );
    }
    if (!draft.b) {
      return (
        <View style={styles.barRow}>
          <Text style={[styles.hint, { flex: 1, textAlign: 'left', paddingVertical: 0 }]}>
            Tap the other end — or drag the ring to adjust
          </Text>
          <Pressable onPress={undoPoint} hitSlop={8} style={styles.barBtnPlain}>
            <Text style={styles.barBtnPlainText}>Undo</Text>
          </Pressable>
        </View>
      );
    }
    const len = draftLengthM();
    return (
      <View style={styles.barRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.barTitle}>
            {isCalib ? 'Line marked' : len != null ? fmtM(len) : 'Wall marked'}
          </Text>
          <Text style={styles.barSub}>Drag the rings to fine-tune</Text>
        </View>
        <Pressable onPress={cancelDraft} hitSlop={8} style={styles.barBtnPlain}>
          <Text style={[styles.barBtnPlainText, { color: colors.danger }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => (isCalib ? setCalibPromptOpen(true) : setRoomPickerOpen(true))}
          hitSlop={8}
          style={styles.barBtnPrimary}
        >
          <Text style={styles.barBtnPrimaryText}>{isCalib ? 'Set distance' : 'Save wall'}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
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
            <Pressable style={styles.importBtn} onPress={promptImportPlan} disabled={importing}>
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
                ? `Scale set — plan ≈ ${(imageSize.width / floorPlan.pxPerMeter).toFixed(1)} m across`
                : 'No scale yet — use Calibrate so wall and room sizes can be worked out'}
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
                      const planPoint = wallPointAt(wallGeometry(wall), sym.positionAlongWall);
                      const pixel = toContainer(planPoint);
                      return (
                        <PlacedSymbolGroup
                          key={sym.id}
                          symbol={{ id: sym.id, type: sym.type, x: pixel.x, y: pixel.y, color: sym.color ?? '#FFFFFF' }}
                        />
                      );
                    })}
                  </Svg>

                  {walls.map((wall) => {
                    const geom = wallGeometry(wall);
                    const isSelected = selected?.id === wall.id;
                    return (
                      <WallLine
                        key={wall.id}
                        start={toContainer(geom.start)}
                        end={toContainer(geom.end)}
                        color={isSelected ? colors.accentSecondary : colors.accent}
                        thickness={isSelected ? 4 : 3}
                      />
                    );
                  })}

                  {draft.a && draft.b && (
                    <WallLine start={toContainer(draft.a)} end={toContainer(draft.b)} color={draftColor} thickness={4} />
                  )}
                </Animated.View>

                {/* Endpoint rings — constant screen size at any zoom (they sit
                    outside the transformed view and track it via shared values) */}
                {draft.a && (
                  <ScreenHandle
                    point={toContainer(draft.a)} containerSize={containerSize}
                    scale={scale} translateX={translateX} translateY={translateY}
                    color={drag?.target === 'draftA' && drag.snapped ? SNAP_COLOR : draftColor}
                  />
                )}
                {draft.b && (
                  <ScreenHandle
                    point={toContainer(draft.b)} containerSize={containerSize}
                    scale={scale} translateX={translateX} translateY={translateY}
                    color={drag?.target === 'draftB' && drag.snapped ? SNAP_COLOR : draftColor}
                  />
                )}
                {mode === 'trace' && selected && (
                  <>
                    <ScreenHandle
                      point={toContainer(selected.start)} containerSize={containerSize}
                      scale={scale} translateX={translateX} translateY={translateY}
                      color={drag?.target === 'selStart' && drag.snapped ? SNAP_COLOR : colors.accentSecondary}
                    />
                    <ScreenHandle
                      point={toContainer(selected.end)} containerSize={containerSize}
                      scale={scale} translateX={translateX} translateY={translateY}
                      color={drag?.target === 'selEnd' && drag.snapped ? SNAP_COLOR : colors.accentSecondary}
                    />
                  </>
                )}

                {/* Magnifier loupe while dragging a ring — shows the plan
                    around the point at extra zoom, with a crosshair, so the
                    finger never hides what it's placing. */}
                {loupe && (
                  <View pointerEvents="none" style={[styles.loupe, { left: loupe.left, top: loupe.top }]}>
                    <View
                      style={{
                        position: 'absolute',
                        left: LOUPE_SIZE / 2 - loupe.point.x * loupe.m,
                        top: LOUPE_SIZE / 2 - loupe.point.y * loupe.m,
                        width: containerSize.width * loupe.m,
                        height: containerSize.height * loupe.m,
                      }}
                    >
                      <Image
                        source={{ uri: floorPlan.filePath }}
                        style={StyleSheet.absoluteFill}
                        contentFit="contain"
                      />
                      {loupe.lineA && loupe.lineB && (
                        <WallLine
                          start={{ x: loupe.lineA.x * loupe.m, y: loupe.lineA.y * loupe.m }}
                          end={{ x: loupe.lineB.x * loupe.m, y: loupe.lineB.y * loupe.m }}
                          color={drag && (drag.target === 'selStart' || drag.target === 'selEnd') ? colors.accentSecondary : draftColor}
                          thickness={3}
                          opacity={0.7}
                        />
                      )}
                    </View>
                    <View style={styles.loupeCrossV} />
                    <View style={styles.loupeCrossH} />
                  </View>
                )}
              </View>
            </GestureDetector>

            <View style={styles.actionBar}>{renderActionBar()}</View>
          </>
        )}
      </SafeAreaView>

      <SimpleCameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={handlePlanCaptured}
      />

      {/* Room picker — after Save wall. Modal, not an inline sibling View: a
          flex:1 sibling of the SafeAreaView above would split the screen's
          height with it as soon as it appears, squeezing the plan canvas
          underneath. Cancelling keeps the marked line so it can be re-saved. */}
      <Modal visible={roomPickerOpen} transparent animationType="fade" onRequestClose={() => setRoomPickerOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setRoomPickerOpen(false)}>
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
            <Pressable onPress={() => setRoomPickerOpen(false)} style={styles.sheetCancel}>
              <Text style={[styles.sheetCancelText, { color: colors.danger }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Calibration prompt — the marked line's real-world length. */}
      <Modal visible={calibPromptOpen} transparent animationType="fade" onRequestClose={cancelCalibrationPrompt}>
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={cancelCalibrationPrompt} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xxl }]}>
            <Text style={styles.sheetTitle}>How long is the marked line?</Text>
            <Text style={styles.emptyHint}>
              Use a dimension printed on the plan, or a distance you've measured on site.
            </Text>
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
            {(() => {
              const w = calibPlanWidthM();
              return w != null ? (
                <Text style={styles.calibSanity}>
                  Sanity check: that makes the whole plan ≈ {w.toFixed(1)} m across
                  {floorPlan?.pxPerMeter ? ' (replaces the current scale)' : ''}.
                </Text>
              ) : null;
            })()}
            <View style={styles.calibBtnRow}>
              <Pressable onPress={cancelCalibrationPrompt} style={styles.sheetCancel}>
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

  actionBar: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  barTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  barSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  barBtnPlain: { paddingVertical: space.sm },
  barBtnPlainText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  barBtnPrimary: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  barBtnPrimaryText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },

  handle: {
    position: 'absolute', left: -14, top: -14, width: 28, height: 28, borderRadius: 14,
    borderWidth: 3, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  handleDot: { width: 4, height: 4, borderRadius: 2 },

  loupe: {
    position: 'absolute', width: LOUPE_SIZE, height: LOUPE_SIZE, borderRadius: LOUPE_SIZE / 2,
    overflow: 'hidden', borderWidth: 2, borderColor: colors.accent, backgroundColor: '#fff',
    elevation: 6,
  },
  loupeCrossV: {
    position: 'absolute', left: LOUPE_SIZE / 2 - 0.5, top: LOUPE_SIZE / 2 - 14,
    width: 1, height: 28, backgroundColor: 'rgba(11,18,32,0.7)',
  },
  loupeCrossH: {
    position: 'absolute', top: LOUPE_SIZE / 2 - 0.5, left: LOUPE_SIZE / 2 - 14,
    height: 1, width: 28, backgroundColor: 'rgba(11,18,32,0.7)',
  },

  calibInputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  calibInput: {
    flex: 1, backgroundColor: colors.ground, color: colors.textPrimary,
    borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, fontSize: 16,
  },
  calibUnit: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  calibSanity: { color: colors.textSecondary, fontSize: 12, marginTop: space.sm, lineHeight: 17 },
  calibBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  calibSaveBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.sm },
  calibSaveBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },

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
