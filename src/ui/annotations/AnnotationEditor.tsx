/**
 * AnnotationEditor — full-screen photo markup tool.
 *
 * Two modes:
 *  • Draw — freehand cable routes / faults / notes (existing behaviour)
 *  • Symbol — tap to stamp an electrical symbol (socket, switch, CU…)
 *
 * Strokes and symbols share a single undo history so ↩ always removes
 * the last thing added regardless of type.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Image, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { saveAnnotations, type AnnotationStroke, type PlacedSymbol, type SymbolType } from '@/src/media/annotation-service';
import { PlacedSymbolGroup, SYMBOL_TYPES, SYMBOL_LABELS } from './symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Invisible hit-target laid over an already-placed symbol so it can be
// tapped to remove — the visible glyph itself stays in the shared Svg
// (drawn by PlacedSymbolGroup there), this only catches the tap. Same
// nested-GestureDetector-over-a-shared-canvas-gesture pattern as the wall
// screen's DraggableSymbol.
function PlacedSymbolTapTarget({ x, y, onRemove }: { x: number; y: number; onRemove: () => void }) {
  const tapGesture = Gesture.Tap().onEnd(() => { runOnJS(onRemove)(); });
  return (
    <GestureDetector gesture={tapGesture}>
      <View style={{ position: 'absolute', left: x - 20, top: y - 20, width: 40, height: 40 }} />
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

type DrawMode = 'draw' | 'symbol';
type HistoryItem =
  | { kind: 'stroke'; data: AnnotationStroke }
  | { kind: 'symbol'; data: PlacedSymbol };

interface Props {
  visible: boolean;
  photoUri: string;
  photoId: string;
  initialStrokes: AnnotationStroke[];
  initialSymbols: PlacedSymbol[];
  onClose: () => void;
  onSaved: (strokes: AnnotationStroke[], symbols: PlacedSymbol[]) => void;
}

export function AnnotationEditor({
  visible, photoUri, photoId,
  initialStrokes, initialSymbols,
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

  const currentPath = useSharedValue('');
  const svColor = useSharedValue(COLORS[0].hex);
  const svWidth = useSharedValue(WIDTHS[1]);

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

  const commitStroke = (path: string, color: string, width: number) => {
    if (path.length < 4) return;
    setHistory(prev => [...prev, { kind: 'stroke', data: { color, width, path } }]);
  };

  const placeSymbol = (x: number, y: number) => {
    const id = `sym_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setHistory(prev => [
      ...prev,
      { kind: 'symbol', data: { id, type: selectedSymbol, x, y, color: COLORS[colorIdx].hex } },
    ]);
  };

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

  const panGesture = Gesture.Pan()
    .enabled(drawMode === 'draw')
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

  const tapGesture = Gesture.Tap()
    .enabled(drawMode === 'symbol')
    .onEnd((e) => {
      runOnJS(placeSymbol)(e.x, e.y);
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const animatedProps = useAnimatedProps(() => ({ d: currentPath.value }));

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

          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.headerCancel}>Cancel</Text>
            </Pressable>

            {/* Draw / Symbol mode toggle */}
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
            </View>

            <View style={styles.headerRight}>
              <Pressable onPress={undo} disabled={history.length === 0} hitSlop={12} style={styles.headerIconBtn}>
                <Text style={[styles.headerIcon, history.length === 0 && styles.actionDisabled]}>↩</Text>
              </Pressable>
              <Pressable onPress={clear} disabled={history.length === 0} hitSlop={12} style={styles.headerIconBtn}>
                <Text style={[styles.headerIcon, history.length === 0 && styles.actionDisabled]}>✕</Text>
              </Pressable>
              <Pressable onPress={handleDone} disabled={saving} hitSlop={12}>
                <Text style={[styles.headerDone, saving && { opacity: 0.5 }]}>
                  {saving ? 'Saving…' : 'Done'}
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
                {strokes.map((s, i) => (
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
                {symbols.map((sym) => (
                  <PlacedSymbolGroup key={sym.id} symbol={sym} />
                ))}
                <AnimatedPath
                  animatedProps={animatedProps}
                  stroke={COLORS[colorIdx].hex}
                  strokeWidth={WIDTHS[widthIdx]}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              {drawMode === 'symbol' && symbols.map((sym) => (
                <PlacedSymbolTapTarget key={sym.id} x={sym.x} y={sym.y} onRemove={() => removeSymbol(sym.id)} />
              ))}
            </View>
          </GestureDetector>

          {/* Toolbar */}
          <View style={[styles.toolbar, { paddingBottom: insets.bottom + space.sm }]}>
            {drawMode === 'draw' ? (
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
            ) : (
              <>
                {/* Symbol palette */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.symbolRow}
                >
                  {SYMBOL_TYPES.map((type) => (
                    <Pressable
                      key={type}
                      style={[styles.symbolBtn, selectedSymbol === type && styles.symbolBtnActive]}
                      onPress={() => setSelectedSymbol(type)}
                      hitSlop={4}
                    >
                      <Text style={[styles.symbolBtnText, selectedSymbol === type && styles.symbolBtnTextActive]}>
                        {SYMBOL_LABELS[type]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  headerCancel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600', width: 56 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.md, width: 56, justifyContent: 'flex-end' },
  headerIconBtn: { padding: 2 },
  headerIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerDone: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  actionDisabled: { opacity: 0.3 },

  // Draw / Symbol mode toggle
  modeToggle: {
    flexDirection: 'row',
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

  // Symbol palette
  symbolRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: space.xs,
  },
  symbolBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  symbolBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  symbolBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  symbolBtnTextActive: { color: colors.accentInk },
});
