/**
 * Off-screen renderer that burns a room-dimensions caption onto a photo,
 * producing a flattened jpg the caller writes back over the original file
 * (camera-service.overwritePhotoFile). Same native-view -> captureRef
 * technique as WallShareCapture, but writes to disk instead of a share
 * tmpfile, and draws a text caption instead of SVG symbols.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Image as RNImage, Text, StyleSheet } from 'react-native';
import { captureRef } from 'react-native-view-shot';

const CAPTURE_WIDTH = 1600;

interface Props {
  photoUri: string;
  caption: string;
  onReady: (uri: string) => void;
  onError: (error: unknown) => void;
}

export function PhotoDimensionStamp({ photoUri, caption, onReady, onError }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    RNImage.getSize(
      photoUri,
      (naturalWidth, naturalHeight) => {
        setSize({ width: CAPTURE_WIDTH, height: Math.round((naturalHeight / naturalWidth) * CAPTURE_WIDTH) });
      },
      onError,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUri]);

  useEffect(() => {
    if (!size || !loaded) return;
    // Give the native view one extra frame to finish painting before
    // capturing it — see WallShareCapture for why (blank/partial frame risk).
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

  const fontSize = Math.round(size.width * 0.026);

  return (
    <View ref={viewRef} collapsable={false} style={[styles.offscreen, { width: size.width, height: size.height }]}>
      <RNImage
        source={{ uri: photoUri }}
        style={{ width: size.width, height: size.height }}
        onLoad={() => setLoaded(true)}
        onError={(e) => onError(e.nativeEvent)}
      />
      <View style={[styles.captionBox, { paddingHorizontal: size.width * 0.02, paddingVertical: size.width * 0.014 }]}>
        <Text style={{ color: '#fff', fontSize, fontWeight: '700' }}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -100000, top: 0 },
  captionBox: {
    position: 'absolute', left: 0, bottom: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
});
