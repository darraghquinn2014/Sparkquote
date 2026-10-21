/**
 * Full-screen player for the bundled Projects walkthrough video (import a
 * plan, trace walls, tag photos, price rooms). Auto-opened from the Projects
 * tab until the user taps "Don't show again"; replayable from Settings.
 */
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const DEMO_VIDEO = require('@/assets/video/projects-demo.mp4');

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Shown on the auto-opened version only — Settings replays have just Close. */
  onDontShowAgain?: () => void;
}

export function ProjectsDemoModal({ visible, onClose, onDontShowAgain }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Mounted only while open, so the player isn't created on every Projects visit. */}
      {visible && <DemoContent onClose={onClose} onDontShowAgain={onDontShowAgain} />}
    </Modal>
  );
}

function DemoContent({ onClose, onDontShowAgain }: Omit<Props, 'visible'>) {
  const player = useVideoPlayer(DEMO_VIDEO, (p) => {
    p.muted = true;
    p.play();
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>See what Projects can do</Text>
          <Text style={styles.sub}>Floor plans, walls, room photos and per-room quotes</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close demo">
          <Text style={styles.closeX}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.videoWrap}>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      </View>

      <View style={styles.footer}>
        {onDontShowAgain && (
          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onDontShowAgain}>
            <Text style={styles.btnSecondaryText}>Don't show again</Text>
          </Pressable>
        )}
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
          <Text style={styles.btnPrimaryText}>{onDontShowAgain ? 'Close' : 'Done'}</Text>
        </Pressable>
      </View>
      {onDontShowAgain && (
        <Text style={styles.footnote}>You can watch this again any time in Settings.</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  closeX: { fontSize: 22, color: colors.textSecondary, fontWeight: '700', paddingHorizontal: space.xs },
  videoWrap: { flex: 1, marginHorizontal: space.lg, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: '#000' },
  video: { flex: 1 },
  footer: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  btn: { flex: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: radius.pill },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  btnSecondary: { borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  btnSecondaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  footnote: { textAlign: 'center', color: colors.textMuted, fontSize: 12, paddingTop: space.sm, paddingBottom: space.sm },
});
