/**
 * ClientPicker — bottom sheet to choose a saved client, or add a new one
 * without leaving the sheet (a second stacked Modal is unreliable on Android,
 * so "+ New client" swaps this sheet's content to the form instead).
 */
import React, { useEffect, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Client } from '../../domain/types';
import { clientMatches } from '../../domain/clients';
import { createClient, loadClients } from '../../data/client-repo';
import { ClientForm } from './ClientForm';
import { colors, radius, space } from '../theme/tokens';

interface Props {
  visible: boolean;
  /** Currently linked client, highlighted in the list. */
  selectedId?: string;
  onPick: (client: Client) => void;
  /** When set, shows a "No client" option that unlinks the current one. */
  onClear?: () => void;
  onClose: () => void;
}

export function ClientPicker({ visible, selectedId, onPick, onClear, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setAdding(false);
    loadClients().then(setClients).catch((e) => console.error('load clients failed', e));
  }, [visible]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const filtered = clients.filter((c) => clientMatches(c, query));

  const addAndPick = async (fields: Parameters<typeof createClient>[0]) => {
    const client = await createClient(fields);
    onPick(client);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={adding ? () => setAdding(false) : onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kavWrapper}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.grabber} />
            <Text style={styles.title}>{adding ? 'New client' : 'Choose client'}</Text>

            {adding ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: kbHeight }}>
                <ClientForm
                  initialName={query.trim()}
                  saveLabel="Save client"
                  onSave={addAndPick}
                  onCancel={() => setAdding(false)}
                />
              </ScrollView>
            ) : (
              <>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search clients"
                  placeholderTextColor={colors.textMuted}
                  style={styles.search}
                />
                <Pressable style={styles.newRow} onPress={() => setAdding(true)}>
                  <Text style={styles.newText}>+ New client{query.trim() ? ` “${query.trim()}”` : ''}</Text>
                </Pressable>
                <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} contentContainerStyle={{ paddingBottom: kbHeight }}>
                  {onClear && selectedId && (
                    <Pressable style={styles.row} onPress={onClear}>
                      <Text style={styles.clearText}>No client</Text>
                    </Pressable>
                  )}
                  {filtered.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[styles.row, c.id === selectedId && styles.rowSelected]}
                      onPress={() => onPick(c)}
                    >
                      <Text style={styles.name}>{c.name}</Text>
                      {(c.phone || c.address) ? (
                        <Text style={styles.meta} numberOfLines={1}>
                          {[c.phone, c.address].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                  {filtered.length === 0 && (
                    <Text style={styles.empty}>
                      {clients.length === 0 ? 'No saved clients yet.' : 'No clients match.'}
                    </Text>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  kavWrapper: { width: '100%' },
  sheet: {
    backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: space.lg, paddingTop: space.sm, maxHeight: '85%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: space.md },
  search: {
    backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16,
  },
  newRow: { paddingVertical: space.md },
  newText: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  list: { flexGrow: 0 },
  row: {
    backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md,
    marginBottom: space.sm, borderWidth: 1, borderColor: colors.surface,
  },
  rowSelected: { borderColor: colors.accent },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  clearText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: space.lg },
});
