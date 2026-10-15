/**
 * ClientForm — the name / phone / email / address fields for a saved client,
 * shared by the ClientPicker's "+ New client" view and the Clients screen's
 * edit sheet. Owns its own field state; calls onSave with trimmed values.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Client } from '../../domain/types';
import type { ClientFields } from '../../data/client-repo';
import { colors, radius, space } from '../theme/tokens';

interface Props {
  initial?: Client;
  /** Prefill the name for a new client (e.g. what was typed in search). */
  initialName?: string;
  saveLabel: string;
  onSave: (fields: ClientFields) => void;
  onCancel: () => void;
  /** Shown as a red link under the buttons when editing. */
  onDelete?: () => void;
}

export function ClientForm({ initial, initialName, saveLabel, onSave, onCancel, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? initialName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const canSave = name.trim().length > 0;

  return (
    <View>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. John Smith"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoFocus={!initial}
        autoCapitalize="words"
      />
      <Text style={styles.label}>Phone (optional)</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="e.g. 07700 900123"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        keyboardType="phone-pad"
      />
      <Text style={styles.label}>Email (optional)</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="e.g. john@example.com"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.label}>Address (optional)</Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="Their home or billing address"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, styles.multiline]}
        multiline
      />

      <View style={styles.buttons}>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, !canSave && { opacity: 0.4 }]}
          disabled={!canSave}
          onPress={() => onSave({ name, phone, email, address })}
        >
          <Text style={styles.saveText}>{saveLabel}</Text>
        </Pressable>
      </View>
      {onDelete && (
        <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteLink}>
          <Text style={styles.deleteText}>Delete client</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: space.xs, marginTop: space.md,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  cancelBtn: {
    flex: 1, paddingVertical: space.md, borderRadius: radius.pill, alignItems: 'center',
    borderWidth: 1, borderColor: colors.danger,
  },
  cancelText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  saveBtn: { flex: 2, paddingVertical: space.md, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.accent },
  saveText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  deleteLink: { alignSelf: 'center', marginTop: space.lg, padding: space.sm },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
