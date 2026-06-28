import React, { useState } from 'react';
import { Alert, View, Text, Pressable, ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ColumnMappingScreen } from '@/src/ui/import/ColumnMappingScreen';
import { parseFileBytes } from '@/src/import/parse-sheet';
import { commitImport } from '@/src/import/commit';
import { loadCatalogue, dbCatalogueRepo } from '@/src/data/catalogue-repo';
import { loadActiveEstimate } from '@/src/data/estimate-repo';
import type { ParsedSheet } from '@/src/import/parse-sheet';

export default function ImportRoute() {
  const router = useRouter();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierConfirmed, setSupplierConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;

      setBusy(true);
      const asset = res.assets[0];
      const file = new File(asset.uri);
      const bytes = await file.bytes();
      const parsed = parseFileBytes(bytes);
      setSheet(parsed);
      setSupplierName('');
      setSupplierConfirmed(false);
    } catch (e) {
      Alert.alert('Could not read file', String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!sheet) {
    return (
      <SafeAreaView style={styles.pickScreen} edges={['top', 'bottom']}>
        <Text style={styles.title}>Import wholesale prices</Text>
        <Text style={styles.sub}>
          Choose a price file (.csv or .xlsx) exported from your wholesaler.
          You'll map the columns and review before anything is saved.
        </Text>
        <Pressable style={styles.pickBtn} onPress={pickFile} disabled={busy}>
          <Text style={styles.pickText}>{busy ? 'Reading…' : 'Choose file'}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!supplierConfirmed) {
    return (
      <SafeAreaView style={styles.pickScreen} edges={['top', 'bottom']}>
        <Text style={styles.title}>Name this supplier</Text>
        <Text style={styles.sub}>
          Give this price sheet a name so you know whose prices you're using (e.g. "Rexel", "City Electrical").
        </Text>
        <TextInput
          value={supplierName}
          onChangeText={setSupplierName}
          placeholder="Supplier name"
          placeholderTextColor="#5E6B79"
          style={styles.supplierInput}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => { if (supplierName.trim()) setSupplierConfirmed(true); }}
        />
        <Pressable
          style={[styles.pickBtn, !supplierName.trim() && styles.pickBtnDisabled]}
          onPress={() => { if (supplierName.trim()) setSupplierConfirmed(true); }}
          disabled={!supplierName.trim()}
        >
          <Text style={styles.pickText}>Continue</Text>
        </Pressable>
        <Pressable onPress={() => setSheet(null)} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const catalogueId = supplierName.trim().toLowerCase().replace(/\s+/g, '-');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#14181F' }} edges={['top', 'bottom']}>
      <ColumnMappingScreen
        sheet={sheet}
        catalogueId={catalogueId}
        currency="GBP"
        onCommit={async (state) => {
          try {
            setBusy(true);
            const newMaterials = state.validation.valid;
            const { materials, assemblies } = await loadCatalogue();
            const active = await loadActiveEstimate();
            const estimates = active ? [active] : [];
            const result = await commitImport(
              dbCatalogueRepo, newMaterials, materials, assemblies, estimates, true,
            );
            const p = result.plan;
            Alert.alert(
              'Import complete',
              `${p.added} added · ${p.updated} updated · ${p.unchanged} unchanged\n` +
              `${p.retained} existing items kept.\n` +
              (result.refreshedDraftIds.length
                ? `${result.refreshedDraftIds.length} draft estimate re-priced.`
                : 'No estimates affected.'),
              [{ text: 'OK', onPress: () => router.back() }],
            );
          } catch (e) {
            Alert.alert('Import failed', String(e));
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setSheet(null)}
      />
      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#FFB020" />
          <Text style={styles.overlayText}>Importing…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pickScreen: { flex: 1, backgroundColor: '#14181F', padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#F2F5F8' },
  sub: { fontSize: 15, color: '#9AA7B4', lineHeight: 22 },
  pickBtn: { backgroundColor: '#FFB020', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  pickBtnDisabled: { opacity: 0.4 },
  pickText: { fontSize: 16, fontWeight: '800', color: '#1A1205' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, color: '#9AA7B4', fontWeight: '600' },
  supplierInput: { backgroundColor: '#1E242E', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: '#F2F5F8', fontSize: 18, fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayText: { color: '#FFB020', marginTop: 12, fontWeight: '700' },
});
