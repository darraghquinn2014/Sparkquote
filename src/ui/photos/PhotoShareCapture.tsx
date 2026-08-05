/**
 * Off-screen renderer that flattens a room photo + its own annotations
 * (freehand strokes and placed electrical symbols) into a single shareable
 * image file — same technique as WallShareCapture, but for a photo's own
 * annotation-service data (normalized to the photo's image content) rather
 * than a wall's DB-persisted symbols (normalized along-wall). Without this,
 * a shared photo shows only the raw capture — annotations are otherwise just
 * a live SVG overlay in-app, never baked into the photo binary.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import type { Photo } from '@/src/media/media-types';
import { denormalizeStroke, denormalizeSymbol, type AnnotationStroke, type PlacedSymbol } from '@/src/media/annotation-service';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';

const CAPTURE_WIDTH = 1600;

// Symbol glyphs are a fixed absolute SVG size tuned to look right at a phone's
// logical screen width (see the room lightbox, which renders them at scale=1
// against its own screen size) — scale up in proportion for this much
// higher-res canvas, same reasoning/constant as WallShareCapture.
const REFERENCE_DISPLAY_WIDTH = 380;
const SYMBOL_SCALE = CAPTURE_WIDTH / REFERENCE_DISPLAY_WIDTH;

interface Props {
  photo: Photo;
  strokes: AnnotationStroke[];
  symbols: PlacedSymbol[];
  onReady: (filePath: string) => void;
  onError: (error: unknown) => void;
}

export function PhotoShareCapture({ photo, strokes, symbols, onReady, onError }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(photo.filePath);
        if (!info.exists) {
          throw new Error(
            `Photo file is missing on disk: ${photo.filePath}. If the app was reinstalled since this photo was taken, its saved file path no longer exists.`,
          );
        }
        const result = await ImageManipulator.manipulateAsync(photo.filePath, [], {});
        if (cancelled) return;
        setSize({ width: CAPTURE_WIDTH, height: Math.round((result.height / result.width) * CAPTURE_WIDTH) });
      } catch (e) {
        if (!cancelled) onError(e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.filePath]);

  useEffect(() => {
    if (!size || !loaded) return;
    // One extra frame before capturing — same as WallShareCapture, avoids
    // grabbing a blank/partial frame on some Android devices.
    const raf = requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          if (!viewRef.current) throw new Error('Capture view not mounted');
          const uri = await captureRef(viewRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' });
          onReady(uri);
        } catch (e) {
          onError(e);
        }
      }, 100);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, loaded]);

  if (!size) return null;

  const renderedStrokes = strokes.map((s) => denormalizeStroke(s, size, size));
  const renderedSymbols = symbols.map((s) => denormalizeSymbol(s, size, size));

  return (
    <View
      ref={viewRef}
      collapsable={false}
      style={[styles.offscreen, { width: size.width, height: size.height }]}
    >
      <ExpoImage
        source={{ uri: photo.filePath }}
        style={{ width: size.width, height: size.height }}
        cachePolicy="none"
        onLoad={() => setLoaded(true)}
        onError={(e) => onError(e)}
      />
      <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFillObject}>
        {renderedStrokes.map((s, i) => (
          <Path key={i} d={s.path} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {renderedSymbols.map((sym) => (
          <PlacedSymbolGroup key={sym.id} scale={SYMBOL_SCALE} symbol={sym} showLabel />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Off-screen but still laid out/rendered (not display:none) — view-shot
  // needs a real native view to capture.
  offscreen: { position: 'absolute', left: -100000, top: 0 },
});
