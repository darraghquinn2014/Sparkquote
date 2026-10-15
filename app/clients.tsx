/**
 * Clients — the saved client list (Settings → Clients). Search, add, edit and
 * delete. Deleting a client keeps its name as plain text on its projects.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Client } from '@/src/domain/types';
import { clientMatches } from '@/src/domain/clients';
import {
  createClient, deleteClient, loadClients, projectCountsByClient, updateClient,
  type ClientFields,
} from '@/src/data/client-repo';
import { ClientForm } from '@/src/ui/clients/ClientForm';
import { colors, radius, space } from '@/src/ui/theme/tokens';

export default function ClientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<Client[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState('');
  // undefined = sheet closed, null = new client, Client = editing
  const [editing, setEditing] = useState<Client | null | undefined>(undefined);
  const [kbHeight, setKbHeight] = useState(0);

  const reload = useCallback(async () => {
    const [list, c] = await Promise.all([loadClients(), projectCountsByClient()]);
    setClients(list);
    setCounts(c);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const save = async (fields: ClientFields) => {
    try {
      if (editing) await updateClient(editing.id, fields);
      else await createClient(fields);
      setEditing(undefined);
      reload();
    } catch (e) {
      Alert.alert('Could not save client', String(e));
    }
  };

  const confirmDelete = (client: Client) => {
    const n = counts.get(client.id) ?? 0;
    Alert.alert(
      `Delete ${client.name}?`,
      n > 0
        ? `They're the client on ${n} project${n === 1 ? '' : 's'}. Those projects keep the name but lose the phone, email and address.`
        : 'This removes them from your client list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            await deleteClient(client.id);
            setEditing(undefined);
            reload();
          },
        },
      ],
    );
  };

  const filtered = clients.filter((c) => clientMatches(c, query));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Clients</Text>
        <Pressable style={styles.newBtn} onPress={() => setEditing(null)}>
          <Text style={styles.newText}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          clients.length > 0 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, phone or address"
              placeholderTextColor={colors.textMuted}
              style={styles.search}
            />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{clients.length === 0 ? 'No clients yet' : 'No clients match'}</Text>
            {clients.length === 0 && (
              <Text style={styles.emptySub}>
                Save a client once and pick them for any project or certificate — no retyping their details.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const n = counts.get(item.id) ?? 0;
          return (
            <Pressable style={styles.row} onPress={() => setEditing(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {(item.phone || item.address) ? (
                  <Text style={styles.meta} numberOfLines={1}>{[item.phone, item.address].filter(Boolean).join(' · ')}</Text>
                ) : null}
              </View>
              {n > 0 && <Text style={styles.count}>{n} project{n === 1 ? '' : 's'}</Text>}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />

      <Modal visible={editing !== undefined} transparent animationType="slide" onRequestClose={() => setEditing(undefined)}>
        <View style={styles.scrim}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditing(undefined)} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
              <View style={styles.grabber} />
              <Text style={styles.sheetTitle}>{editing ? 'Edit client' : 'New client'}</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: kbHeight }}>
                {editing !== undefined && (
                  <ClientForm
                    key={editing?.id ?? 'new'}
                    initial={editing ?? undefined}
                    saveLabel={editing ? 'Save changes' : 'Save client'}
                    onSave={save}
                    onCancel={() => setEditing(undefined)}
                    onDelete={editing ? () => confirmDelete(editing) : undefined}
                  />
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  newBtn: { backgroundColor: colors.accent, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  newText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
  list: { padding: space.lg, gap: space.sm },
  search: {
    backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg,
  },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  count: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 22 },
  emptyWrap: { alignItems: 'center', paddingTop: space.xxl, gap: space.md, paddingHorizontal: space.xl },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: space.lg, paddingTop: space.sm, maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
});
