/**
 * Renders a wall's photo with its tagged WallSymbols overlaid at their
 * stored position (symbolPhotoX along the wall, photoY within the photo),
 * letterbox-aware. Extracted from app/project/wall/[id].tsx so the same
 * rendering + drag-to-adjust-height gesture can be reused by the guided
 * wall-capture wizard (app/project/plan/capture/[floorId].tsx) without
 * duplicating the pixel math.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import type { WallSymbol } from '@/src/domain/types';
import { symbolPhotoX } from '@/src/domain/wall-geometry';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';

export interface RenderedRect {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

function DraggableSymbol({
  symbol, x, baseY, enabled, highlighted, onDragEnd, onTap,
}: {
  symbol: WallSymbol;
  x: number;
  baseY: number;
  enabled: boolean;
  highlighted: boolean;
  /** Raw vertical drag distance in container px — converted to photoY by the parent. */
  onDragEnd: (translationY: number) => void;
  onTap: () => void;
}) {
  const dragOffset = useSharedValue(0);

  const handleDragEnd = (translationY: number) => {
    onDragEnd(translationY);
    dragOffset.value = 0;
  };

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .minDistance(10)
    .onUpdate((e) => { dragOffset.value = e.translationY; })
    .onEnd((e) => { runOnJS(handleDragEnd)(e.translationY); });

  const tapGesture = Gesture.Tap().enabled(enabled).onEnd(() => { runOnJS(onTap)(); });

  const gesture = Gesture.Exclusive(tapGesture, panGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOffset.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      {/* collapsable={false}: this view has only position/size styling, no
          paint properties, so Fabric can flatten it into its parent — which
          strips the native-view ref GestureDetector needs to attach to
          ("GestureDetector has received a child that may get view-flattened"). */}
      <Animated.View
        collapsable={false}
        style={[{ position: 'absolute', left: x - 20, top: baseY - 20, width: 40, height: 40 }, animStyle]}
      >
        <Svg width={40} height={40}>
          <PlacedSymbolGroup symbol={{ id: symbol.id, type: symbol.type, x: 20, y: 20, color: symbol.color ?? '#FFFFFF' }} />
        </Svg>
        {highlighted && <View style={styles.highlightRing} pointerEvents="none" />}
      </Animated.View>
    </GestureDetector>
  );
}

export interface WallSymbolOverlayProps {
  photoUri: string;
  symbols: WallSymbol[];
  /** Whether existing symbols can be dragged/tapped (usually !addingSymbol). */
  enabled: boolean;
  onSymbolDragEnd: (symbol: WallSymbol, photoY: number) => void;
  onSymbolTap: (symbol: WallSymbol) => void;
  /** Reports the current letterbox-aware rect, for callers that also need it (e.g. tap-to-add-symbol math). */
  onRenderedRectChange?: (rect: RenderedRect | null) => void;
  style?: StyleProp<ViewStyle>;
}

// forwardRef, NOT a plain function component: this is used as the direct
// child of a <GestureDetector> in app/project/wall/[id].tsx, which needs a
// ref to the underlying native view to attach its handler — a plain
// component (unlike a bare <View>) doesn't forward one on its own, and
// GestureDetector silently fails ("received a child that is not a native
// view") without it.
export const WallSymbolOverlay = React.forwardRef<View, WallSymbolOverlayProps>(function WallSymbolOverlay({
  photoUri,
  symbols,
  enabled,
  onSymbolDragEnd,
  onSymbolTap,
  onRenderedRectChange,
  style,
}, ref) {
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Contain-fit rendered rect of the photo within its container — symbol
  // pixel positions must use this, not the raw container size, or they'd
  // drift into the letterbox margin whenever the photo's aspect ratio
  // doesn't match the container's.
  const renderedRect: RenderedRect | null = (() => {
    if (!naturalSize) return null;
    const scale = Math.min(containerSize.width / naturalSize.width, containerSize.height / naturalSize.height);
    const width = naturalSize.width * scale;
    const height = naturalSize.height * scale;
    return { width, height, offsetX: (containerSize.width - width) / 2, offsetY: (containerSize.height - height) / 2 };
  })();

  useEffect(() => {
    onRenderedRectChange?.(renderedRect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedRect?.width, renderedRect?.height, renderedRect?.offsetX, renderedRect?.offsetY]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.wrap, style]}
      onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <Image
        source={{ uri: photoUri }}
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
            enabled={enabled}
            highlighted={symbol.source === 'ai' && symbol.heightConfirmed === false}
            onDragEnd={(translationY) => {
              if (!renderedRect) return;
              const photoY = Math.max(0, Math.min(1, symbol.photoY + translationY / renderedRect.height));
              onSymbolDragEnd(symbol, photoY);
            }}
            onTap={() => onSymbolTap(symbol)}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'relative', backgroundColor: '#000' },
  highlightRing: {
    position: 'absolute', left: -4, top: -4, right: -4, bottom: -4,
    borderRadius: 24, borderWidth: 2, borderColor: '#FFB020',
  },
});
