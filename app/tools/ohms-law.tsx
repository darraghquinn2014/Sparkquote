import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import { solveOhmsLaw, type OhmsLawKnowns } from '@/src/domain/electrical-calcs';

const ACCENT = colors.accentSecondary;

type FieldKey = 'voltage' | 'current' | 'resistance' | 'power';

const FIELDS: { key: FieldKey; label: string; unit: string; symbol: string }[] = [
  { key: 'voltage', label: 'Voltage', unit: 'V', symbol: 'V' },
  { key: 'current', label: 'Current', unit: 'A', symbol: 'I' },
  { key: 'resistance', label: 'Resistance', unit: 'Ω', symbol: 'R' },
  { key: 'power', label: 'Power', unit: 'W', symbol: 'P' },
];

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString();
}

export default function OhmsLawScreen() {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    voltage: '', current: '', resistance: '', power: '',
  });
  const [touched, setTouched] = useState<FieldKey[]>([]);

  const onChange = (key: FieldKey, text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    setValues((v) => ({ ...v, [key]: cleaned }));
    setTouched((t) => [...t.filter((k) => k !== key), key].slice(-2));
  };

  const makeEditable = (key: FieldKey) => {
    if (touched.includes(key)) return;
    setValues((v) => ({ ...v, [key]: '' }));
    setTouched((t) => [...t, key].slice(-2));
  };

  const result = useMemo(() => {
    if (touched.length < 2) return null;
    const knowns: OhmsLawKnowns = {};
    for (const key of touched) {
      const n = parseFloat(values[key]);
      if (!Number.isFinite(n) || n <= 0) return null;
      knowns[key] = n;
    }
    return solveOhmsLaw(knowns);
  }, [touched, values]);

  const reset = () => {
    setValues({ voltage: '', current: '', resistance: '', power: '' });
    setTouched([]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Ohm&apos;s Law</Text>
        <Pressable onPress={reset} hitSlop={12}>
          <Text style={styles.reset}>Reset</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>Enter any two values — the other two are solved automatically.</Text>

          {FIELDS.map((f) => {
            const isEditable = touched.includes(f.key);
            const computed = result ? result[f.key] : null;
            return (
              <View key={f.key} style={styles.field}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.symbol}>{f.symbol}</Text>
                  <Text style={styles.label}>{f.label}</Text>
                </View>
                {isEditable ? (
                  <View style={[styles.inputRow, styles.inputRowActive]}>
                    <TextInput
                      value={values[f.key]}
                      onChangeText={(t) => onChange(f.key, t)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                      autoFocus
                    />
                    <Text style={styles.suffix}>{f.unit}</Text>
                  </View>
                ) : (
                  <Pressable style={styles.inputRow} onPress={() => makeEditable(f.key)}>
                    <Text style={[styles.computedText, computed == null && styles.computedEmpty]}>
                      {computed != null ? fmt(computed) : '—'}
                    </Text>
                    <Text style={styles.suffix}>{f.unit}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
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
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  reset: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  body: { padding: space.lg, paddingBottom: space.xxl + 88 },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: space.lg, lineHeight: 18 },
  field: { marginBottom: space.lg },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.sm },
  symbol: { color: ACCENT, fontSize: 16, fontWeight: '800' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.tile, paddingHorizontal: space.md, borderWidth: 1, borderColor: 'transparent',
  },
  inputRowActive: { borderColor: ACCENT },
  input: { flex: 1, paddingVertical: space.md, color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  computedText: { flex: 1, paddingVertical: space.md, color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  computedEmpty: { color: colors.textMuted },
  suffix: { color: colors.textMuted, fontWeight: '700', fontSize: 14, marginLeft: space.xs },
});
