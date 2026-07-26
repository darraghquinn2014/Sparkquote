/**
 * PlanSymbolTagger — tag a wall's electrical symbols straight off the
 * imported floor plan.
 *
 * Full-screen modal that renders the plan rotated and zoomed so the given
 * wall lies HORIZONTALLY across the middle of the screen. The rotation means
 * the along-wall coordinate is simply the screen's x axis: tap a symbol
 * printed on the plan and its positionAlongWall falls straight out of the
 * tap's x — the app places a WallSymbol there (mid-height on the photo,
 * draggable later on the wall screen). Tap an already-tagged marker to
 * remove it.
 *
 * Transform: the plan image is laid out at (imageSize × k) where k scales
 * the wall's pixel length to `spanFrac` of the screen width, positioned so
 * the wall's midpoint sits under the screen centre, then rotated by -wallAngle
 * about that centre (a 0×0 wrapper View at screen centre is the rotation
 * pivot; its children inherit the rotation).
 */
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg from 'react-native-svg';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import type { FloorPlan, Wall, WallSymbol } from '@/src/domain/types';
import type { SymbolType } from '@/src/media/annotation-service';
import { addWallSymbol, deleteWallSymbol } from '@/src/data/floor-plan-repo';
import { DEFAULT_PHOTO_Y } from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup, SYMBOL_TYPES, SYMBOL_LABELS, SYMBOL_TYPE_COLORS } from '@/src/ui/annotations/symbols';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Tap-to-remove radius around an existing marker, screen px. */
const REMOVE_RADIUS = 26;

interface Props {
  visible: boolean;
  wall: Wall;
  floorPlan: FloorPlan;
  symbols: WallSymbol[];
  /** Called after any add/remove so the owning screen can reload. */
  onChanged: () => void;
  onClose: () => void;
}

export function PlanSymbolTagger({ visible, wall, floorPlan, symbols, onChanged, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  // How much of the screen width the wall spans — the zoom control.
  const [spanFrac, setSpanFrac] = useState(0.8);
  const [pendingPos, setPendingPos] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<SymbolType>('socket');

  const W = containerSize.width;
  const H = containerSize.height;

  // Wall in plan-image pixels
  const A = { x: wall.start.x * floorPlan.width, y: wall.start.y * floorPlan.height };
  const B = { x: wall.end.x * floorPlan.width, y: wall.end.y * floorPlan.height };
  const wallLenPx = Math.hypot(B.x - A.x, B.y - A.y);
  const thetaDeg = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;

  const L = W * spanFrac;                       // wall's on-screen length
  const k = wallLenPx > 0 ? L / wallLenPx : 1;  // plan px -> screen px
  const mid = { x: ((A.x + B.x) / 2) * k, y: ((A.y + B.y) / 2) * k };

  /** Screen x of a position along the wall (the wall is horizontal on screen). */
  const alongToX = (t: number) => W / 2 + (t - 0.5) * L;

  const handleTap = (tx: number, ty: number) => {
    // Existing marker close by? Remove beats add.
    for (const sym of symbols) {
      if (Math.hypot(alongToX(sym.positionAlongWall) - tx, H / 2 - ty) <= REMOVE_RADIUS) {
        Alert.alert('Remove symbol?', SYMBOL_LABELS[sym.type as SymbolType] ?? sym.type, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove', style: 'destructive',
            onPress: async () => { await deleteWallSymbol(sym.id); onChanged(); },
          },
        ]);
        return;
      }
    }
    setPendingPos(clamp01(0.5 + (tx - W / 2) / L));
  };

  const tapGesture = Gesture.Tap().onEnd((e) => { runOnJS(handleTap)(e.x, e.y); });

  const commit = async () => {
    if (pendingPos == null) return;
    await addWallSymbol(wall.id, selectedType, pendingPos, DEFAULT_PHOTO_Y, SYMBOL_TYPE_COLORS[selectedType]);
    setPendingPos(null);
    onChanged();
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Tag from plan</Text>
              <Text style={styles.headerSub}>{wall.label || 'Wall'}</Text>
            </View>
            <View style={styles.zoomBtns}>
              <Pressable onPress={() => setSpanFrac((f) => Math.max(0.4, f - 0.2))} hitSlop={8}>
                <Text style={styles.zoomBtnText}>−</Text>
              </Pressable>
              <Pressable onPress={() => setSpanFrac((f) => Math.min(1.6, f + 0.2))} hitSlop={8}>
                <Text style={styles.zoomBtnText}>+</Text>
              </Pressable>
            </View>
          </View>

          <GestureDetector gesture={tapGesture}>
            <View
              style={styles.canvas}
              onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              {/* 0x0 wrapper at screen centre = rotation pivot for the plan */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute', left: W / 2, top: H / 2, width: 0, height: 0,
                  transform: [{ rotate: `${-thetaDeg}deg` }],
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: -mid.x,
                    top: -mid.y,
                    width: floorPlan.width * k,
                    height: floorPlan.height * k,
                  }}
                >
                  <Image source={{ uri: floorPlan.filePath }} style={StyleSheet.absoluteFill} contentFit="fill" />
                </View>
              </View>

              {/* The wall, horizontal across the middle */}
              <View
                pointerEvents="none"
                style={[styles.wallLine, { left: W / 2 - L / 2, top: H / 2 - 1.5, width: L }]}
              />

              {/* Already-tagged symbols at their positions along the wall */}
              <Svg pointerEvents="none" width={W} height={H} style={StyleSheet.absoluteFillObject}>
                {symbols.map((sym) => (
                  <PlacedSymbolGroup
                    key={sym.id}
                    symbol={{ id: sym.id, type: sym.type, x: alongToX(sym.positionAlongWall), y: H / 2, color: sym.color ?? '#FFFFFF' }}
                  />
                ))}
              </Svg>
            </View>
          </GestureDetector>

          <Text style={styles.hint}>
            The wall runs across the middle. Tap a symbol printed on the plan to tag it · Tap a tagged marker to remove it
          </Text>

          {/* Palette — after tapping a spot. In-modal bottom panel (not a
              nested Modal — Android nested modals are flaky). */}
          {/* Absolutely-positioned, so SafeAreaView's bottom edge doesn't
              apply — pad for the Android nav bar explicitly or it overlays
              the Cancel button. */}
          {pendingPos != null && (
            <View style={[styles.palette, { paddingBottom: insets.bottom + space.xxl }]}>
              <Text style={styles.paletteTitle}>What symbol is this?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.symbolRow}>
                {SYMBOL_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.symbolBtn, selectedType === type && styles.symbolBtnActive]}
                    onPress={() => setSelectedType(type)}
                    hitSlop={4}
                  >
                    <Text style={[styles.symbolBtnText, selectedType === type && styles.symbolBtnTextActive]}>
                      {SYMBOL_LABELS[type]}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.paletteConfirm} onPress={commit}>
                <Text style={styles.paletteConfirmText}>Tag {SYMBOL_LABELS[selectedType]}</Text>
              </Pressable>
              <Pressable onPress={() => setPendingPos(null)} style={styles.paletteCancel}>
                <Text style={styles.paletteCancelText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  closeBtn: { color: colors.textSecondary, fontSize: 18, width: 44 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  headerSub: { color: colors.textMuted, fontSize: 12 },
  zoomBtns: { flexDirection: 'row', gap: space.lg, width: 44, justifyContent: 'flex-end' },
  zoomBtnText: { color: colors.accent, fontSize: 22, fontWeight: '800' },

  canvas: { flex: 1, position: 'relative', backgroundColor: '#fff', overflow: 'hidden' },
  wallLine: { position: 'absolute', height: 3, backgroundColor: colors.accent, opacity: 0.55, borderRadius: 1.5 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: space.md, paddingHorizontal: space.lg },

  palette: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, borderTopLeftRadius: radius.bar, borderTopRightRadius: radius.bar,
    padding: space.xl, paddingBottom: space.xxl, elevation: 8,
  },
  paletteTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: space.md },
  symbolRow: { gap: space.sm, paddingBottom: space.xs },
  symbolBtn: {
    paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline,
  },
  symbolBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  symbolBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  symbolBtnTextActive: { color: colors.accentInk },
  paletteConfirm: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingVertical: space.md, alignItems: 'center', marginTop: space.md },
  paletteConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  paletteCancel: { alignItems: 'center', paddingTop: space.md },
  paletteCancelText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
