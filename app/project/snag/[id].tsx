import React, { useCallback, useState, useRef } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { snagItemsForProject, createSnagItem, toggleSnagItem, deleteSnagItem } from '@/src/data/snag-repo';
import { loadProjects } from '@/src/data/project-repo';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import type { SnagItem } from '@/src/domain/types';

const ACCENT = '#F0B730'; // amber — snag/punch list colour

export default function SnagListScreen() {
  const router = useRouter();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState<SnagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [projects, snagItems] = await Promise.all([
      loadProjects(),
      snagItemsForProject(projectId),
    ]);
    setProjectName(projects.find((p) => p.id === projectId)?.name ?? '');
    setItems(snagItems);
    setLoading(false);
  }, [projectId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const commitAdd = async () => {
    const desc = draft.trim();
    if (!desc || !projectId) { setAdding(false); setDraft(''); return; }
    await createSnagItem(projectId, desc);
    setDraft('');
    setAdding(false);
    reload();
  };

  const toggle = async (item: SnagItem) => {
    swipeRefs.current.get(item.id)?.close();
    await toggleSnagItem(item.id);
    reload();
  };

  const confirmDelete = (item: SnagItem) => {
    Alert.alert('Delete item?', `"${item.description}" will be removed.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => swipeRefs.current.get(item.id)?.close() },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSnagItem(item.id); reload(); } },
    ]);
  };

  const open = items.filter((i) => !i.resolved);
  const done = items.filter((i) => i.resolved);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ActivityIndicator color={ACCENT} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: space.md }}>
          <Text style={styles.title}>Snag List</Text>
          {projectName ? <Text style={styles.sub}>{projectName}</Text> : null}
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => { setAdding(true); setDraft(''); }}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={[...open, ...done]}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !adding ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No snag items</Text>
              <Text style={styles.emptyText}>Tap "+ Add" to log something that needs fixing before the job is signed off.</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          adding ? (
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Describe the issue…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitAdd}
                onBlur={commitAdd}
              />
              <Pressable style={styles.addConfirm} onPress={commitAdd}>
                <Text style={styles.addConfirmText}>Add</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          done.length > 0 ? (
            <Text style={styles.doneLabel}>{done.length} resolved</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Swipeable
            ref={(ref) => {
              if (ref) swipeRefs.current.set(item.id, ref);
              else swipeRefs.current.delete(item.id);
            }}
            onSwipeableWillOpen={() => {
              swipeRefs.current.forEach((r, id) => { if (id !== item.id) r?.close(); });
            }}
            renderRightActions={() => (
              <Pressable style={styles.deleteAction} onPress={() => confirmDelete(item)}>
                <Text style={styles.deleteActionText}>Delete</Text>
              </Pressable>
            )}
          >
            <Pressable style={[styles.row, item.resolved && styles.rowDone]} onPress={() => toggle(item)}>
              <View style={[styles.checkbox, item.resolved && styles.checkboxDone]}>
                {item.resolved && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.desc, item.resolved && styles.descDone]} numberOfLines={2}>
                {item.description}
              </Text>
            </Pressable>
          </Swipeable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  addBtn: {
    backgroundColor: ACCENT, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  addBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },

  list: { padding: space.lg, paddingBottom: space.xxl },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md,
  },
  addInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.tile,
    paddingHorizontal: space.md, paddingVertical: space.md,
    color: colors.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: ACCENT,
  },
  addConfirm: {
    backgroundColor: ACCENT, borderRadius: radius.tile,
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  addConfirmText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile,
    padding: space.lg, marginBottom: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  rowDone: { opacity: 0.5 },

  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkmark: { color: colors.accentInk, fontSize: 14, fontWeight: '900' },

  desc: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  descDone: { textDecorationLine: 'line-through', color: colors.textMuted },

  doneLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 1, textAlign: 'center', marginTop: space.lg,
  },

  deleteAction: {
    backgroundColor: colors.danger, justifyContent: 'center',
    alignItems: 'center', width: 80, borderRadius: radius.tile,
    marginBottom: space.sm,
  },
  deleteActionText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  empty: { alignItems: 'center', marginTop: space.xxl * 2, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { color: colors.textSecondary, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 20 },
});
