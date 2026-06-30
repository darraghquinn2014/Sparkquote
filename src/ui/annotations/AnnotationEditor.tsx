/**
 * AnnotationEditor — full-screen photo markup tool.
 *
 * Draw cable routes, faults, and notes directly on a room photo.
 * Uses react-native-svg for path rendering and react-native-gesture-handler
 * Pan gesture for real-time drawing. Strokes are saved as SVG path strings
 * via annotation-service.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ScreenOrientation from 'expo-screen-orientation';
import { saveAnnotations, type AnnotationStroke } from '@/src/media/annotation-service';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const COLORS = [
  { hex: '#FF3B30', label: 'Fault' },
  { hex: '#1B8FFF', label: 'Cable' },
  { hex: '#06D6A0', label: 'OK' },
  { hex: '#F0B730', label: 'Caution' },
  { hex: '#FFFFFF', label: 'Note' },
];

const WIDTHS = [2, 4, 7];

interface Props {
  visible: boolean;
  photoUri: string;
  photoId: string;
  initialStrokes: AnnotationStroke[];
  onClose: () => void;
  onSaved: (strokes: AnnotationStroke[]) => void;
}

export function AnnotationEditor({ visible, photoUri, photoId, initialStrokes, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [strokes, setStrokes] = useState<AnnotationStroke[]>(initialStrokes);
  const [colorIdx, setColorIdx] = useState(0);
  const [widthIdx, setWidthIdx] = useState(1);
  const [saving, setSaving] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    if (visible) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible]);

  // Shared values for the in-progress stroke (UI thread)
  const currentPath = useSharedValue('');
  const svColor = useSharedValue(COLORS[0].hex);
  const svWidth = useSharedValue(WIDTHS[1]);

  const commitStroke = (path: string, color: string, width: number) => {
    if (path.length < 4) return;
    setStrokes((prev) => [...prev, { color, width, path }]);
  };

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      currentPath.value = `M ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    })
    .onUpdate((e) => {
      currentPath.value = currentPath.value + ` L ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    })
    .onEnd(() => {
      const path = currentPath.value;
      const col = svColor.value;
      const w = svWidth.value;
      runOnJS(commitStroke)(path, col, w);
      currentPath.value = '';
    });

  const animatedProps = useAnimatedProps(() => ({
    d: currentPath.value,
  }));

  const handleColorChange = (idx: number) => {
    setColorIdx(idx);
    svColor.value = COLORS[idx].hex;
  };

  const handleWidthChange = (idx: number) => {
    setWidthIdx(idx);
    svWidth.value = WIDTHS[idx];
  };

  const undo = () => setStrokes((prev) => prev.slice(0, -1));
  const clear = () => setStrokes([]);

  const handleDone = async () => {
    setSaving(true);
    try {
      await saveAnnotations(photoId, strokes);
      onSaved(strokes);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    // Reset to initial on cancel
    setStrokes(initialStrokes);
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
            <View style={styles.headerRight}>
              <Pressable onPress={undo} disabled={strokes.length === 0} hitSlop={12} style={styles.headerIconBtn}>
                <Text style={[styles.headerIcon, strokes.length === 0 && styles.actionDisabled]}>↩</Text>
              </Pressable>
              <Pressable onPress={clear} disabled={strokes.length === 0} hitSlop={12} style={styles.headerIconBtn}>
                <Text style={[styles.headerIcon, strokes.length === 0 && styles.actionDisabled]}>✕</Text>
              </Pressable>
              <Pressable onPress={handleDone} disabled={saving} hitSlop={12}>
                <Text style={[styles.headerDone, saving && { opacity: 0.5 }]}>
                  {saving ? 'Saving…' : 'Done'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Canvas — flex:1 fills space between header and toolbar */}
          <GestureDetector gesture={panGesture}>
            <View
              style={styles.canvas}
              onLayout={(e) => setCanvasSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
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
                <AnimatedPath
                  animatedProps={animatedProps}
                  stroke={COLORS[colorIdx].hex}
                  strokeWidth={WIDTHS[widthIdx]}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </GestureDetector>

          {/* Toolbar — sits below canvas, never overlapped */}
          <View style={[styles.toolbar, { paddingBottom: insets.bottom + space.sm }]}>
            {/* Colour swatches */}
            <View style={styles.toolRow}>
              {COLORS.map((c, i) => (
                <Pressable
                  key={c.hex}
                  onPress={() => handleColorChange(i)}
                  style={[
                    styles.swatch,
                    { backgroundColor: c.hex },
                    i === colorIdx && styles.swatchActive,
                  ]}
                />
              ))}

              <View style={styles.toolDivider} />

              {/* Stroke width */}
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

            {/* Colour label */}
            <Text style={styles.colorLabel}>{COLORS[colorIdx].label}</Text>
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
  headerCancel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerIconBtn: { padding: 2 },
  headerIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerDone: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  toolbar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: '#fff',
    transform: [{ scale: 1.2 }],
  },
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
    backgroundColor: 'transparent',
  },
  widthBtnActive: {
    backgroundColor: colors.hairline,
  },
  widthDot: {
    backgroundColor: '#fff',
  },
  actionDisabled: { opacity: 0.3 },
  colorLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: space.xs,
    letterSpacing: 0.5,
  },
});
