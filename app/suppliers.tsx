import React, { useCallback, useState } from 'react';
import {
  View, Text, Pressable, FlatList, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  loadSuppliers, deleteSupplierPrices, type SupplierSummary,
} from '@/src/data/catalogue-repo';
import { colors, space, radius } from '@/src/ui/theme/tokens';

export default function SuppliersScreen() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await loadSuppliers();
    setSuppliers(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const confirmDelete = (s: SupplierSummary) => {
    Alert.alert(
      `Remove ${s.displayName}?`,
      `This will delete all ${s.itemCount} prices from ${s.displayName}. Assemblies that used these materials will still exist but their material costs will show as £0 until you re-import.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteSupplierPrices(s.catalogueId);
            reload();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Price lists</Text>
        <Pressable onPress={() => router.push('/import')} style={styles.addBtn}>
          <Text style={styles.addText}>+ Import</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(s) => s.catalogueId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No price lists installed</Text>
              <Text style={styles.emptySub}>
                Import a wholesaler price sheet (.csv or .xlsx) to get started.
              </Text>
              <Pressable style={styles.importBtn} onPress={() => router.push('/import')}>
                <Text style={styles.importBtnText}>Import prices</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.meta}>{item.itemCount} items</Text>
              </View>
              <Pressable
                onPress={() => confirmDelete(item)}
                hitSlop={8}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteText}>Remove</Text>
              </Pressable>
            </View>
          )}
        />
      )}
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
  addBtn: {
    backgroundColor: colors.accent, paddingHorizontal: space.md,
    paddingVertical: space.sm, borderRadius: radius.pill,
  },
  addText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  list: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.tile,
    padding: space.lg, gap: space.md,
  },
  rowBody: { flex: 1 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  deleteBtn: {
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: 6,
  },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  emptyWrap: { alignItems: 'center', paddingTop: space.xxl, gap: space.md, paddingHorizontal: space.xl },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  importBtn: {
    backgroundColor: colors.accent, paddingHorizontal: space.xl,
    paddingVertical: space.md, borderRadius: radius.bar, marginTop: space.sm,
  },
  importBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
});
