/**
 * Feedback — lets a field tester send a bug/idea/question straight to
 * hello@d2kweb.com, without needing any backend/cloud sync. Opens Mail with
 * the address, subject, and body already filled in (mailto:); if the device
 * has no mail client configured, Linking.canOpenURL catches that and falls
 * back to the generic OS share sheet (Messages/WhatsApp/etc.) instead of
 * just failing silently.
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Share, Alert, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const FEEDBACK_EMAIL = 'hello@d2kweb.com';

type FeedbackType = 'bug' | 'idea' | 'question';

const TYPES: FeedbackType[] = ['bug', 'idea', 'question'];
const TYPE_LABELS: Record<FeedbackType, string> = { bug: 'Bug', idea: 'Idea', question: 'Question' };

export default function FeedbackScreen() {
  const router = useRouter();
  const [type, setType] = useState<FeedbackType>('bug');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) {
      Alert.alert('Add some details', "Write what happened or what you'd like, then send.");
      return;
    }
    setSending(true);
    try {
      const appVersion = Constants.expoConfig?.version ?? 'unknown';
      const subject = `SparkQuote feedback — ${TYPE_LABELS[type]}`;
      const body = `${text.trim()}\n\n— ${Platform.OS}, app v${appVersion}`;
      const mailUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      if (await Linking.canOpenURL(mailUrl)) {
        await Linking.openURL(mailUrl);
      } else {
        await Share.share({ message: `To: ${FEEDBACK_EMAIL}\nSubject: ${subject}\n\n${body}` });
      }
      setText('');
      router.back();
    } catch (e) {
      Alert.alert("Couldn't send", String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Feedback</Text>
          <View style={{ width: 56 }} />
        </View>

        <Text style={styles.hint}>
          Send a bug, an idea, or anything that felt off — opens your Mail app addressed
          to {FEEDBACK_EMAIL} with this already filled in.
        </Text>

        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <Pressable
              key={t}
              style={[styles.typeChip, type === t && styles.typeChipActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                {TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="What happened, or what would help?"
          placeholderTextColor={colors.textMuted}
          multiline
          autoFocus
          textAlignVertical="top"
        />

        <Pressable
          style={[styles.sendBtn, (sending || !text.trim()) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={sending || !text.trim()}
        >
          <Text style={styles.sendBtnText}>{sending ? 'Opening…' : 'Send feedback'}</Text>
        </Pressable>
      </KeyboardAvoidingView>
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
  cancel: { color: colors.danger, fontSize: 15, fontWeight: '600', width: 56 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  hint: {
    color: colors.textSecondary, fontSize: 13, lineHeight: 18,
    paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md,
  },
  typeRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
  typeChip: {
    paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  typeChipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  typeChipTextActive: { color: colors.accentInk },
  input: {
    flex: 1, marginHorizontal: space.lg, backgroundColor: colors.surface,
    borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    padding: space.lg, fontSize: 16, color: colors.textPrimary,
  },
  sendBtn: {
    backgroundColor: colors.accent, borderRadius: radius.tile, paddingVertical: space.lg,
    alignItems: 'center', marginHorizontal: space.lg, marginTop: space.lg, marginBottom: space.lg,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
});
