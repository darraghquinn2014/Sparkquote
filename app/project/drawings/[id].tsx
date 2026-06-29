import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, FlatList, StyleSheet, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { importDrawing, loadDrawings, deleteDrawing, type Drawing } from '@/src/media/drawing-service';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export default function DrawingsScreen() {
  const router = useRouter();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [viewing, setViewing] = useState<Drawing | null>(null);

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
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets.length) return;
      for (const asset of result.assets) {
        await importDrawing(
          projectId!,
          asset.uri,
          asset.mimeType ?? 'application/octet-stream',
          asset.name ?? 'Drawing',
        );
      }
      reload();
    } catch (e) {
      Alert.alert('Import error', String(e));
    } finally {
      setImporting(false);
    }
  };

  const confirmDelete = (drawing: Drawing) => {
    Alert.alert('Delete drawing?', `"${drawing.originalName}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deleteDrawing(drawing); reload(); },
      },
    ]);
  };

  const typeLabel = (mimeType: string) => mimeType === 'application/pdf' ? 'PDF' : 'IMG';
  const isPdf = (d: Drawing) => d.mimeType === 'application/pdf';

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Drawings</Text>
        <Pressable
          style={[styles.importBtn, importing && styles.importBtnBusy]}
          onPress={handleImport}
          disabled={importing}
        >
          <Text style={styles.importBtnText}>{importing ? 'Importing…' : '+ Import'}</Text>
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
              No drawings yet.{'\n'}Tap + Import to add PDFs or images from the architect.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => setViewing(item)}
              onLongPress={() => confirmDelete(item)}
            >
              <View style={[styles.typeTag, isPdf(item) && styles.typeTagPdf]}>
                <Text style={styles.typeText}>{typeLabel(item.mimeType)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>{item.originalName}</Text>
                <Text style={styles.date}>{formatDate(item.importedAt)}</Text>
              </View>
              <Pressable onPress={() => confirmDelete(item)} hitSlop={12} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>✕</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {viewing && (
        <Modal visible animationType="slide" onRequestClose={() => setViewing(null)}>
          <View style={[styles.viewerScreen, { paddingTop: insets.top }]}>
            <View style={styles.viewerToolbar}>
              <Pressable onPress={() => setViewing(null)} style={styles.doneBtn}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
              <Text style={styles.viewerTitle} numberOfLines={1}>{viewing.originalName}</Text>
              {isPdf(viewing) && (
                <Pressable
                  style={styles.openBtn}
                  onPress={() => Sharing.shareAsync(viewing.filePath, { mimeType: viewing.mimeType, dialogTitle: viewing.originalName })}
                >
                  <Text style={styles.openBtnText}>Open in…</Text>
                </Pressable>
              )}
              {!isPdf(viewing) && <View style={{ width: 72 }} />}
            </View>
            <WebView
              source={{ uri: viewing.filePath }}
              style={styles.webview}
              scalesPageToFit={!isPdf(viewing)}
              startInLoadingState
              renderLoading={() => <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />}
              onError={() => {
                if (isPdf(viewing)) {
                  Sharing.shareAsync(viewing.filePath, { mimeType: viewing.mimeType, dialogTitle: viewing.originalName });
                  setViewing(null);
                }
              }}
            />
          </View>
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
    padding: space.md, marginBottom: space.sm,
  },
  typeTag: { backgroundColor: colors.ground, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 4, minWidth: 36, alignItems: 'center' },
  typeTagPdf: { backgroundColor: '#3B1F0A' },
  typeText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: space.xs },
  deleteText: { color: colors.textMuted, fontSize: 16 },
  viewerScreen: { flex: 1, backgroundColor: '#000' },
  viewerToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.md, paddingVertical: space.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  doneBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 64, alignItems: 'center' },
  doneBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  viewerTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600', textAlign: 'center', marginHorizontal: space.sm },
  openBtn: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.hairline, minWidth: 72, alignItems: 'center' },
  openBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  webview: { flex: 1 },
});
