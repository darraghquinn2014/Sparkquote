/**
 * New project screen — name + optional client. Creates the project and
 * navigates into its detail to start adding rooms.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { createProject, setProjectPhoto } from '@/src/data/project-repo';
import { saveCapture } from '@/src/media/camera-service';
import { captureCurrentLocation } from '@/src/media/location-service';
import { SimpleCameraCapture } from '@/src/ui/photos/SimpleCameraCapture';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const mediaPaths = {
  documentDir: FileSystem.documentDirectory ?? '',
  cacheDir: FileSystem.cacheDirectory ?? '',
};

export default function NewProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0;

  const useCurrentLocation = async () => {
    try {
      setLocating(true);
      const captured = await captureCurrentLocation();
      setLocation({ latitude: captured.latitude, longitude: captured.longitude });
      if (captured.address && !address.trim()) setAddress(captured.address);
    } catch (e) {
      Alert.alert('Could not get location', String(e instanceof Error ? e.message : e));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      const id = await createProject(name.trim(), clientName.trim() || undefined, address.trim() || undefined, location ?? undefined);
      if (photoUri) {
        const photo = await saveCapture({ sourceUri: photoUri, paths: mediaPaths, projectId: id, quality: 'medium' });
        await setProjectPhoto(id, photo.filePath);
      }
      router.replace(`/project/${id}` as any);
    } catch (e) {
      Alert.alert('Could not create project', String(e));
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title}>New project</Text>
        <Pressable onPress={save} disabled={!canSave || saving}>
          <Text style={[styles.save, (!canSave || saving) && styles.saveDisabled]}>Create</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Project name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Smith Kitchen Rewire" placeholderTextColor={colors.textMuted} style={styles.input} autoFocus />

        <Text style={styles.label}>Client name (optional)</Text>
        <TextInput value={clientName} onChangeText={setClientName} placeholder="e.g. John Smith" placeholderTextColor={colors.textMuted} style={styles.input} />

        <Text style={styles.label}>Site address (optional)</Text>
        <TextInput value={address} onChangeText={setAddress} placeholder="e.g. 14 Main St, Mulliban" placeholderTextColor={colors.textMuted} style={styles.input} />
        <Pressable style={styles.locationBtn} onPress={useCurrentLocation} disabled={locating}>
          <Text style={styles.locationBtnText}>
            {locating ? 'Getting location…' : location ? '📍 Location captured — tap to refresh' : '📍 Use current location'}
          </Text>
        </Pressable>
        {location ? (
          <Text style={styles.locationHint}>No formal address yet? GPS is saved and will pin this site accurately.</Text>
        ) : null}

        <Text style={styles.label}>Photo (optional)</Text>
        {photoUri ? (
          <Pressable style={styles.photoPreviewWrap} onPress={() => setCameraOpen(true)}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
            <View style={styles.photoRetakeBadge}><Text style={styles.photoRetakeText}>Retake</Text></View>
          </Pressable>
        ) : (
          <Pressable style={styles.addPhotoBtn} onPress={() => setCameraOpen(true)}>
            <Text style={styles.addPhotoText}>+ Add photo</Text>
          </Pressable>
        )}
      </View>

      <SimpleCameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={(uri) => { setPhotoUri(uri); setCameraOpen(false); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  cancel: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  save: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  saveDisabled: { opacity: 0.4 },
  body: { padding: space.lg },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, marginBottom: space.sm, marginTop: space.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16 },
  locationBtn: { marginTop: space.sm, alignSelf: 'flex-start' },
  locationBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  locationHint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  addPhotoBtn: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingVertical: space.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.hairline, borderStyle: 'dashed' },
  addPhotoText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  photoPreviewWrap: { borderRadius: radius.tile, overflow: 'hidden', height: 160 },
  photoPreview: { width: '100%', height: '100%' },
  photoRetakeBadge: { position: 'absolute', bottom: space.sm, right: space.sm, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
  photoRetakeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
