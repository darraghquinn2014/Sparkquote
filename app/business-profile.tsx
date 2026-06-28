import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Alert,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import {
  loadBusinessProfile, saveBusinessProfile, deleteLogoFile,
  LOGO_PATH, type BusinessProfile,
} from '@/src/data/business-profile';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export default function BusinessProfileScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const p = await loadBusinessProfile();
    setName(p.businessName);
    setTagline(p.tagline);
    if (p.logoPath) {
      const info = await FileSystem.getInfoAsync(p.logoPath);
      setLogoUri(info.exists ? p.logoPath : null);
    } else {
      setLogoUri(null);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickLogo = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setSaving(true);
      const asset = res.assets[0];
      // Resize to a sensible max for PDF embedding (~400px wide, 0.85 quality)
      const processed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 400 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      await FileSystem.copyAsync({ from: processed.uri, to: LOGO_PATH });
      setLogoUri(LOGO_PATH + '?t=' + Date.now()); // cache-bust for Image component
    } catch (e) {
      Alert.alert('Could not load image', String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeLogo = () => {
    Alert.alert('Remove logo?', 'The logo will no longer appear on PDFs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteLogoFile();
          setLogoUri(null);
        },
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const profile: BusinessProfile = {
        businessName: name.trim(),
        tagline: tagline.trim(),
        logoPath: logoUri ? LOGO_PATH : null,
      };
      await saveBusinessProfile(profile);
      router.back();
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Business profile</Text>
        <Pressable onPress={save} disabled={saving} hitSlop={12}>
          {saving
            ? <ActivityIndicator color={colors.accent} />
            : <Text style={styles.saveBtn}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <Text style={styles.label}>Company logo</Text>
        <View style={styles.logoRow}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.logoPreview}
              contentFit="contain"
            />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>No logo</Text>
            </View>
          )}
          <View style={styles.logoActions}>
            <Pressable style={styles.logoBtn} onPress={pickLogo}>
              <Text style={styles.logoBtnText}>{logoUri ? 'Change' : 'Upload logo'}</Text>
            </Pressable>
            {logoUri && (
              <Pressable style={styles.logoBtnDanger} onPress={removeLogo}>
                <Text style={styles.logoBtnDangerText}>Remove</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Text style={styles.hint}>Shown at the top of every PDF estimate. JPEG or PNG, any size.</Text>

        {/* Company name */}
        <Text style={[styles.label, { marginTop: space.xl }]}>Company name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Darragh Quinn Electrical"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="next"
        />

        {/* Tagline */}
        <Text style={[styles.label, { marginTop: space.lg }]}>Tagline / contact line</Text>
        <TextInput
          value={tagline}
          onChangeText={setTagline}
          placeholder="e.g. 07700 900123 · info@yourco.ie"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <Text style={styles.hint}>Shown below your company name on the PDF.</Text>

      </ScrollView>
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
  saveBtn: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  body: { padding: space.lg, paddingBottom: space.xxl },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
    color: colors.textPrimary, fontSize: 16,
  },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: space.xs, lineHeight: 17 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  logoPreview: { width: 100, height: 64, borderRadius: radius.tile, backgroundColor: colors.surface },
  logoPlaceholder: {
    width: 100, height: 64, borderRadius: radius.tile,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline, borderStyle: 'dashed',
  },
  logoPlaceholderText: { color: colors.textMuted, fontSize: 12 },
  logoActions: { gap: space.sm },
  logoBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  logoBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },
  logoBtnDanger: {
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  logoBtnDangerText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
