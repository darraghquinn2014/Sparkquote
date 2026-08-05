/**
 * CameraPreview — CameraView letterboxed to the still-photo capture ratio,
 * instead of stretched to fill whatever shape its container happens to be.
 *
 * Every screen with a camera previously rendered `<CameraView style={{flex:1}}>`
 * directly, which fills the ENTIRE available space regardless of its aspect
 * ratio — on a phone that's a reasonable approximation of the photo's own
 * ratio, but on an iPad (a much less elongated screen) the mismatch is far
 * bigger, and the native preview crops proportionally more off one edge to
 * "cover" that oddly-shaped container. Reported symptom: photos on iPad came
 * out zoomed in, missing the sides of a wall that were clearly framed in the
 * viewfinder. Fixing the preview's own shape to match the capture ratio
 * makes the viewfinder accurately represent what gets saved, on any screen.
 */
import React, { forwardRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { CameraView, type CameraViewProps } from 'expo-camera';
import { imageFitRect } from '@/src/domain/wall-geometry';

// No `pictureSize`/`ratio` is set anywhere in this app, so the camera uses
// its platform default still-photo ratio — 4:3 (3:4 portrait) on both iOS
// (AVCapturePhotoOutput's default) and Android.
const CAPTURE_RATIO = { width: 3, height: 4 };

export const CameraPreview = forwardRef<CameraView, Omit<CameraViewProps, 'style'>>(
  function CameraPreview(props, ref) {
    const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
    const rect = imageFitRect(containerSize, CAPTURE_RATIO);

    return (
      <View
        style={styles.wrap}
        onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <View style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
          <CameraView ref={ref} style={StyleSheet.absoluteFillObject} {...props} />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
});
