import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSettingsStore } from '@/src/state/settingsStore';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hourlyRateMinor = useSettingsStore((s) => s.hourlyRateMinor);
  const vatRatePct = useSettingsStore((s) => s.vatRatePct);
  const currency = useSettingsStore((s) => s.currency);
  const setHourlyRate = useSettingsStore((s) => s.setHourlyRate);
  const setVatRate = useSettingsStore((s) => s.setVatRate);
  const setCurrency = useSettingsStore((s) => s.setCurrency);

  const [rateText, setRateText] = useState('');
  const [rateEditing, setRateEditing] = useState(false);
  const [vatText, setVatText] = useState('');
  const [vatEditing, setVatEditing] = useState(false);

  useFocusEffect(useCallback(() => { hydrate(); }, [hydrate]));

  const commitRate = () => {
    const n = parseFloat(rateText);
    if (Number.isFinite(n) && n > 0) setHourlyRate(Math.round(n * 100));
    setRateEditing(false);
  };

  const commitVat = () => {
    const n = parseFloat(vatText);
    if (Number.isFinite(n) && n >= 0) setVatRate(n);
    setVatEditing(false);
  };

  const symbol = currency === 'GBP' ? '£' : '€';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        {/* Job defaults */}
        <Text style={styles.sectionHeader}>JOB DEFAULTS</Text>

        {/* Hourly rate */}
        <Pressable
          style={styles.row}
          onPress={() => { setRateText(String((hourlyRateMinor / 100).toFixed(2))); setRateEditing(true); }}
        >
          <Text style={styles.rowText}>Labour rate</Text>
          {rateEditing ? (
            <View style={styles.inlineEdit}>
              <Text style={styles.inlineSymbol}>{symbol}</Text>
              <TextInput
                style={styles.inlineInput}
                value={rateText}
                onChangeText={(t) => setRateText(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                autoFocus
                onBlur={commitRate}
                returnKeyType="done"
                onSubmitEditing={commitRate}
              />
              <Text style={styles.inlineUnit}>/hr</Text>
            </View>
          ) : (
            <Text style={styles.rowValue}>{symbol}{(hourlyRateMinor / 100).toFixed(2)}/hr</Text>
          )}
        </Pressable>

        {/* VAT rate */}
        <Pressable
          style={styles.row}
          onPress={() => { setVatText(String(vatRatePct)); setVatEditing(true); }}
        >
          <Text style={styles.rowText}>VAT rate</Text>
          {vatEditing ? (
            <View style={styles.inlineEdit}>
              <TextInput
                style={styles.inlineInput}
                value={vatText}
                onChangeText={(t) => setVatText(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                autoFocus
                onBlur={commitVat}
                returnKeyType="done"
                onSubmitEditing={commitVat}
              />
              <Text style={styles.inlineUnit}>%</Text>
            </View>
          ) : (
            <Text style={styles.rowValue}>{vatRatePct}%</Text>
          )}
        </Pressable>

        {/* Currency */}
        <View style={styles.row}>
          <Text style={styles.rowText}>Currency</Text>
          <View style={styles.currencyRow}>
            {(['GBP', 'EUR'] as const).map((c) => (
              <Pressable
                key={c}
                style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[styles.currencyChipText, currency === c && styles.currencyChipTextActive]}>
                  {c === 'GBP' ? '£ GBP' : '€ EUR'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* App settings */}
        <Text style={styles.sectionHeader}>APP</Text>

        <Pressable style={styles.row} onPress={() => router.push('/business-profile' as any)}>
          <Text style={styles.rowText}>Business profile</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/media-settings')}>
          <Text style={styles.rowText}>Photos & storage</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/cloud-backup')}>
          <Text style={styles.rowText}>Cloud backup</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/profit-report' as any)}>
          <Text style={styles.rowText}>Profit report</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/suppliers')}>
          <Text style={styles.rowText}>Manage price lists</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/import')}>
          <Text style={styles.rowText}>Import wholesale prices</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/review')}>
          <Text style={styles.rowText}>Demo: Review & sign PDF</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2,
    paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, marginHorizontal: space.lg, marginBottom: space.sm,
    borderRadius: radius.tile, padding: 18, borderWidth: 1, borderColor: colors.hairline,
  },
  rowText: { fontSize: 16, color: colors.textPrimary, fontWeight: '600' },
  rowValue: { fontSize: 16, color: colors.accent, fontWeight: '700' },
  chevron: { fontSize: 22, color: colors.accent },
  inlineEdit: { flexDirection: 'row', alignItems: 'center' },
  inlineSymbol: { fontSize: 17, color: colors.textPrimary, fontWeight: '700' },
  inlineInput: {
    fontSize: 17, color: colors.textPrimary, fontWeight: '700',
    minWidth: 70, paddingHorizontal: 4, textAlign: 'right',
  },
  inlineUnit: { fontSize: 14, color: colors.textSecondary, marginLeft: 2 },
  currencyRow: { flexDirection: 'row', gap: space.sm },
  currencyChip: {
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.ground,
  },
  currencyChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  currencyChipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  currencyChipTextActive: { color: colors.accentInk },
});
