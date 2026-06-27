/**
 * New project screen — name + optional client. Creates the project and
 * navigates into its detail to start adding rooms.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createProject } from '@/src/data/project-repo';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export default function NewProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      const id = await createProject(name.trim(), clientName.trim() || undefined);
      router.replace(`/project/${id}` as any);
    } catch (e) {
      Alert.alert('Could not create project', String(e));
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  cancel: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  save: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  saveDisabled: { opacity: 0.4 },
  body: { padding: space.lg },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: colors.textMuted, marginBottom: space.sm, marginTop: space.md },
  input: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16 },
});
