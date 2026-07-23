import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, FlatList, StyleSheet, Alert, Modal, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { importDrawing, loadDrawings, deleteDrawing, type Drawing } from '@/src/media/drawing-service';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const isImage = (d: Drawing) => d.mimeType.startsWith('image/');

const typeLabel = (mimeType: string) => {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'XLS';
  return 'FILE';
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DocumentsScreen() {
  const router = useRouter();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [viewingImage, setViewingImage] = useState<Drawing | null>(null);

  // Pinch-to-zoom shared values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale)); });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => { scale.value = withSpring(1); });

  const zoomGesture = Gesture.Simultaneous(pinchGesture, doubleTap);

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const closeViewer = () => {
    scale.value = 1;
    setViewingImage(null);
  };

  const reload = useCallback(async () => {
    if (!projectId) return;
    setDrawings(await loadDrawings(projectId));
    setLoading(false);
  }, [projectId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const handleImport = async () => {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets.length) return;
      for (const asset of result.assets) {
        await importDrawing(
          projectId!,
          asset.uri,
          asset.mimeType ?? 'application/octet-stream',
          asset.name ?? 'Document',
        );
      }
      reload();
    } catch (e) {
      Alert.alert('Import error', String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleOpen = (item: Drawing) => {
    if (isImage(item)) {
      setViewingImage(item);
    } else {
      Sharing.shareAsync(item.filePath, { mimeType: item.mimeType, dialogTitle: item.originalName });
    }
  };

  const confirmDelete = (drawing: Drawing) => {
    Alert.alert('Delete document?', `"${drawing.originalName}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteDrawing(drawing); reload(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Documents</Text>
        <Pressable
          style={[styles.importBtn, importing && styles.importBtnBusy]}
          onPress={handleImport}
          disabled={importing}
        >
          <Text style={styles.importBtnText}>{importing ? 'Importing…' : '+ Add'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={drawings}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No documents yet.{'\n'}Tap + Add to import drawings, PDFs, photos or any project file.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => handleOpen(item)}
              onLongPress={() => confirmDelete(item)}
            >
              <View style={[styles.typeTag, item.mimeType === 'application/pdf' && styles.typeTagPdf, isImage(item) && styles.typeTagImg]}>
                <Text style={styles.typeText}>{typeLabel(item.mimeType)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>{item.originalName}</Text>
                <Text style={styles.date}>{formatDate(item.importedAt)}</Text>
              </View>
              <Text style={styles.openHint}>{isImage(item) ? '›' : '↗'}</Text>
            </Pressable>
          )}
        />
      )}

      {/* Image viewer modal — pinch to zoom, double-tap to reset */}
      {viewingImage && (
        <Modal visible animationType="fade" onRequestClose={closeViewer}>
          <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={[styles.imageViewer, { paddingTop: insets.top }]}>
            <View style={styles.viewerToolbar}>
              <Pressable onPress={closeViewer} style={styles.doneBtn}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
              <Text style={styles.viewerTitle} numberOfLines={1}>{viewingImage.originalName}</Text>
              <Pressable
                style={styles.shareBtn}
                onPress={() => Sharing.shareAsync(viewingImage.filePath, { mimeType: viewingImage.mimeType })}
              >
                <Text style={styles.shareBtnText}>Share</Text>
              </Pressable>
            </View>
            <View style={styles.imageContainer}>
              <GestureDetector gesture={zoomGesture}>
                <Animated.Image
                  source={{ uri: viewingImage.filePath }}
                  style={[styles.fullImage, imageAnimStyle]}
                  resizeMode="contain"
                />
              </GestureDetector>
              <Text style={styles.zoomHint}>Pinch to zoom  •  Double-tap to reset</Text>
            </View>
          </View>
          </GestureHandlerRootView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  importBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  importBtnBusy: { opacity: 0.5 },
  importBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl, fontSize: 15, lineHeight: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile,
    borderWidth: 1, borderColor: colors.hairline,
    padding: space.md, marginBottom: space.sm,
  },
  typeTag: { backgroundColor: colors.ground, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 4, minWidth: 40, alignItems: 'center' },
  typeTagPdf: { backgroundColor: '#1A0A00' },
  typeTagImg: { backgroundColor: '#001A2E' },
  typeText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  openHint: { color: colors.textSecondary, fontSize: 18 },
  imageViewer: { flex: 1, backgroundColor: '#000' },
  imageContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoomHint: { position: 'absolute', bottom: 24, color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '500' },
  viewerToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, paddingVertical: space.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  doneBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 64, alignItems: 'center' },
  doneBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  viewerTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600', textAlign: 'center', marginHorizontal: space.sm },
  shareBtn: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline, minWidth: 64, alignItems: 'center' },
  shareBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  fullImage: { width: Dimensions.get('window').width, height: Dimensions.get('window').height - 60 },
});
