import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { emitVoiceAction } from '../../voice/voice-bus';

/**
 * Small header-embedded trigger for the global voice-control sheet — used on
 * the four screens (Home, Estimate, Projects, project detail) that place
 * their own mic button in the header instead of the floating one GlobalVoiceControl
 * shows everywhere else (see hasOwnHeaderMic in GlobalVoiceControl.tsx).
 */
export function HeaderMicButton() {
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
});
