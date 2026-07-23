/**
 * PhotoMeasureSheet — camera-based room measurement.
 *
 * Flow:
 *   1. Take a photo of a wall (include a socket, switch plate or door frame).
 *   2. Tap the left + right edges of a known reference object.
 *   3. Pick what that object is (sets the scale in mm).
 *   4. Tap the left + right ends of the wall you want to measure.
 *   5. Label the result as "Length" or "Width" of the room.
 *   6. Repeat for the other dimension.
 *   7. Adjust circuit toggles → "Add X lines to room".
 *
 * All maths is a pixel ratio: wall_m = (wall_px / ref_px) × ref_mm / 1000.
 * No native modules, no ARCore — just expo-camera and geometry.
 */
import React, { useState, useRef, useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  Modal, View, Text, Pressable, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { calcCableRuns, type CircuitType } from '../../domain/cable-calc';
import { lineFromMaterial } from '../../data/estimate-service';
import { setLocationMeasurements } from '../../data/project-repo';
import { useCameraOrientation } from '../../media/useCameraOrientation';
import type { LineItem, Material } from '../../domain/types';
import { colors, space, radius } from '../theme/tokens';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

type Step =
  | 'camera'    // live camera, waiting to shoot
  | 'ref-a'     // tap left edge of reference object
  | 'ref-b'     // tap right edge of reference object
  | 'ref-pick'  // choose what that object is
  | 'wall-a'    // tap left end of wall
  | 'wall-b'    // tap right end of wall
  | 'assign'    // label measurement as length or width
  | 'estimate'; // cable estimate + add to room

const REF_OPTIONS = [
  { label: 'Single socket / switch',  mm: 86 },
  { label: 'Double socket',           mm: 146 },
  { label: 'Standard door (762mm)',   mm: 762 },
  { label: 'Wide door (838mm)',       mm: 838 },
] as const;

const INSTRUCT: Partial<Record<Step, string>> = {
  'ref-a':  'Tap the LEFT edge of a socket, switch plate, or door frame. Pinch to zoom in for accuracy.',
  'ref-b':  'Tap the RIGHT edge of the same object.',
  'wall-a': 'Good. Now tap the LEFT end of the wall you want to measure.',
  'wall-b': 'Tap the RIGHT end of that wall.',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dist(a: Pt, b: Pt) { return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2); }

function calcMetres(refA: Pt, refB: Pt, refMm: number, wallA: Pt, wallB: Pt): number {
  const refPx = dist(refA, refB);
  if (refPx < 2) return 0;
  const wallMm = (dist(wallA, wallB) / refPx) * refMm;
  return Math.round(wallMm / 100) / 10; // nearest 0.1 m
}

function findCable(mats: Material[], spec: '2.5mm T+E' | '1.5mm T+E') {
  const key = spec.split(' ')[0].toLowerCase();
  return mats.find((m) => m.unit === 'm' && m.description.toLowerCase().includes(key));
}

// ─── Tiny marker components ───────────────────────────────────────────────────

function Dot({ pt, color, num }: { pt: Pt; color: string; num: number }) {
  return (
    <View pointerEvents="none" style={[styles.dot, { left: pt.x - 10, top: pt.y - 10, backgroundColor: color }]}>
      <Text style={styles.dotNum}>{num}</Text>
    </View>
  );
}

function SegLine({ a, b, color }: { a: Pt; b: Pt; color: string }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (a.x + b.x) / 2 - len / 2,
        top:  (a.y + b.y) / 2 - 1.5,
        width: len, height: 3,
        backgroundColor: color, opacity: 0.85,
        transform: [{ rotate: `${ang}deg` }],
      }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  roomName: string;
  locationId: string;
  materials: Material[];
  onAdd: (lines: LineItem[]) => void;
  onClose: () => void;
}

export function PhotoMeasureSheet({ visible, roomName, locationId, materials, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Unlocks rotation while this sheet is open so a wall photo taken with the
  // phone turned sideways actually comes out landscape, instead of always
  // being forced into the app's fixed portrait orientation.
  useCameraOrientation(visible);

  // Core state
  const [step, setStep]       = useState<Step>('camera');
  const [photoUri, setPhoto]  = useState<string | null>(null);
  const [pts, setPts]         = useState<Pt[]>([]);   // [refA, refB, wallA, wallB]
  const [refMm, setRefMm]     = useState(86);
  const [lengthM, setLengthM] = useState<number | null>(null);
  const [widthM, setWidthM]   = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Estimate toggles
  const [ring, setRing]       = useState(true);
  const [lighting, setLighting] = useState(true);
  const [buf, setBuf]         = useState(true);

  // Belt-and-suspenders: on some devices the orientation lock reasserts
  // itself back to portrait the moment the CameraView unmounts (leaving the
  // 'camera' step), even though useCameraOrientation's own unlock is still
  // active — re-unlock on every step change while the sheet is open so the
  // photo-marking/zoom view can stay landscape too.
  useEffect(() => {
    if (visible) ScreenOrientation.unlockAsync();
  }, [visible, step]);

  // ── Pinch-zoom / pan on the captured photo, so ref/wall points can be
  // tapped precisely instead of at whatever accuracy the full-screen photo
  // allows. Same scale-about-centre + translate approach as the floor-plan
  // tracer (app/project/plan/[id].tsx) — see unscaleContainerPoint below.
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = () => {
    scale.value = 1; savedScale.value = 1;
    translateX.value = 0; translateY.value = 0;
    savedTranslateX.value = 0; savedTranslateY.value = 0;
  };

  // ── Resets ──────────────────────────────────────────────────────────────────
  const resetAll = () => {
    setStep('camera'); setPhoto(null); setPts([]); setRefMm(86);
    setLengthM(null); setWidthM(null); setCapturing(false);
    resetZoom();
  };

  const resetMeasurement = () => { setPhoto(null); setPts([]); setRefMm(86); setStep('camera'); resetZoom(); };

  const handleClose = () => { resetAll(); onClose(); };

  // ── Camera ──────────────────────────────────────────────────────────────────
  const shoot = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert('Camera needed', 'Allow camera access in Settings.'); return; }
    }
    if (!cameraRef.current) return;
    try {
      setCapturing(true);
      const res = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: true });
      if (res?.uri) { setPhoto(res.uri); setStep('ref-a'); }
    } catch { Alert.alert('Capture failed', 'Please try again.'); }
    finally { setCapturing(false); }
  };

  // ── Tap handler on photo overlay ─────────────────────────────────────────
  // Gesture-handler reports tap x/y relative to the canvas's own unscaled
  // layout — the pinch/pan transform below only visually magnifies/shifts
  // the image, it doesn't change that layout. So a raw tap while zoomed
  // and/or panned lands on the wrong spot unless it's first projected back
  // through the same scale-about-centre-then-translate the image was given.
  const unscaleContainerPoint = (x: number, y: number): Pt => {
    const s = scale.value;
    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;
    return {
      x: (x - translateX.value - cx) / s + cx,
      y: (y - translateY.value - cy) / s + cy,
    };
  };

  // pts are stored NORMALIZED (0-1 of containerSize at tap time), not raw
  // pixels — the instruction banner's text is a different length on each
  // step (ref-a's is longer than ref-b's, etc.), so the photo area's actual
  // pixel size can change between the two taps of a pair. A stored raw pixel
  // point doesn't move when that happens, but the photo underneath does, so
  // the marker visibly drifts off the spot that was tapped. Denormalize
  // against the CURRENT containerSize (denormPt, below) whenever a point is
  // used, so all points are interpreted in one consistent frame regardless
  // of what containerSize was when each was individually captured.
  const denormPt = (p: Pt): Pt => ({ x: p.x * containerSize.width, y: p.y * containerSize.height });

  const handleTap = (containerX: number, containerY: number) => {
    const px = unscaleContainerPoint(containerX, containerY);
    const norm: Pt = { x: px.x / containerSize.width, y: px.y / containerSize.height };
    const newPts = [...pts, norm];
    setPts(newPts);
    if (step === 'ref-a')  { setStep('ref-b'); return; }
    if (step === 'ref-b')  { setStep('ref-pick'); return; }
    if (step === 'wall-a') { setStep('wall-b'); return; }
    if (step === 'wall-b') { setStep('assign'); return; }
  };

  // Max pan offset (raw screen pixels, matching translateX/Y — translate is
  // applied on top of scale, unscaled) that keeps the image from drifting
  // fully off-canvas.
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
      translateX.value = clampTranslate(savedTranslateX.value + e.translationX, containerSize.width, scale.value);
      translateY.value = clampTranslate(savedTranslateY.value + e.translationY, containerSize.height, scale.value);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withSpring(1);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  // ── Measured value ────────────────────────────────────────────────────────
  const measuredM = (step === 'assign' && pts.length === 4)
    ? calcMetres(denormPt(pts[0]), denormPt(pts[1]), refMm, denormPt(pts[2]), denormPt(pts[3]))
    : null;

  // ── Assign a role to the measurement ─────────────────────────────────────
  const assign = (role: 'length' | 'width') => {
    if (!measuredM) return;
    const newL = role === 'length' ? measuredM : lengthM;
    const newW = role === 'width'  ? measuredM : widthM;
    if (role === 'length') setLengthM(measuredM); else setWidthM(measuredM);
    if (newL && newW) {
      setStep('estimate');
      if (locationId) {
        setLocationMeasurements(locationId, newL, newW).catch((e) => {
          console.error('Could not save room measurements', e);
          Alert.alert('Could not save room size', String(e));
        });
      }
    } else {
      resetMeasurement();  // measure the other wall
    }
  };

  // ── Cable lines ──────────────────────────────────────────────────────────
  const circuits = new Set<CircuitType>();
  if (ring) circuits.add('ring');
  if (lighting) circuits.add('lighting');

  const runs = (step === 'estimate' && lengthM && widthM)
    ? calcCableRuns({ lengthM, widthM, heightM: 2.4, cuDistanceM: 0 }, circuits, buf ? 10 : 0)
    : [];

  const hasMissingPrices = runs.some((r) => !findCable(materials, r.cableSpec));

  const handleAdd = () => {
    if (!runs.length) return;
    const lines: LineItem[] = runs.map((run) => {
      const mat = findCable(materials, run.cableSpec);
      if (mat) return { ...lineFromMaterial(mat, run.metres), description: run.description, locationId };
      return {
        id: `cable_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        description: run.description, resolvedMaterialCostMinor: 0,
        laborBaseHours: 0, quantityMeters: run.metres, locationId, appliedLaborToggleIds: [],
      };
    });
    onAdd(lines);
    handleClose();
  };

  // ── Tappable steps ───────────────────────────────────────────────────────
  const isTapping = ['ref-a', 'ref-b', 'wall-a', 'wall-b'].includes(step);

  const singleTapGesture = Gesture.Tap()
    .enabled(isTapping)
    .onEnd((e) => { runOnJS(handleTap)(e.x, e.y); });

  const photoGesture = Gesture.Exclusive(
    Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture),
    singleTapGesture,
  );

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>
              {step === 'estimate' ? 'Cable estimate' : 'Measure room'}
            </Text>
            {roomName ? <Text style={styles.headerSub}>{roomName}</Text> : null}
          </View>
          {/* Progress dots */}
          <View style={styles.progress}>
            <View style={[styles.progDot, lengthM ? styles.progDotDone : null]} />
            <View style={[styles.progDot, widthM  ? styles.progDotDone : null]} />
          </View>
        </View>

        {/* ── CAMERA VIEW ── */}
        {step === 'camera' && (
          <View style={{ flex: 1 }}>
            <View style={styles.cameraWrap}>
              <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
              <View style={styles.cameraLabel}>
                <Text style={styles.cameraLabelText}>
                  {lengthM && !widthM  ? `Length measured (${lengthM}m). Now measure width.` :
                   widthM  && !lengthM ? `Width measured (${widthM}m). Now measure length.` :
                   'Face a wall. Include a socket or door frame for reference.'}
                </Text>
              </View>
            </View>
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
              <Pressable style={styles.shootBtn} onPress={shoot} disabled={capturing}>
                {capturing
                  ? <ActivityIndicator color={colors.accentInk} />
                  : <Text style={styles.shootText}>Take Photo</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {/* ── PHOTO MARKING VIEW ── */}
        {step !== 'camera' && step !== 'estimate' && (
          <View style={{ flex: 1 }}>
            {/* Instruction banner */}
            {INSTRUCT[step] && (
              <View style={styles.instructBar}>
                <Text style={styles.instructText}>{INSTRUCT[step]}</Text>
              </View>
            )}

            {/* Photo + pinch-zoom/pan + tap overlay */}
            <View style={styles.photoWrap}>
              <GestureDetector gesture={photoGesture}>
                {/* This inner View, NOT the transformed Animated.View below, is what
                    GestureDetector is attached to — Android auto-corrects touch
                    coordinates for a view's OWN transform before reporting them, so
                    attaching the gesture to the already-scaled Animated.View would
                    have handed handleTap pre-unscaled points, and unscaleContainerPoint
                    would then double-correct them. Keeping this wrapper untransformed
                    is what makes containerSize/unscaleContainerPoint's math valid. */}
                <View
                  style={StyleSheet.absoluteFill}
                  onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                >
                  <Animated.View style={[StyleSheet.absoluteFill, imageAnimStyle]}>
                    <Image
                      source={{ uri: photoUri! }}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                    />

                    {/* Reference markers — amber */}
                    {pts[0] && <Dot pt={denormPt(pts[0])} color={colors.accent} num={1} />}
                    {pts[1] && <Dot pt={denormPt(pts[1])} color={colors.accent} num={2} />}
                    {pts[0] && pts[1] && <SegLine a={denormPt(pts[0])} b={denormPt(pts[1])} color={colors.accent} />}
                    {/* Wall markers — blue */}
                    {pts[2] && <Dot pt={denormPt(pts[2])} color="#64B5F6" num={1} />}
                    {pts[3] && <Dot pt={denormPt(pts[3])} color="#64B5F6" num={2} />}
                    {pts[2] && pts[3] && <SegLine a={denormPt(pts[2])} b={denormPt(pts[3])} color="#64B5F6" />}
                  </Animated.View>
                </View>
              </GestureDetector>

              {/* Reference size picker (overlaid panel) */}
              {step === 'ref-pick' && (
                <View style={styles.overlayPanel}>
                  <Text style={styles.overlayTitle}>What did you tap?</Text>
                  {REF_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.label}
                      style={styles.refOption}
                      onPress={() => { setRefMm(opt.mm); setStep('wall-a'); }}
                    >
                      <Text style={styles.refOptionText}>{opt.label}</Text>
                      <Text style={styles.refOptionMm}>{opt.mm}mm</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => { setPts([]); setStep('ref-a'); }} style={styles.retapLink}>
                    <Text style={styles.retapText}>Retap reference</Text>
                  </Pressable>
                </View>
              )}

              {/* Assign panel */}
              {step === 'assign' && measuredM !== null && (
                <View style={styles.overlayPanel}>
                  <Text style={styles.measuredVal}>~{measuredM} m</Text>
                  <Text style={styles.overlayTitle}>This wall is the room's:</Text>
                  <View style={styles.roleRow}>
                    <Pressable style={styles.roleBtn} onPress={() => assign('length')}>
                      <Text style={styles.roleBtnText}>Length</Text>
                      {lengthM ? <Text style={styles.roleBtnSub}>was {lengthM}m</Text> : null}
                    </Pressable>
                    <Pressable style={styles.roleBtn} onPress={() => assign('width')}>
                      <Text style={styles.roleBtnText}>Width</Text>
                      {widthM ? <Text style={styles.roleBtnSub}>was {widthM}m</Text> : null}
                    </Pressable>
                  </View>
                  <Pressable onPress={() => { setPts(pts.slice(0, 2)); setStep('wall-a'); }} style={styles.retapLink}>
                    <Text style={styles.retapText}>Retap wall</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Bottom controls */}
            {isTapping && (
              <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
                <Pressable onPress={resetMeasurement}>
                  <Text style={styles.retakeLink}>Retake photo</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── ESTIMATE VIEW ── */}
        {step === 'estimate' && (
          <ScrollView
            contentContainerStyle={[styles.estimateScroll, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.dimsCard}>
              <Text style={styles.dimsText}>
                {lengthM}m × {widthM}m  ·  2.4m ceiling
              </Text>
              <Pressable onPress={() => { setLengthM(null); setWidthM(null); resetMeasurement(); }}>
                <Text style={styles.remeasureText}>Re-measure</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>CIRCUITS</Text>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Ring main sockets</Text>
                <Text style={styles.toggleHint}>2.5mm T+E  ·  perimeter run</Text>
              </View>
              <Switch value={ring} onValueChange={setRing}
                trackColor={{ true: colors.accent, false: colors.hairline }} thumbColor={colors.textPrimary} />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Lighting circuit</Text>
                <Text style={styles.toggleHint}>1.5mm T+E  ·  ceiling + switch drops</Text>
              </View>
              <Switch value={lighting} onValueChange={setLighting}
                trackColor={{ true: colors.accent, false: colors.hairline }} thumbColor={colors.textPrimary} />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>+10% safety buffer</Text>
                <Text style={styles.toggleHint}>Routing and offcut allowance</Text>
              </View>
              <Switch value={buf} onValueChange={setBuf}
                trackColor={{ true: colors.accent, false: colors.hairline }} thumbColor={colors.textPrimary} />
            </View>

            {runs.length > 0 && (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>ESTIMATE</Text>
                {runs.map((r) => (
                  <View key={r.cableSpec} style={styles.previewRow}>
                    <Text style={styles.previewDesc}>{r.description}</Text>
                    <Text style={styles.previewM}>{r.metres} m</Text>
                  </View>
                ))}
                {hasMissingPrices && (
                  <Text style={styles.missingNote}>
                    No cable price in catalogue — items added at £0. Import a price list to add costs.
                  </Text>
                )}
              </View>
            )}

            {circuits.size === 0 && (
              <Text style={styles.emptyHint}>Enable at least one circuit above.</Text>
            )}

            <Pressable
              style={[styles.addBtn, !runs.length && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!runs.length}
            >
              <Text style={styles.addBtnText}>
                Add {runs.length} {runs.length === 1 ? 'line' : 'lines'} to room
              </Text>
            </Pressable>
          </ScrollView>
        )}

      </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: colors.ground },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  closeBtn:     { color: colors.textSecondary, fontSize: 18, width: 32 },
  headerTitle:  { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  headerSub:    { color: colors.textMuted, fontSize: 12 },
  progress:     { flexDirection: 'row', gap: 6, width: 32, justifyContent: 'flex-end' },
  progDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hairline },
  progDotDone:  { backgroundColor: colors.accent },

  // Camera
  cameraWrap:   { flex: 1, position: 'relative' },
  cameraLabel:  { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: space.md },
  cameraLabelText: { color: '#fff', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  bottomBar:    { backgroundColor: colors.ground, paddingHorizontal: space.lg, paddingTop: space.md, alignItems: 'center' },
  shootBtn:     { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.xxl, paddingVertical: space.lg },
  shootText:    { color: colors.accentInk, fontWeight: '800', fontSize: 16 },

  // Photo marking
  instructBar:  { backgroundColor: '#1E242E', paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 88, justifyContent: 'center' },
  instructText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  photoWrap:    { flex: 1, position: 'relative', backgroundColor: '#000' },
  dot: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  dotNum: { color: '#fff', fontSize: 9, fontWeight: '800' },
  retakeLink:   { color: colors.textMuted, fontSize: 13, fontWeight: '600', paddingVertical: space.md },

  // Overlay panels (ref-pick, assign)
  overlayPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(20,24,31,0.95)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: space.lg, gap: space.sm,
  },
  overlayTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: space.xs },
  refOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
  },
  refOptionText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  refOptionMm:   { color: colors.textMuted, fontSize: 13 },
  retapLink:     { alignItems: 'center', paddingTop: space.sm },
  retapText:     { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  // Assign
  measuredVal:  { color: colors.accent, fontSize: 36, fontWeight: '800', textAlign: 'center', marginBottom: space.xs },
  roleRow:      { flexDirection: 'row', gap: space.md },
  roleBtn:      { flex: 1, backgroundColor: colors.accent, borderRadius: radius.tile, paddingVertical: space.md, alignItems: 'center' },
  roleBtnText:  { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
  roleBtnSub:   { color: colors.accentInk, fontSize: 11, opacity: 0.7 },

  // Estimate
  estimateScroll: { padding: space.lg },
  dimsCard:     { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  dimsText:     { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  remeasureText:{ color: colors.accent, fontSize: 13, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2, marginBottom: space.sm },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm + 2, marginBottom: space.xs },
  toggleLabel:  { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  toggleHint:   { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  preview:      { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginTop: space.lg },
  previewLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2, marginBottom: space.sm },
  previewRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  previewDesc:  { color: colors.textPrimary, fontSize: 14, flex: 1 },
  previewM:     { color: colors.accent, fontSize: 15, fontWeight: '700' },
  missingNote:  { color: colors.textMuted, fontSize: 11, marginTop: space.sm, fontStyle: 'italic', lineHeight: 16 },
  emptyHint:    { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: space.xl },
  addBtn:       { backgroundColor: colors.accent, borderRadius: radius.tile, paddingVertical: space.lg, alignItems: 'center', marginTop: space.xl },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText:   { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
});
