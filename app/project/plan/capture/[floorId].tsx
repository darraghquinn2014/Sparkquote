/**
 * Guided wall-by-wall photo capture wizard (AI Plan Mode).
 *
 * Walks through every wall on a floor that doesn't have a photo yet
 * (wall.photoId == null is the complete "needs doing" signal — no separate
 * skip flag), letting the user photograph it (reusing SimpleCameraCapture)
 * and review any AI-suggested symbol heights before moving to the next.
 * "Skip" just advances within this session without persisting anything, so
 * the wall is picked up again next time the wizard (or the room screen's
 * reminder banner) is opened.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { Location, Wall, WallSymbol } from '@/src/domain/types';
import { loadLocation } from '@/src/data/project-repo';
import { addLocationPhoto } from '@/src/data/photo-repo';
import { saveCapture } from '@/src/media/camera-service';
import {
  loadFloorPlanForLocation, loadWallsForFloorPlan, loadWallSymbols,
  setWallPhoto, updateWallSymbolPhotoY, deleteWallSymbol, confirmAllSymbolHeights,
} from '@/src/data/floor-plan-repo';
import { SimpleCameraCapture } from '@/src/ui/photos/SimpleCameraCapture';
import { WallSymbolOverlay } from '@/src/ui/annotations/WallSymbolOverlay';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

type Step = 'capture' | 'review';

export default function WallCaptureWizard() {
  const router = useRouter();
  const { floorId } = useLocalSearchParams<{ floorId: string }>();

  const [loading, setLoading] = useState(true);
  const [pendingWalls, setPendingWalls] = useState<Wall[]>([]);
  const [index, setIndex] = useState(0);
  const [room, setRoom] = useState<Location | null>(null);
  const [symbols, setSymbols] = useState<WallSymbol[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('capture');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const wall = pendingWalls[index] ?? null;

  const loadWalls = useCallback(async () => {
    if (!floorId) return;
    const plan = await loadFloorPlanForLocation(floorId);
    const all = plan ? await loadWallsForFloorPlan(plan.id) : [];
    setPendingWalls(all.filter((w) => !w.photoId));
    setIndex(0);
    setLoading(false);
  }, [floorId]);

  useFocusEffect(useCallback(() => { loadWalls(); }, [loadWalls]));

  const loadCurrentWall = useCallback(async (w: Wall) => {
    const [r, syms] = await Promise.all([loadLocation(w.locationId), loadWallSymbols(w.id)]);
    setRoom(r);
    setSymbols(syms);
    setPhotoUri(null);
    setStep('capture');
  }, []);

  useFocusEffect(useCallback(() => {
    if (wall) loadCurrentWall(wall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall?.id]));

  const finishOrAdvance = () => {
    if (index + 1 >= pendingWalls.length) {
      Alert.alert('All done', 'Every wall on this floor has a photo now.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      setIndex((i) => i + 1);
    }
  };

  const skipWall = () => finishOrAdvance();

  const openCamera = () => setCameraOpen(true);

  const handleCaptured = async (uri: string) => {
    setCameraOpen(false);
    if (!wall || !room) return;
    setSaving(true);
    try {
      const captured = await saveCapture({
        sourceUri: uri,
        paths: mediaPaths,
        projectId: room.projectId,
        locationId: wall.locationId,
        quality: 'medium',
      });
      const photoId = await addLocationPhoto(room.projectId, wall.locationId, captured.filePath, captured.quality, captured.capturedAt);
      await setWallPhoto(wall.id, photoId);
      setPhotoUri(captured.filePath);
      setStep('review');
    } catch {
      Alert.alert('Save failed', 'Could not save the photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSymbolDragEnd = async (symbol: WallSymbol, photoY: number) => {
    setSymbols((prev) => prev.map((s) => (s.id === symbol.id ? { ...s, photoY } : s)));
    await updateWallSymbolPhotoY(symbol.id, photoY);
  };

  const handleSymbolTap = (symbol: WallSymbol) => {
    Alert.alert('Remove symbol?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteWallSymbol(symbol.id);
          setSymbols((prev) => prev.filter((s) => s.id !== symbol.id));
        },
      },
    ]);
  };

  const confirmAndNext = async () => {
    if (wall) await confirmAllSymbolHeights(wall.id);
    finishOrAdvance();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  if (!wall) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Every wall already has a photo.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const unconfirmedCount = symbols.filter((s) => s.source === 'ai' && s.heightConfirmed === false).length;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title} numberOfLines={1}>{wall.label || 'Wall'}</Text>
            <Text style={styles.subtitle}>{room?.name} · Wall {index + 1} of {pendingWalls.length}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {step === 'capture' ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Take a photo of this wall</Text>
            <Text style={styles.emptyHint}>
              {symbols.length > 0
                ? `${symbols.length} symbol${symbols.length === 1 ? '' : 's'} already tagged on the plan for this wall will be placed on the photo automatically.`
                : "You can tag symbols on the photo afterward."}
            </Text>
            <View style={styles.btnRow}>
              <Pressable style={styles.primaryBtn} onPress={openCamera} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.primaryBtnText}>Take Photo</Text>}
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={skipWall} disabled={saving}>
                <Text style={styles.secondaryBtnText}>Skip this wall</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          photoUri && (
            <>
              <WallSymbolOverlay
                photoUri={photoUri}
                symbols={symbols}
                enabled
                onSymbolDragEnd={handleSymbolDragEnd}
                onSymbolTap={handleSymbolTap}
                style={styles.photoWrap}
              />
              <Text style={styles.hint}>
                {unconfirmedCount > 0
                  ? `Drag a symbol to adjust height · ${unconfirmedCount} still needs review`
                  : 'Drag a symbol to adjust height · Tap to remove'}
              </Text>
              <View style={styles.btnRow}>
                <Pressable style={styles.primaryBtn} onPress={confirmAndNext}>
                  <Text style={styles.primaryBtnText}>Looks good — Next ›</Text>
                </Pressable>
              </View>
            </>
          )
        )}
      </SafeAreaView>

      <SimpleCameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={handleCaptured}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 44 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  emptyText: { color: colors.textSecondary, fontSize: 17, fontWeight: '700', marginBottom: space.xs, textAlign: 'center' },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: space.xl, lineHeight: 19 },

  btnRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.lg },
  primaryBtn: {
    flex: 1, backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: space.md, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    flex: 1, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline,
    paddingVertical: space.md, alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },

  photoWrap: { flex: 1, position: 'relative', backgroundColor: '#000' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: space.md },
});
