/**
 * AnnotationEditor — full-screen photo markup tool.
 *
 * Three modes:
 *  • Draw — freehand cable routes / faults / notes
 *  • Symbol — tap to stamp an electrical symbol (socket, switch, CU…)
 *  • Eraser — tap a drawn line to remove it whole, or drag to rub out part of one
 *
 * Strokes and symbols share a single undo history so Undo always removes
 * the last thing added regardless of type. Erasing is NOT part of that
 * history — it edits/removes existing strokes directly rather than
 * appending a new entry, so Undo can't step back through an erase (only
 * through draw/place actions either side of it).
 *
 * Header action buttons are plain text ("Undo"/"Clear"), not Unicode glyph
 * characters (↩/✕) — those silently failed to render on at least one real
 * Android device's system font, making the buttons invisible despite being
 * present and working. Same class of fragility as the lucide-icon crash
 * note in SPARKQUOTE.md — prefer plain text/ASCII over icon glyphs.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  saveAnnotations, normalizeStroke, denormalizeStroke, normalizeSymbolPoint, denormalizeSymbol,
  eraseStrokeSegments, parseStrokePoints,
  type AnnotationStroke, type PlacedSymbol, type SymbolType,
} from '@/src/media/annotation-service';
import { PlacedSymbolGroup } from './symbols';
import { SymbolTypePicker } from './SymbolTypePicker';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Invisible hit-target laid over an already-placed symbol so it can be
// tapped to remove — the visible glyph itself stays in the shared Svg
// (drawn by PlacedSymbolGroup there), this only catches the tap. Same
// nested-GestureDetector-over-a-shared-canvas-gesture pattern as the wall
// screen's DraggableSymbol.
function PlacedSymbolTapTarget({
  x, y, onRemove, blockGesture,
}: { x: number; y: number; onRemove: () => void; blockGesture: ReturnType<typeof Gesture.Tap> }) {
  // blocksExternalGesture makes this win outright over the canvas's own
  // place-a-new-symbol tap gesture when they overlap — without it, both are
  // independent recognizers with no defined priority, so a tap meant to
  // remove a symbol could just as easily place a new one on top of it.
  const tapGesture = Gesture.Tap()
    .onEnd(() => { runOnJS(onRemove)(); })
    .blocksExternalGesture(blockGesture);
  return (
    <GestureDetector gesture={tapGesture}>
      <View
        collapsable={false}
        style={{ position: 'absolute', left: x - 20, top: y - 20, width: 40, height: 40 }}
      />
    </GestureDetector>
  );
}

const COLORS = [
  { hex: '#FF3B30', label: 'Fault' },
  { hex: '#1B8FFF', label: 'Cable' },
  { hex: '#06D6A0', label: 'OK' },
  { hex: '#F0B730', label: 'Caution' },
  { hex: '#FFFFFF', label: 'Note' },
];

const WIDTHS = [2, 4, 7];

// Eraser hit/rub-out radius, normalized (fraction of the photo's own image
// content width/height) — same 3-step small/medium/large selector as the
// pen's WIDTHS, reused for the eraser's toolbar so no extra UI is needed.
const ERASER_RADII = [0.02, 0.035, 0.055];
// A tap-to-remove-the-whole-line hit test uses a fixed, generous radius
// (not tied to the size selector — removing a whole line is an on/off
// choice, not something you'd want to "size").
const TAP_REMOVE_RADIUS = 0.035;

type DrawMode = 'draw' | 'symbol' | 'eraser';
type HistoryItem =
  | { kind: 'stroke'; data: AnnotationStroke }
  | { kind: 'symbol'; data: PlacedSymbol };

interface Props {
  visible: boolean;
  photoUri: string;
  photoId: string;
  initialStrokes: AnnotationStroke[];
  initialSymbols: PlacedSymbol[];
  /** When set, this photo is a wall's attached photo — symbols placed here also sync to that wall (floor plan overlay, wall-photo shares). */
  linkedWallLabel?: string;
  onClose: () => void;
  onSaved: (strokes: AnnotationStroke[], symbols: PlacedSymbol[]) => void;
}

export function AnnotationEditor({
  visible, photoUri, photoId,
  initialStrokes, initialSymbols, linkedWallLabel,
  onClose, onSaved,
}: Props) {
  const insets = useSafeAreaInsets();

  // Unified undo history — strokes and symbols in insertion order
  const [history, setHistory] = useState<HistoryItem[]>(() => [
    ...initialStrokes.map(s => ({ kind: 'stroke' as const, data: s })),
    ...initialSymbols.map(s => ({ kind: 'symbol' as const, data: s })),
  ]);

  const strokes = history.filter(h => h.kind === 'stroke').map(h => h.data as AnnotationStroke);
  const symbols = history.filter(h => h.kind === 'symbol').map(h => h.data as PlacedSymbol);

  const [drawMode, setDrawMode] = useState<DrawMode>('draw');
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolType>('socket');
  const [colorIdx, setColorIdx] = useState(0);
  const [widthIdx, setWidthIdx] = useState(1);
  const [saving, setSaving] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  // Needed to convert taps <-> normalized image coordinates (see
  // normalizeStroke/normalizeSymbolPoint) — without it, placement/removal
  // and rendering are both disabled below rather than risk using the wrong
  // (canvas-pixel) coordinate space.
  useEffect(() => {
    setImageSize(null);
    Image.getSize(
      photoUri,
      (width, height) => setImageSize({ width, height }),
      () => setImageSize(null),
    );
  }, [photoUri]);

  const currentPath = useSharedValue('');
  const svColor = useSharedValue(COLORS[0].hex);
  const svWidth = useSharedValue(WIDTHS[1]);
  const currentErasePath = useSharedValue('');

  // Orientation unlock lives in the standalone/preview build (expo-screen-orientation
  // native module). No-op here so the dev client doesn't crash.

  // Reset history when initial data changes (new photo opened)
  useEffect(() => {
    setHistory([
      ...initialStrokes.map(s => ({ kind: 'stroke' as const, data: s })),
      ...initialSymbols.map(s => ({ kind: 'symbol' as const, data: s })),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  // Raw path/point in here are in THIS canvas's own pixel space (canvasSize)
  // — converted to normalized image coordinates before being stored, so the
  // same data renders correctly in any other container (e.g. the lightbox).
  const commitStroke = (rawPath: string, color: string, rawWidth: number) => {
    if (rawPath.length < 4 || !imageSize) return;
    const { path, width } = normalizeStroke(rawPath, rawWidth, canvasSize, imageSize);
    setHistory(prev => [...prev, { kind: 'stroke', data: { color, width, path } }]);
  };

  const placeSymbol = (rawX: number, rawY: number) => {
    if (!imageSize) return;
    const { x, y } = normalizeSymbolPoint(rawX, rawY, canvasSize, imageSize);
    const id = `sym_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setHistory(prev => [
      ...prev,
      { kind: 'symbol', data: { id, type: selectedSymbol, x, y, color: COLORS[colorIdx].hex } },
    ]);
  };

  // Denormalized (pixel) versions for rendering in THIS canvas — the stored
  // strokes/symbols/history above stay normalized, unaffected by zoom/layout.
  const renderedStrokes = imageSize ? strokes.map((s) => denormalizeStroke(s, canvasSize, imageSize)) : [];
  const renderedSymbols = imageSize ? symbols.map((s) => denormalizeSymbol(s, canvasSize, imageSize)) : [];

  const removeSymbol = (id: string) => {
    Alert.alert('Remove symbol?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setHistory(prev => prev.filter(h => !(h.kind === 'symbol' && h.data.id === id))),
      },
    ]);
  };

  // Eraser — tap a line to remove it whole. History strokes are stored
  // already-normalized (0-1, image content space), so the tap only needs
  // normalizing once to compare directly against each stroke's own points —
  // no denormalize round-trip needed.
  const removeStrokeNearTap = (rawX: number, rawY: number) => {
    if (!imageSize) return;
    const tap = normalizeSymbolPoint(rawX, rawY, canvasSize, imageSize);
    let closestIndex = -1;
    let closestDist = Infinity;
    history.forEach((item, index) => {
      if (item.kind !== 'stroke') return;
      for (const p of parseStrokePoints(item.data.path)) {
        const dist = Math.hypot(p.x - tap.x, p.y - tap.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestIndex = index;
        }
      }
    });
    if (closestIndex === -1 || closestDist > TAP_REMOVE_RADIUS) return;
    const target = closestIndex;
    Alert.alert('Remove this line?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setHistory(prev => prev.filter((_, i) => i !== target)),
      },
    ]);
  };

  // Eraser — drag to rub out just the part of a line under the drag path.
  // Not part of the undo history (see file header comment): splits/shortens
  // strokes in place rather than appending a removable entry.
  const commitErase = (rawPath: string) => {
    if (!imageSize) return;
    const rawPoints = parseStrokePoints(rawPath);
    if (rawPoints.length === 0) return;
    const eraserPoints = rawPoints.map((p) => normalizeSymbolPoint(p.x, p.y, canvasSize, imageSize));
    const radius = ERASER_RADII[widthIdx]!;
    setHistory((prev) => prev.flatMap((item): HistoryItem[] => {
      if (item.kind !== 'stroke') return [item];
      return eraseStrokeSegments(item.data, eraserPoints, radius).map((data) => ({ kind: 'stroke' as const, data }));
    }));
  };

  const panGesture = Gesture.Pan()
    .enabled(drawMode === 'draw' && imageSize != null)
    .minDistance(0)
    .onStart((e) => {
      currentPath.value = `M ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    })
    .onUpdate((e) => {
      currentPath.value = `${currentPath.value} L ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    })
    .onEnd(() => {
      const path = currentPath.value;
      const col = svColor.value;
      const w = svWidth.value;
      runOnJS(commitStroke)(path, col, w);
      currentPath.value = '';
    });

  const placeTapGesture = Gesture.Tap()
    .enabled(drawMode === 'symbol' && imageSize != null)
    .onEnd((e) => {
      runOnJS(placeSymbol)(e.x, e.y);
    });

  // Tap-vs-drag disambiguation: Tap only wins if the finger barely moved
  // (maxDistance); Pan has a small minDistance so it doesn't steal a
  // near-stationary tap before Tap gets a chance to resolve on release.
  // Same pattern as the wall screen's DraggableSymbol (Tap + Pan on one view).
  const eraseTapGesture = Gesture.Tap()
    .enabled(drawMode === 'eraser' && imageSize != null)
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(removeStrokeNearTap)(e.x, e.y);
    });

  const erasePanGesture = Gesture.Pan()
    .enabled(drawMode === 'eraser' && imageSize != null)
    .minDistance(6)
    .onStart((e) => {
      currentErasePath.value = `M ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    })
    .onUpdate((e) => {
      currentErasePath.value = `${currentErasePath.value} L ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    })
    .onEnd(() => {
      const path = currentErasePath.value;
      runOnJS(commitErase)(path);
      currentErasePath.value = '';
    });

  const gesture = Gesture.Exclusive(panGesture, placeTapGesture, eraseTapGesture, erasePanGesture);

  const animatedProps = useAnimatedProps(() => ({ d: currentPath.value }));
  const eraseAnimatedProps = useAnimatedProps(() => ({ d: currentErasePath.value }));

  const handleColorChange = (idx: number) => {
    setColorIdx(idx);
    svColor.value = COLORS[idx].hex;
  };

  const handleWidthChange = (idx: number) => {
    setWidthIdx(idx);
    svWidth.value = WIDTHS[idx];
  };

  const undo = () => setHistory(prev => prev.slice(0, -1));
  const clear = () => setHistory([]);

  const handleDone = async () => {
    setSaving(true);
    try {
      await saveAnnotations(photoId, strokes, symbols);
      onSaved(strokes, symbols);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setHistory([
      ...initialStrokes.map(s => ({ kind: 'stroke' as const, data: s })),
      ...initialSymbols.map(s => ({ kind: 'symbol' as const, data: s })),
    ]);
    currentPath.value = '';
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.screen, { paddingTop: insets.top }]}>

          {/* Header — two rows: Cancel/actions on top, mode toggle centered below.
              (Previously one row with the toggle squeezed in the middle; a 3rd
              mode plus text-label action buttons no longer fit that shape.) */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Text style={styles.headerCancel}>Cancel</Text>
              </Pressable>
              <View style={styles.headerRight}>
                <Pressable onPress={undo} disabled={history.length === 0} hitSlop={10} style={styles.headerTextBtn}>
                  <Text style={[styles.headerActionText, history.length === 0 && styles.actionDisabled]}>Undo</Text>
                </Pressable>
                <Pressable onPress={clear} disabled={history.length === 0} hitSlop={10} style={styles.headerTextBtn}>
                  <Text style={[styles.headerActionText, history.length === 0 && styles.actionDisabled]}>Clear</Text>
                </Pressable>
                <Pressable onPress={handleDone} disabled={saving} hitSlop={10} style={styles.headerTextBtn}>
                  <Text style={[styles.headerDone, saving && { opacity: 0.5 }]}>
                    {saving ? 'Saving…' : 'Done'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Draw / Symbol / Eraser mode toggle */}
            <View style={styles.modeToggle}>
              <Pressable
                style={[styles.modeBtn, drawMode === 'draw' && styles.modeBtnActive]}
                onPress={() => setDrawMode('draw')}
                hitSlop={8}
              >
                <Text style={[styles.modeBtnText, drawMode === 'draw' && styles.modeBtnTextActive]}>
                  Draw
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, drawMode === 'symbol' && styles.modeBtnActive]}
                onPress={() => setDrawMode('symbol')}
                hitSlop={8}
              >
                <Text style={[styles.modeBtnText, drawMode === 'symbol' && styles.modeBtnTextActive]}>
                  Symbol
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, drawMode === 'eraser' && styles.modeBtnActive]}
                onPress={() => setDrawMode('eraser')}
                hitSlop={8}
              >
                <Text style={[styles.modeBtnText, drawMode === 'eraser' && styles.modeBtnTextActive]}>
                  Eraser
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Canvas */}
          <GestureDetector gesture={gesture}>
            <View
              style={styles.canvas}
              onLayout={(e) =>
                setCanvasSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
              }
            >
              <Image
                source={{ uri: photoUri }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="contain"
              />
              <Svg
                width={canvasSize.width}
                height={canvasSize.height}
                style={StyleSheet.absoluteFillObject}
              >
                {renderedStrokes.map((s, i) => (
                  <Path
                    key={i}
                    d={s.path}
                    stroke={s.color}
                    strokeWidth={s.width}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {renderedSymbols.map((sym) => (
                  <PlacedSymbolGroup key={sym.id} symbol={sym} showLabel />
                ))}
                <AnimatedPath
                  animatedProps={animatedProps}
                  stroke={COLORS[colorIdx].hex}
                  strokeWidth={WIDTHS[widthIdx]}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Live eraser-drag trail — visual feedback only, the actual
                    erase is computed once on release (see commitErase). */}
                <AnimatedPath
                  animatedProps={eraseAnimatedProps}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={WIDTHS[widthIdx] + 10}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1,10"
                />
              </Svg>
              {drawMode === 'symbol' && renderedSymbols.map((sym) => (
                <PlacedSymbolTapTarget
                  key={sym.id}
                  x={sym.x}
                  y={sym.y}
                  onRemove={() => removeSymbol(sym.id)}
                  blockGesture={placeTapGesture}
                />
              ))}
            </View>
          </GestureDetector>

          {/* Toolbar */}
          <View style={[styles.toolbar, { paddingBottom: insets.bottom + space.sm }]}>
            {drawMode === 'draw' && (
              <>
                <View style={styles.toolRow}>
                  {COLORS.map((c, i) => (
                    <Pressable
                      key={c.hex}
                      onPress={() => handleColorChange(i)}
                      style={[styles.swatch, { backgroundColor: c.hex }, i === colorIdx && styles.swatchActive]}
                    />
                  ))}
                  <View style={styles.toolDivider} />
                  {WIDTHS.map((w, i) => (
                    <Pressable
                      key={w}
                      onPress={() => handleWidthChange(i)}
                      style={[styles.widthBtn, i === widthIdx && styles.widthBtnActive]}
                    >
                      <View style={[styles.widthDot, { width: w * 2.5, height: w * 2.5, borderRadius: w * 2.5 }]} />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.toolHint}>{COLORS[colorIdx].label}</Text>
              </>
            )}
            {drawMode === 'symbol' && (
              <>
                {/* Symbol palette */}
                <SymbolTypePicker selected={selectedSymbol} onSelect={setSelectedSymbol} />
                {/* Colour row — symbols take the active colour */}
                <View style={[styles.toolRow, { marginTop: space.xs }]}>
                  {COLORS.map((c, i) => (
                    <Pressable
                      key={c.hex}
                      onPress={() => handleColorChange(i)}
                      style={[styles.swatch, { backgroundColor: c.hex }, i === colorIdx && styles.swatchActive]}
                    />
                  ))}
                </View>
                <Text style={styles.toolHint}>
                  Tap empty photo to place · Tap a symbol to remove it · {COLORS[colorIdx].label}
                  {linkedWallLabel ? `\nSymbols sync to "${linkedWallLabel}" on the floor plan` : ''}
                </Text>
              </>
            )}
            {drawMode === 'eraser' && (
              <>
                {/* Same small/medium/large selector as the pen's width row,
                    reused here to size the eraser's rub-out radius. */}
                <View style={styles.toolRow}>
                  {WIDTHS.map((w, i) => (
                    <Pressable
                      key={w}
                      onPress={() => handleWidthChange(i)}
                      style={[styles.widthBtn, i === widthIdx && styles.widthBtnActive]}
                    >
                      <View style={[styles.widthDot, { width: (w + 6) * 2.5, height: (w + 6) * 2.5, borderRadius: (w + 6) * 2.5 }]} />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.toolHint}>
                  Tap a line to remove it entirely · Drag to rub out just part of it
                </Text>
              </>
            )}
          </View>

        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', flexDirection: 'column' },
  canvas: { flex: 1 },

  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: space.sm,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCancel: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headerTextBtn: { padding: 2 },
  headerActionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerDone: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  actionDisabled: { opacity: 0.3 },

  // Draw / Symbol / Eraser mode toggle
  modeToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.ground,
    borderRadius: radius.pill,
    padding: 3,
  },
  modeBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  modeBtnTextActive: { color: colors.accentInk },

  toolbar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
  },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  toolHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: space.xs,
    letterSpacing: 0.5,
  },

  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },

  toolDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.hairline,
    marginHorizontal: space.xs,
  },
  widthBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widthBtnActive: { backgroundColor: colors.hairline },
  widthDot: { backgroundColor: '#fff' },
});
