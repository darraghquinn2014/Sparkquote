import React from 'react';
import { Modal, Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius } from '../theme/tokens';

interface Props {
  visible: boolean;
  html: string | null;
  onClose: () => void;
  /** When provided, the toolbar becomes Back / Next and a "Next: send or sign"
   * button runs along the bottom, instead of a single Done button. */
  onFinalReview?: () => void;
}

export function PdfPreviewModal({ visible, html, onClose, onFinalReview }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.toolbar}>
          {onFinalReview ? (
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.backText}>‹ Back</Text>
            </Pressable>
          ) : (
            <Text style={styles.toolbarTitle}>Quote preview</Text>
          )}
          <Pressable onPress={onFinalReview ?? onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeText}>{onFinalReview ? 'Next ›' : 'Done'}</Text>
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
        {onFinalReview && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Pressable style={styles.nextBtn} onPress={onFinalReview}>
              <Text style={styles.nextText}>Next: send or sign ›</Text>
            </Pressable>
          </View>
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
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  closeBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  closeText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  web: { flex: 1, backgroundColor: '#fff' },
  footer: {
    paddingHorizontal: space.lg, paddingTop: space.md,
    borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface,
  },
  nextBtn: { backgroundColor: colors.accent, borderRadius: radius.bar, paddingVertical: space.lg, alignItems: 'center' },
  nextText: { color: colors.accentInk, fontSize: 17, fontWeight: '800' },
  loader: { flex: 1 },
});
