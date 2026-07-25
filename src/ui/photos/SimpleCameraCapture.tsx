/**
 * Minimal camera capture modal — permission, live view, shutter, preview,
 * retake/use. No room-dimensions stamping or other domain logic; just hands
 * the caller a captured file uri via onCaptured. Used wherever a screen needs
 * a single reference photo (e.g. a project's cover photo).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useCameraOrientation } from '@/src/media/useCameraOrientation';
import { colors, space, radius } from '@/src/ui/theme/tokens';

type CameraState = 'live' | 'preview';

export function SimpleCameraCapture({
  visible,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
}) {
  const [cameraState, setCameraState] = useState<CameraState>('live');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  useCameraOrientation(visible);

  useEffect(() => {
    if (!visible) return;
    setCameraState('live');
    setCapturedUri(null);
    if (!permission?.granted) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (result?.uri) {
        setCapturedUri(result.uri);
        setCameraState('preview');
      }
    } catch {
      Alert.alert('Capture failed', 'Could not take the photo. Please try again.');
    }
  };

  const retake = () => {
    setCapturedUri(null);
    setCameraState('live');
  };

  const confirm = () => {
    if (!capturedUri) return;
    onCaptured(capturedUri);
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.screen}>
        {cameraState === 'live' ? (
          permission?.granted ? (
            <>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
              <SafeAreaView style={styles.controls} edges={['bottom']}>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.shutter} onPress={takePhoto}>
                  <View style={styles.shutterInner} />
                </Pressable>
                <View style={{ width: 60 }} />
              </SafeAreaView>
            </>
          ) : (
            <SafeAreaView style={styles.permissionScreen} edges={['top', 'bottom']}>
              <Text style={styles.permissionText}>Allow camera access in Settings to take a photo.</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={styles.cancel}>Close</Text>
              </Pressable>
            </SafeAreaView>
          )
        ) : (
          capturedUri && (
            <>
              <Image source={{ uri: capturedUri }} style={styles.camera} contentFit="cover" />
              <SafeAreaView style={styles.controls} edges={['bottom']}>
                <Pressable onPress={retake} hitSlop={12}>
                  <Text style={styles.cancel}>Retake</Text>
                </Pressable>
                <Pressable style={styles.useBtn} onPress={confirm}>
                  <Text style={styles.useBtnText}>Use Photo</Text>
                </Pressable>
                <View style={{ width: 60 }} />
              </SafeAreaView>
            </>
          )
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cancel: { color: '#fff', fontSize: 16, fontWeight: '600', width: 60 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  useBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.md },
  useBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  permissionScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xl },
  permissionText: { color: '#fff', fontSize: 15, textAlign: 'center' },
});
