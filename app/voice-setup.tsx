/**
 * First-run (and re-visitable from Settings) voice vocabulary setup.
 *
 * Important: the on-device speech recognizer (expo-speech-recognition,
 * wrapping Android's system SpeechRecognizer / iOS SFSpeechRecognizer) has
 * no per-user acoustic/accent training API. What this screen actually does
 * is build a vocabulary hint list — the electrician's own price list, job
 * names, trade jargon, and any extra words they add here — and pass it to
 * the recognizer as `contextualStrings` on every future recognition call
 * (see src/voice/vocabulary.ts). The copy below is careful not to promise
 * "it learns your voice", since it doesn't.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '@/src/state/settingsStore';
import { useVoiceCommand } from '@/src/voice/useVoiceCommand';
import { buildVoiceVocabulary } from '@/src/voice/vocabulary';
import { colors, space, radius, type } from '@/src/ui/theme/tokens';

export default function VoiceSetupScreen() {
  const router = useRouter();
  const customVoiceWords = useSettingsStore((s) => s.customVoiceWords);
  const setCustomVoiceWords = useSettingsStore((s) => s.setCustomVoiceWords);
  const setVoiceSetupComplete = useSettingsStore((s) => s.setVoiceSetupComplete);

  const [words, setWords] = useState<string[]>(customVoiceWords);
  const [draft, setDraft] = useState('');
  const [testVocab, setTestVocab] = useState<string[] | null>(null);
  const voice = useVoiceCommand();

  useEffect(() => { setWords(customVoiceWords); }, [customVoiceWords]);

  const addWord = () => {
    const w = draft.trim();
    if (!w) return;
    if (!words.some((existing) => existing.toLowerCase() === w.toLowerCase())) {
      setWords((prev) => [...prev, w]);
    }
    setDraft('');
  };

  const removeWord = (w: string) => {
    setWords((prev) => prev.filter((existing) => existing !== w));
  };

  const runTest = useCallback(async () => {
    voice.reset();
    const vocab = await buildVoiceVocabulary(words);
    setTestVocab(vocab);
    await voice.start(vocab);
  }, [voice, words]);

  const finish = (complete: boolean) => {
    setCustomVoiceWords(words);
    setVoiceSetupComplete(complete);
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => finish(true)} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Voice setup</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          The mic listens with Android's built-in speech recognizer, so it can't be retrained on
          your accent. What we <Text style={styles.leadEm}>can</Text> do is prime it with your own
          vocabulary — your price list, your job names, and any trade terms below — so those words
          win over general English when it's guessing.
        </Text>

        <Text style={styles.sectionLabel}>ALREADY INCLUDED, AUTOMATICALLY</Text>
        <View style={styles.autoList}>
          <Text style={styles.autoItem}>• Every material and assembly name in your catalogue</Text>
          <Text style={styles.autoItem}>• Every project and client name</Text>
          <Text style={styles.autoItem}>• Common trade terms (RCBO, consumer unit, twin and earth…)</Text>
        </View>

        <Text style={styles.sectionLabel}>ADD YOUR OWN WORDS</Text>
        <Text style={styles.hint}>
          Your own name, brand names you say a lot, or site nicknames that aren't in the price list.
        </Text>
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. Darragh, Wago, the Maple job"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={addWord}
          />
          <Pressable style={styles.addBtn} onPress={addWord}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {words.length > 0 && (
          <View style={styles.chipRow}>
            {words.map((w) => (
              <Pressable key={w} style={styles.chip} onPress={() => removeWord(w)}>
                <Text style={styles.chipText}>{w}</Text>
                <Text style={styles.chipRemove}>×</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>TRY IT</Text>
        <Text style={styles.hint}>
          Say a command out loud — you'll see exactly what the recognizer heard, with today's
          vocabulary list active.
        </Text>
        <Pressable
          style={[styles.testBtn, voice.listening && styles.testBtnActive]}
          onPress={runTest}
          disabled={voice.listening}
        >
          {voice.listening
            ? <ActivityIndicator color={colors.accentInk} />
            : <Text style={styles.testBtnText}>Test recognition</Text>}
        </Pressable>

        {(voice.transcript || voice.interimTranscript) && (
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Heard:</Text>
            <Text style={styles.resultText}>
              {voice.transcript || voice.interimTranscript}
            </Text>
          </View>
        )}
        {voice.error && (
          <Text style={styles.errorText}>
            {voice.error === 'permission-denied'
              ? 'Microphone permission was denied — enable it in system settings to use voice control.'
              : voice.error === 'no-speech'
                ? "Didn't catch anything — try again a bit closer to the mic."
                : 'Recognition error — try again.'}
          </Text>
        )}
        {testVocab && (
          <Text style={styles.vocabNote}>{testVocab.length} words primed for this test.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.skipBtn} onPress={() => finish(true)}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </Pressable>
        <Pressable style={styles.doneBtn} onPress={() => finish(true)}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
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
  body: { padding: space.lg, paddingBottom: space.xxl, gap: space.sm },
  lead: { ...type.body, color: colors.textSecondary, lineHeight: 21, marginBottom: space.sm },
  leadEm: { color: colors.textPrimary, fontWeight: '700' },
  sectionLabel: { ...type.eyebrow, color: colors.textMuted, marginTop: space.lg },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: space.sm },
  autoList: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, gap: space.xs },
  autoItem: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  addRow: { flexDirection: 'row', gap: space.sm },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
    color: colors.textPrimary, fontSize: 15,
  },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.tile, paddingHorizontal: space.lg, justifyContent: 'center' },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill,
    backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.hairline,
  },
  chipText: { color: colors.textPrimary, fontWeight: '600', fontSize: 13 },
  chipRemove: { color: colors.textMuted, fontWeight: '800', fontSize: 14 },
  testBtn: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent,
    borderRadius: radius.bar, paddingVertical: space.md, alignItems: 'center', marginTop: space.xs,
  },
  testBtnActive: { backgroundColor: colors.accent },
  testBtnText: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  resultCard: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginTop: space.md },
  resultLabel: { ...type.eyebrow, color: colors.textMuted, marginBottom: 4 },
  resultText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 13, marginTop: space.sm, lineHeight: 18 },
  vocabNote: { color: colors.textMuted, fontSize: 11, marginTop: space.sm },
  footer: {
    flexDirection: 'row', gap: space.md,
    padding: space.lg, borderTopWidth: 1, borderTopColor: colors.hairline,
  },
  skipBtn: { flex: 1, paddingVertical: space.md, alignItems: 'center', borderRadius: radius.bar, borderWidth: 1, borderColor: colors.hairline },
  skipBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  doneBtn: { flex: 1, paddingVertical: space.md, alignItems: 'center', borderRadius: radius.bar, backgroundColor: colors.accent },
  doneBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
