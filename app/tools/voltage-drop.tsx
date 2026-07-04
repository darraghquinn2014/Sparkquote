import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import {
  CABLE_SIZES, CABLE_MV_PER_A_PER_M, calculateVoltageDrop,
  type CableSize, type Phase, type VoltageDropLimit,
} from '@/src/domain/electrical-calcs';

const ACCENT = '#FF6A3D';

function numeric(text: string): number | null {
  const n = parseFloat(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function VoltageDropScreen() {
  const router = useRouter();
  const [sizeMode, setSizeMode] = useState<'preset' | 'custom'>('preset');
  const [selectedSize, setSelectedSize] = useState<CableSize>('2.5');
  const [customMv, setCustomMv] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [lengthText, setLengthText] = useState('');
  const [phase, setPhase] = useState<Phase>('single');
  const [supplyText, setSupplyText] = useState('230');
  const [limit, setLimit] = useState<VoltageDropLimit>('other');

  const mVPerAPerM = sizeMode === 'preset' ? CABLE_MV_PER_A_PER_M[selectedSize] : numeric(customMv);
  const currentA = numeric(currentText);
  const lengthM = numeric(lengthText);
  const supplyVoltage = numeric(supplyText);

  const result = useMemo(() => {
    if (mVPerAPerM == null || currentA == null || lengthM == null || supplyVoltage == null) return null;
    return calculateVoltageDrop({ mVPerAPerM, currentA, lengthM, phase, supplyVoltage }, limit);
  }, [mVPerAPerM, currentA, lengthM, phase, supplyVoltage, limit]);

  const setPhaseAndDefault = (p: Phase) => {
    setPhase(p);
    setSupplyText(p === 'single' ? '230' : '400');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Voltage Drop</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Cable size</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, sizeMode === 'preset' && styles.modeActive]}
              onPress={() => setSizeMode('preset')}
            >
              <Text style={[styles.modeText, sizeMode === 'preset' && styles.modeTextActive]}>T&E table</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, sizeMode === 'custom' && styles.modeActive]}
              onPress={() => setSizeMode('custom')}
            >
              <Text style={[styles.modeText, sizeMode === 'custom' && styles.modeTextActive]}>Custom mV/A/m</Text>
            </Pressable>
          </View>

          {sizeMode === 'preset' ? (
            <View style={styles.chipRow}>
              {CABLE_SIZES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, selectedSize === s && { backgroundColor: ACCENT }]}
                  onPress={() => setSelectedSize(s)}
                >
                  <Text style={[styles.chipText, selectedSize === s && styles.chipTextActive]}>{s}mm²</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput
                value={customMv}
                onChangeText={(t) => setCustomMv(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="e.g. 18"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Text style={styles.suffix}>mV/A/m</Text>
            </View>
          )}
          {sizeMode === 'preset' && (
            <Text style={styles.hint}>
              {CABLE_MV_PER_A_PER_M[selectedSize]} mV/A/m — typical PVC/T&E copper, 70°C. Verify against
              manufacturer data for compliance-critical work.
            </Text>
          )}

          <Text style={styles.label}>Design current</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={currentText}
              onChangeText={(t) => setCurrentText(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="e.g. 20"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.suffix}>A</Text>
          </View>

          <Text style={styles.label}>Cable run length</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={lengthText}
              onChangeText={(t) => setLengthText(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="e.g. 15"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.suffix}>m</Text>
          </View>

          <Text style={styles.label}>Phase</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, phase === 'single' && styles.modeActive]}
              onPress={() => setPhaseAndDefault('single')}
            >
              <Text style={[styles.modeText, phase === 'single' && styles.modeTextActive]}>Single (230V)</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, phase === 'three' && styles.modeActive]}
              onPress={() => setPhaseAndDefault('three')}
            >
              <Text style={[styles.modeText, phase === 'three' && styles.modeTextActive]}>Three (400V)</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Supply voltage</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={supplyText}
              onChangeText={(t) => setSupplyText(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.suffix}>V</Text>
          </View>

          <Text style={styles.label}>Circuit limit</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, limit === 'lighting' && styles.modeActive]}
              onPress={() => setLimit('lighting')}
            >
              <Text style={[styles.modeText, limit === 'lighting' && styles.modeTextActive]}>Lighting (3%)</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, limit === 'other' && styles.modeActive]}
              onPress={() => setLimit('other')}
            >
              <Text style={[styles.modeText, limit === 'other' && styles.modeTextActive]}>Other (5%)</Text>
            </Pressable>
          </View>

          {result && (
            <View style={[styles.resultCard, { borderColor: result.withinLimit ? colors.catTesting : colors.danger }]}>
              <Text style={styles.resultDrop}>{result.dropVolts.toFixed(2)} V</Text>
              <Text style={[styles.resultPercent, { color: result.withinLimit ? colors.catTesting : colors.danger }]}>
                {result.dropPercent.toFixed(2)}% of supply — limit {result.limitPercent}%
              </Text>
              <Text style={[styles.resultBadge, { color: result.withinLimit ? colors.catTesting : colors.danger }]}>
                {result.withinLimit ? '✓ Within limit' : '✗ Exceeds limit'}
              </Text>
            </View>
          )}
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
  body: { padding: space.lg, paddingBottom: space.xxl + 88 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, marginBottom: space.sm, marginTop: space.lg },
  modeRow: { flexDirection: 'row', gap: space.sm },
  modeBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile, backgroundColor: colors.surface, alignItems: 'center' },
  modeActive: { backgroundColor: ACCENT },
  modeText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  modeTextActive: { color: colors.accentInk },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  chipTextActive: { color: colors.accentInk },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: space.sm, lineHeight: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md },
  input: { flex: 1, paddingVertical: space.md, color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  suffix: { color: colors.textMuted, fontWeight: '700', fontSize: 14, marginLeft: space.xs },
  resultCard: {
    marginTop: space.xl, padding: space.lg, borderRadius: radius.bar,
    borderWidth: 1.5, backgroundColor: colors.surface, alignItems: 'center', gap: space.xs,
  },
  resultDrop: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  resultPercent: { fontSize: 14, fontWeight: '600' },
  resultBadge: { fontSize: 15, fontWeight: '800', marginTop: space.xs },
});
