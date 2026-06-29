import React from 'react';
import { Modal, Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius } from '../theme/tokens';

interface Props {
  visible: boolean;
  html: string | null;
  onClose: () => void;
}

export function PdfPreviewModal({ visible, html, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle}>Quote preview</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>
        {html ? (
          <WebView
            source={{ html }}
            style={styles.web}
            startInLoadingState
            renderLoading={() => <ActivityIndicator color={colors.accent} style={styles.loader} />}
          />
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  toolbarTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  closeBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  closeText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  web: { flex: 1, backgroundColor: '#fff' },
  loader: { flex: 1 },
});
