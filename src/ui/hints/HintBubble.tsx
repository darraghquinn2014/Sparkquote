import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, space, radius, type } from '@/src/ui/theme/tokens';

interface HintBubbleProps {
  text: string;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  /** Extra clearance for the system nav bar. RN positions absolute children
   * relative to the parent's full border box, ignoring the parent's own
   * safe-area padding — so on screens with no tab bar below them (the
   * SafeAreaView's box runs edge-to-edge) this must be the real bottom inset,
   * or the bubble sits behind the gesture/button nav bar. Tab screens don't
   * need it: their content box already ends above the tab bar. */
  bottomInset?: number;
}

/** A chat-style tip bubble, docked above the tab bar, that steps an electrician
 * through what to tap next on a screen. Not anchored to a specific element —
 * screens here scroll and reflow too much for pixel-accurate pointers to hold up
 * reliably in the field, so the copy itself says what to tap. */
export function HintBubble({ text, stepIndex, total, onNext, onSkip, bottomInset = 0 }: HintBubbleProps) {
  const isLast = stepIndex + 1 >= total;
  return (
    <View style={[styles.wrap, { bottom: space.lg + bottomInset }]} pointerEvents="box-none">
      <View style={styles.bubble}>
        <View style={styles.tail} />
        <View style={styles.row}>
          <View style={styles.badge}><Text style={styles.badgeText}>💡</Text></View>
          <Text style={styles.text}>{text}</Text>
          <Pressable onPress={onSkip} hitSlop={10} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.footer}>
          {total > 1 ? (
            <View style={styles.dots}>
              {Array.from({ length: total }).map((_, i) => (
                <View key={i} style={[styles.dot, i === stepIndex && styles.dotActive]} />
              ))}
            </View>
          ) : <View />}
          <Pressable style={styles.nextBtn} onPress={onNext}>
            <Text style={styles.nextBtnText}>{isLast ? 'Got it' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface HintFabProps {
  onPress: () => void;
  bottomInset?: number;
}

/** Persistent "?" affordance to replay a screen's hints on demand. Hidden
 * entirely when the user has switched hints off in Settings. */
export function HintFab({ onPress, bottomInset = 0 }: HintFabProps) {
  return (
    <Pressable style={[styles.fab, { bottom: space.lg + bottomInset }]} onPress={onPress} hitSlop={8}>
      <Text style={styles.fabText}>?</Text>
    </Pressable>
  );
}

/** Inline "?" for a screen header — use instead of the floating HintFab on
 * screens whose content reaches the bottom edge (e.g. Home), where the FAB
 * would sit on top of a card. Same look as HeaderMicButton. */
export function HintHeaderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.headerBtn} onPress={onPress} hitSlop={8} accessibilityLabel="Show tips">
      <Text style={styles.fabText}>?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
  },
  wrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    zIndex: 50,
  },
  bubble: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.bar,
    padding: space.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  tail: {
    position: 'absolute',
    bottom: -8,
    right: space.xl,
    width: 16,
    height: 16,
    backgroundColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  badge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 14 },
  text: { flex: 1, color: '#FFFFFF', ...type.body, lineHeight: 20 },
  close: { padding: 2 },
  closeText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: space.md,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: colors.accent },
  nextBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: space.lg, paddingVertical: 8,
  },
  nextBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },
  fab: {
    position: 'absolute',
    left: space.lg,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.hairline,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
    zIndex: 40,
  },
  fabText: { color: colors.accent, fontWeight: '800', fontSize: 16 },
});
