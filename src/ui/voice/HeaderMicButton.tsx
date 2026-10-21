import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { emitVoiceAction } from '../../voice/voice-bus';
import { useSettingsStore } from '../../state/settingsStore';

/**
 * Small header-embedded trigger for the global voice-control sheet — used on
 * the screens (Estimate, Projects, project detail, …) that place
 * their own mic button in the header instead of the floating one GlobalVoiceControl
 * shows everywhere else (see hasOwnHeaderMic in GlobalVoiceControl.tsx).
 * Hidden in simple mode — voice is an advanced feature. Headers that centre
 * their title between Back and the mic pass keepSpace, so an empty spot of the
 * same size keeps the title centred.
 */
export function HeaderMicButton({ keepSpace = false }: { keepSpace?: boolean }) {
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  if (!advancedMode) return keepSpace ? <View style={styles.placeholder} /> : null;
  return (
    <Pressable style={styles.btn} onPress={() => emitVoiceAction('openVoiceControl')} hitSlop={8} accessibilityLabel="Voice control">
      <Text style={styles.glyph}>🎤</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36, height: 36, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
  },
  glyph: { fontSize: 16 },
  placeholder: { width: 36, height: 36 },
});
