/**
 * Manage jobs — list all assemblies, toggle Add-Job favourites, delete,
 * and create/edit ones. Swipe right to edit, swipe left to delete.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Assembly, Material } from '@/src/domain/types';
import { loadCatalogue, setAssemblyFavourite, deleteAssembly } from '@/src/data/catalogue-repo';
import { colors, space, radius, type as typo } from '@/src/ui/theme/tokens';
import { AssemblyBuilder } from '@/src/ui/manage/AssemblyBuilder';
import { CANONICAL_CATEGORIES } from '@/src/domain/categories';

export default function ManageJobsRoute() {
  const router = useRouter();
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingAssembly, setEditingAssembly] = useState<Assembly | undefined>(undefined);
  const [query, setQuery] = useState('');
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const reload = useCallback(async () => {
    const cat = await loadCatalogue();
    setAssemblies([...cat.assemblies].sort((a, b) => a.name.localeCompare(b.name)));
    setMaterials(cat.materials);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const closeAllSwipeables = () => {
    swipeableRefs.current.forEach((ref) => ref?.close());
  };

  const toggleFav = async (a: Assembly) => {
    closeAllSwipeables();
    await setAssemblyFavourite(a.id, a.quickQuoteRank != null ? null : 999);
    reload();
  };

  const openEdit = (a: Assembly) => {
    closeAllSwipeables();
    setEditingAssembly(a);
    setBuilderOpen(true);
  };

  const confirmDelete = (a: Assembly) => {
    Alert.alert(
      'Delete job?',
      `"${a.name}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeableRefs.current.get(a.id)?.close() },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteAssembly(a.id);
            reload();
          },
        },
      ],
    );
  };

  const filteredAssemblies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assemblies;
    return assemblies.filter((a) => {
      const materialText = `${a.components.length} material${a.components.length === 1 ? '' : 's'}`;
      return [a.name, a.category, String(a.baseLaborHours), materialText]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [assemblies, query]);

  const renderRightActions = (a: Assembly) => (
    <Pressable style={styles.deleteAction} onPress={() => confirmDelete(a)}>
      <Text style={styles.deleteActionText}>Delete</Text>
    </Pressable>
  );

  const renderLeftActions = (a: Assembly) => (
    <Pressable style={styles.editAction} onPress={() => openEdit(a)}>
      <Text style={styles.editActionText}>Edit</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Manage jobs</Text>
        <Pressable style={styles.newBtn} onPress={() => { setEditingAssembly(undefined); setBuilderOpen(true); }}>
          <Text style={styles.newText}>+ New</Text>
        </Pressable>
      </View>

      {!loading && (
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search jobs"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            accessibilityLabel="Search jobs"
          />
        </View>
      )}

      {!loading && (
        <Text style={styles.hint}>Swipe right to edit · Swipe left to delete</Text>
      )}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={filteredAssemblies}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={<Text style={styles.empty}>{query.trim() ? 'No jobs match your search.' : 'No jobs yet. Tap New to create one.'}</Text>}
          renderItem={({ item }) => {
            const fav = item.quickQuoteRank != null;
            return (
              <Swipeable
                ref={(ref) => { swipeableRefs.current.set(item.id, ref); }}
                friction={2}
                leftThreshold={60}
                rightThreshold={60}
                renderLeftActions={() => renderLeftActions(item)}
                renderRightActions={() => renderRightActions(item)}
                onSwipeableOpen={(direction) => {
                  if (direction === 'left') openEdit(item);
                  if (direction === 'right') confirmDelete(item);
                }}
              >
                <View style={styles.row}>
                  <Pressable onPress={() => toggleFav(item)} hitSlop={8} style={styles.star}>
                    <Text style={[styles.starText, fav && styles.starTextActive]}>{fav ? '*' : '-'}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>{item.category} · {item.baseLaborHours}h · {item.components.length} material{item.components.length === 1 ? '' : 's'}</Text>
                  </View>
                  <Pressable onPress={() => toggleFav(item)} hitSlop={8} style={[styles.visibilityBtn, fav ? styles.hideBtn : styles.showBtn]}>
                    <Text style={[styles.visibilityText, fav ? styles.hideText : styles.showText]}>{fav ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>
              </Swipeable>
            );
          }}
        />
      )}

      <AssemblyBuilder
        visible={builderOpen}
        materials={materials}
        categories={Array.from(new Set([...CANONICAL_CATEGORIES, ...assemblies.map((a) => a.category)]))}
        onClose={() => { setBuilderOpen(false); setEditingAssembly(undefined); }}
        onCreated={() => { setBuilderOpen(false); setEditingAssembly(undefined); reload(); }}
        assembly={editingAssembly}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  newText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  searchWrap: { paddingHorizontal: space.lg, paddingTop: space.lg },
  search: { backgroundColor: colors.surface, borderRadius: radius.bar, paddingHorizontal: space.lg, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: space.sm, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginBottom: space.sm },
  star: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  starText: { color: colors.textMuted, fontSize: 24, lineHeight: 28 },
  starTextActive: { color: colors.accent },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  visibilityBtn: { minWidth: 64, alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 7, borderWidth: 1 },
  hideBtn: { borderColor: colors.hairline },
  showBtn: { borderColor: colors.accent, backgroundColor: colors.accent },
  visibilityText: { fontWeight: '800', fontSize: 13 },
  hideText: { color: colors.textSecondary },
  showText: { color: colors.accentInk },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl, ...typo.body },
  editAction: { backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: radius.tile, marginBottom: space.sm },
  editActionText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  deleteAction: { backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: radius.tile, marginBottom: space.sm },
  deleteActionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
