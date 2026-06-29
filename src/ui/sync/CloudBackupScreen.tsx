/**
 * Cloud backup screen — file-based export and restore.
 *
 * Exports all data as a JSON file the user saves wherever they like
 * (Google Drive, email, iCloud, etc.). Restore picks a previously
 * exported file and replaces all data. Photos are not included.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, space, radius, type } from '../theme/tokens';

interface Props {
  exporting: boolean;
  restoring: boolean;
  lastBackupDate: string | null;
  onExport: () => void;
  onRestore: () => void;
}

export function CloudBackupScreen({ exporting, restoring, lastBackupDate, onExport, onRestore }: Props) {
  const busy = exporting || restoring;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Backup & restore</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Export backup</Text>
        <Text style={styles.cardBody}>
          Saves all your projects, rooms, estimates, custom jobs, and reference photos as a zip file.
          Store it in Google Drive, email it to yourself, or save it anywhere.
        </Text>
        {lastBackupDate && (
          <Text style={styles.lastBackup}>Last export: {lastBackupDate}</Text>
        )}
        <Pressable
          style={[styles.primaryBtn, busy && styles.disabled]}
          onPress={onExport}
          disabled={busy}
        >
          {exporting
            ? <ActivityIndicator color={colors.accentInk} />
            : <Text style={styles.primaryText}>Export backup</Text>
          }
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Restore from backup</Text>
        <Text style={styles.cardBody}>
          Pick a previously exported backup file to restore your data.
        </Text>
        <Text style={styles.warning}>
          This replaces ALL current data. Make sure to export first if you want to keep what's on the device.
        </Text>
        <Pressable
          style={[styles.secondaryBtn, busy && styles.disabled]}
          onPress={onRestore}
          disabled={busy}
        >
          {restoring
            ? <ActivityIndicator color={colors.accent} />
            : <Text style={styles.secondaryText}>Restore from file</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground, padding: space.lg, gap: space.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  card: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, gap: space.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cardBody: { ...type.body, color: colors.textSecondary, lineHeight: 20 },
  note: { ...type.caption, color: colors.textMuted, fontStyle: 'italic' },
  lastBackup: { ...type.caption, color: colors.textMuted },
  warning: { ...type.caption, color: colors.accent, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: colors.accent, paddingVertical: space.md,
    borderRadius: radius.bar, alignItems: 'center', marginTop: space.sm,
  },
  primaryText: { ...type.body, color: colors.accentInk, fontWeight: '800' },
  secondaryBtn: {
    backgroundColor: colors.ground, paddingVertical: space.md,
    borderRadius: radius.bar, alignItems: 'center', marginTop: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
  },
  secondaryText: { ...type.body, color: colors.textPrimary, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
