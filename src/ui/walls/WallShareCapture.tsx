/**
 * Off-screen renderer that flattens a wall's photo + its placed electrical
 * symbols into a single shareable image file, so recipients without the app
 * see the symbols too (they're normally just a live SVG overlay in-app, never
 * baked into the photo binary).
 *
 * Sized to the photo's own aspect ratio (fetched via Image.getSize before
 * mounting), so there's no letterboxing to correct for — positionAlongWall/
 * photoY (both already normalized 0-1 fractions of the photo's own content,
 * per wall-geometry.ts) map straight onto pixel coordinates.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Image as RNImage, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Svg from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import type { Photo } from '@/src/media/media-types';
import type { WallSymbol } from '@/src/domain/types';
import { PlacedSymbolGroup } from '@/src/ui/annotations/symbols';

const CAPTURE_WIDTH = 1600;

// Symbol glyphs are drawn at a fixed absolute SVG size (~30-44px), tuned to
// look right against the wall screen's on-screen photo width (roughly a
// phone's logical screen width). Rendered at CAPTURE_WIDTH (much higher-res,
// for share quality) without compensating, they'd look tiny relative to the
// photo — so scale them up in proportion to how much bigger this canvas is.
const REFERENCE_DISPLAY_WIDTH = 380;
const SYMBOL_SCALE = CAPTURE_WIDTH / REFERENCE_DISPLAY_WIDTH;

interface Props {
  photo: Photo;
  symbols: WallSymbol[];
  onReady: (filePath: string) => void;
  onError: (error: unknown) => void;
}

export function WallShareCapture({ photo, symbols, onReady, onError }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    RNImage.getSize(
      photo.filePath,
      (naturalWidth, naturalHeight) => {
        setSize({ width: CAPTURE_WIDTH, height: Math.round((naturalHeight / naturalWidth) * CAPTURE_WIDTH) });
      },
      onError,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.filePath]);

  useEffect(() => {
    if (!size || !loaded) return;
    // Give the native view one extra frame to finish painting before
    // capturing it — capturing on the same tick as onLoad can grab a blank
    // or partially-drawn frame on some Android devices.
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

  return (
    <View
      ref={viewRef}
      collapsable={false}
      style={[styles.offscreen, { width: size.width, height: size.height }]}
    >
      {/* expo-image with cachePolicy="none" — plain RN Image can serve a
          stale cached bitmap for a local file path that was overwritten in
          place (e.g. after PhotoDimensionStamp burns a caption into it),
          which would silently drop that caption from the flattened share. */}
      <ExpoImage
        source={{ uri: photo.filePath }}
        style={{ width: size.width, height: size.height }}
        cachePolicy="none"
        onLoad={() => setLoaded(true)}
        onError={(e) => onError(e)}
      />
      <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFillObject}>
        {symbols.map((symbol) => (
          <PlacedSymbolGroup
            key={symbol.id}
            scale={SYMBOL_SCALE}
            symbol={{
              id: symbol.id,
              type: symbol.type,
              x: symbol.positionAlongWall * size.width,
              y: symbol.photoY * size.height,
              color: symbol.color ?? '#FFFFFF',
            }}
          />
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
