/**
 * First-run setup — four short steps shown once on first launch (and
 * re-runnable from Settings): business name + logo → labour rate → VAT →
 * prices. Every step is prefilled from what's already saved and can be
 * skipped; "Skip setup" marks it done without changing anything.
 *
 * Nothing is saved until "Finish", except the logo, which the shared picker
 * writes straight to LOGO_PATH (same as the Business profile screen).
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, BackHandler, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import {
  loadBusinessProfile, saveBusinessProfile, pickAndSaveLogo, LOGO_PATH,
  type BusinessProfile,
} from '@/src/data/business-profile';
import { loadSuppliers, type SupplierSummary } from '@/src/data/catalogue-repo';
import { CEF_CATALOGUE_ID } from '@/src/data/seed/cef-materials';
import { UK_CATALOGUE_ID } from '@/src/data/seed/materials';
import { useSettingsStore } from '@/src/state/settingsStore';
import type { Currency } from '@/src/domain/types';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const STEPS = ['Your business', 'Labour rate', 'VAT', 'Prices'] as const;
const STANDARD_VAT: Record<Currency, number> = { GBP: 20, EUR: 23 };

/** Friendlier names for the price lists that ship with the app. */
function priceListLabel(s: SupplierSummary): { title: string; sub: string } {
  if (s.catalogueId === UK_CATALOGUE_ID) {
    return { title: 'Built-in guide prices', sub: `${s.itemCount} items · rough guide prices, not from a supplier` };
  }
  if (s.catalogueId === CEF_CATALOGUE_ID) {
    return { title: 'CEF price book', sub: `${s.itemCount} items · trade cost prices` };
  }
  return { title: s.displayName, sub: `${s.itemCount} items · imported` };
}

export default function SetupScreen() {
  const router = useRouter();
  const settings = useSettingsStore();

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [name, setName] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [currency, setCurrency] = useState<Currency>(settings.currency);
  const [rateText, setRateText] = useState((settings.hourlyRateMinor / 100).toFixed(2));
  const [vatRegistered, setVatRegistered] = useState(settings.vatRatePct > 0);
  const [vatText, setVatText] = useState(String(settings.vatRatePct > 0 ? settings.vatRatePct : STANDARD_VAT[settings.currency]));
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  // 'all' = no preference; 'import' = finish, then open the import screen.
  const [priceChoice, setPriceChoice] = useState<string>(settings.preferredSupplierId ?? 'all');

  useEffect(() => {
    (async () => {
      const [p, list] = await Promise.all([loadBusinessProfile(), loadSuppliers()]);
      setProfile(p);
      setName(p.businessName);
      if (p.logoPath && (await FileSystem.getInfoAsync(p.logoPath)).exists) setLogoUri(p.logoPath);
      setSuppliers(list);
    })().catch((e) => console.error('setup load failed', e));
  }, []);

  const skipSetup = () => {
    settings.setFirstRunSetupComplete(true);
    router.back();
  };

  // Android back steps backwards; on the first step it skips setup (so Home
  // doesn't immediately reopen it).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) setStep(step - 1);
      else skipSetup();
      return true;
    });
    return () => sub.remove();
  });

  const pickLogo = async () => {
    try {
      setPickingLogo(true);
      if (await pickAndSaveLogo()) setLogoUri(LOGO_PATH + '?t=' + Date.now());
    } catch (e) {
      Alert.alert('Could not load image', String(e));
    } finally {
      setPickingLogo(false);
    }
  };

  const chooseCurrency = (c: Currency) => {
    setCurrency(c);
    // Follow the currency's standard VAT rate unless they've typed their own.
    if (vatText === String(STANDARD_VAT[currency])) setVatText(String(STANDARD_VAT[c]));
  };

  const finish = async () => {
    try {
      await saveBusinessProfile({
        businessName: name.trim(),
        tagline: profile?.tagline ?? '',
        logoPath: logoUri ? LOGO_PATH : null,
      });
      const rate = parseFloat(rateText);
      if (Number.isFinite(rate) && rate > 0) settings.setHourlyRate(Math.round(rate * 100));
      settings.setCurrency(currency);
      const vat = parseFloat(vatText);
      settings.setVatRate(vatRegistered ? (Number.isFinite(vat) && vat >= 0 ? vat : STANDARD_VAT[currency]) : 0);
      settings.setPreferredSupplierId(priceChoice === 'all' || priceChoice === 'import' ? null : priceChoice);
      settings.setFirstRunSetupComplete(true);
      if (priceChoice === 'import') router.replace('/import');
      else router.back();
    } catch (e) {
      Alert.alert('Could not save', String(e));
    }
  };

  const symbol = currency === 'GBP' ? '£' : '€';
  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          {step > 0 ? (
            <Pressable onPress={() => setStep(step - 1)} hitSlop={12}>
              <Text style={styles.back}>‹ Back</Text>
            </Pressable>
          ) : <View />}
          <Pressable onPress={skipSetup} hitSlop={12}>
            <Text style={styles.skip}>Skip setup</Text>
          </Pressable>
        </View>

        <View style={styles.progressRow}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.progressBar, i <= step && styles.progressBarActive]} />
          ))}
        </View>
        <Text style={styles.stepCount}>Step {step + 1} of {STEPS.length}</Text>
        <Text style={styles.title}>{STEPS[step]}</Text>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={styles.lead}>This goes at the top of every quote and certificate you send.</Text>
              <Text style={styles.label}>Business name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Quinn Electrical"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                returnKeyType="done"
              />
              <Text style={[styles.label, { marginTop: space.xl }]}>Logo (optional)</Text>
              <View style={styles.logoRow}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoPreview} contentFit="contain" />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Text style={styles.logoPlaceholderText}>No logo</Text>
                  </View>
                )}
                <Pressable style={styles.secondaryBtn} onPress={pickLogo} disabled={pickingLogo}>
                  {pickingLogo
                    ? <ActivityIndicator color={colors.accent} />
                    : <Text style={styles.secondaryBtnText}>{logoUri ? 'Change logo' : 'Upload logo'}</Text>}
                </Pressable>
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.lead}>What you charge per hour. New quotes start at this rate — you can still change it on any job.</Text>
              <Text style={styles.label}>Currency</Text>
              <View style={styles.choiceRow}>
                {(['GBP', 'EUR'] as const).map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.chip, currency === c && styles.chipActive]}
                    onPress={() => chooseCurrency(c)}
                  >
                    <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>
                      {c === 'GBP' ? '£ GBP' : '€ EUR'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, { marginTop: space.xl }]}>Labour rate</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountAffix}>{symbol}</Text>
                <TextInput
                  value={rateText}
                  onChangeText={(t) => setRateText(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.amountInput]}
                  selectTextOnFocus
                />
                <Text style={styles.amountAffix}>/hr</Text>
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.lead}>Are you VAT registered?</Text>
              <View style={styles.choiceRow}>
                {[true, false].map((v) => (
                  <Pressable
                    key={String(v)}
                    style={[styles.bigChoice, vatRegistered === v && styles.bigChoiceActive]}
                    onPress={() => setVatRegistered(v)}
                  >
                    <Text style={[styles.bigChoiceText, vatRegistered === v && styles.chipTextActive]}>
                      {v ? 'Yes' : 'No'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {vatRegistered ? (
                <>
                  <Text style={[styles.label, { marginTop: space.xl }]}>VAT rate</Text>
                  <View style={styles.amountRow}>
                    <TextInput
                      value={vatText}
                      onChangeText={(t) => setVatText(t.replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.amountInput]}
                      selectTextOnFocus
                    />
                    <Text style={styles.amountAffix}>%</Text>
                  </View>
                  <Text style={styles.hint}>Standard rate is {STANDARD_VAT[currency]}% for {currency === 'GBP' ? 'the UK' : 'Ireland'}.</Text>
                </>
              ) : (
                <Text style={[styles.hint, { marginTop: space.lg }]}>Quotes won’t add VAT. You can change this later in Settings.</Text>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <View style={styles.warnCard}>
                <Text style={styles.warnTitle}>Check your prices</Text>
                <Text style={styles.warnText}>
                  The built-in prices are rough guides, not your supplier’s prices. Check them — or import your own price list — before you send real quotes.
                </Text>
              </View>
              <Text style={[styles.label, { marginTop: space.xl }]}>Which prices do you want to use first?</Text>
              {[
                { id: 'all', title: 'Show all price lists', sub: 'Pick between them when adding materials' },
                ...suppliers.map((s) => ({ id: s.catalogueId, ...priceListLabel(s) })),
                { id: 'import', title: 'Import my own price list', sub: 'From your wholesaler (.csv or .xlsx) — opens after setup' },
              ].map((o) => (
                <Pressable
                  key={o.id}
                  style={[styles.option, priceChoice === o.id && styles.optionActive]}
                  onPress={() => setPriceChoice(o.id)}
                >
                  <View style={[styles.radio, priceChoice === o.id && styles.radioActive]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{o.title}</Text>
                    <Text style={styles.optionSub}>{o.sub}</Text>
                  </View>
                </Pressable>
              ))}
              {priceChoice === CEF_CATALOGUE_ID && (
                <Text style={styles.hint}>CEF prices are trade cost. Add your markup on each line when you quote.</Text>
              )}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={isLast ? finish : () => setStep(step + 1)}>
            <Text style={styles.primaryBtnText}>{isLast ? 'Finish' : 'Next'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  skip: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  progressRow: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.lg },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.hairline },
  progressBarActive: { backgroundColor: colors.accent },
  stepCount: { color: colors.textMuted, fontSize: 13, fontWeight: '600', paddingHorizontal: space.lg, marginTop: space.lg },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', paddingHorizontal: space.lg, marginTop: space.xs },
  body: { padding: space.lg, paddingBottom: space.xxl },
  lead: { color: colors.textSecondary, fontSize: 16, lineHeight: 23, marginBottom: space.xl },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
    color: colors.textPrimary, fontSize: 16,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: space.sm, lineHeight: 19 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  logoPreview: { width: 100, height: 64, borderRadius: radius.tile, backgroundColor: colors.surface },
  logoPlaceholder: {
    width: 100, height: 64, borderRadius: radius.tile,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline, borderStyle: 'dashed',
  },
  logoPlaceholderText: { color: colors.textMuted, fontSize: 12 },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: space.lg, paddingVertical: space.sm, minWidth: 120, alignItems: 'center',
  },
  secondaryBtnText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  choiceRow: { flexDirection: 'row', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  chipTextActive: { color: colors.accentInk, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amountInput: { width: 140, fontSize: 22, fontWeight: '700' },
  amountAffix: { color: colors.textSecondary, fontSize: 20, fontWeight: '700' },
  bigChoice: {
    flex: 1, paddingVertical: space.lg, borderRadius: radius.tile, alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
  },
  bigChoiceActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  bigChoiceText: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  warnCard: {
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg,
    borderLeftWidth: 4, borderLeftColor: colors.accent,
  },
  warnTitle: { color: colors.accent, fontSize: 16, fontWeight: '800', marginBottom: space.xs },
  warnText: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg,
    marginBottom: space.sm, borderWidth: 1, borderColor: colors.surface,
  },
  optionActive: { borderColor: colors.accent },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.hairline },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  optionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  optionSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.hairline },
  primaryBtn: {
    backgroundColor: colors.accent, borderRadius: radius.bar,
    paddingVertical: space.lg, alignItems: 'center',
  },
  primaryBtnText: { color: colors.accentInk, fontSize: 17, fontWeight: '800' },
});
