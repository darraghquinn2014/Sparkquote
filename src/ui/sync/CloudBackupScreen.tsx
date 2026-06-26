/**
 * CloudBackupScreen (spec §9).
 *
 * Shows the user their backup vault status: which provider is linked, how many
 * changes are waiting, and whether anything is stuck. Connecting a provider
 * launches the OAuth flow (handled by the auth layer). Backup is automatic on
 * connectivity; a manual "Back up now" is offered for reassurance.
 *
 * Verified by typecheck + review.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { QueueStats } from '../../sync/sync-queue';
import { colors, space, radius, type } from '../theme/tokens';

interface Props {
  providerName: string | null;
  isOnline: boolean;
  stats: QueueStats;
  syncing: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
}

export function CloudBackupScreen({
  providerName, isOnline, stats, syncing, onConnect, onDisconnect, onSyncNow,
}: Props) {
  const connected = providerName != null;
  const waiting = stats.pending + stats.failed - stats.stuck;

  let statusLine: string;
  if (!connected) statusLine = 'No backup vault linked yet.';
  else if (!isOnline) statusLine = `Offline · ${waiting} change${waiting === 1 ? '' : 's'} waiting`;
  else if (syncing) statusLine = 'Backing up…';
  else if (waiting > 0) statusLine = `${waiting} change${waiting === 1 ? '' : 's'} to back up`;
  else statusLine = 'All changes backed up';

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Cloud backup</Text>

      <View style={styles.card}>
        <View style={styles.statusHead}>
          <View style={[styles.dot, connected && isOnline && styles.dotLive, stats.stuck > 0 && styles.dotWarn]} />
          <Text style={styles.statusText}>{statusLine}</Text>
        </View>

        {connected && (
          <Text style={styles.provider}>Vault: {providerName}</Text>
        )}

        {stats.stuck > 0 && (
          <Text style={styles.stuck}>
            {stats.stuck} item{stats.stuck === 1 ? '' : 's'} failed to back up after several tries. They’ll retry on the next connection.
          </Text>
        )}
      </View>

      {!connected ? (
        <Pressable onPress={onConnect} style={styles.primaryBtn} accessibilityLabel="Connect a backup vault">
          <Text style={styles.primaryText}>Connect a vault</Text>
        </Pressable>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={onSyncNow}
            disabled={!isOnline || syncing}
            style={[styles.secondaryBtn, (!isOnline || syncing) && styles.disabled]}
          >
            <Text style={styles.secondaryText}>{syncing ? 'Backing up…' : 'Back up now'}</Text>
          </Pressable>
          <Pressable onPress={onDisconnect} style={styles.secondaryBtn}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.footnote}>
        Backups go to your own cloud account. SparkQuote stores only the access
        token, never your password, and writes to a dedicated app folder.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground, padding: space.lg, gap: space.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  card: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, gap: space.sm },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.textMuted },
  dotLive: { backgroundColor: colors.catTesting },
  dotWarn: { backgroundColor: colors.accent },
  statusText: { ...type.body, color: colors.textPrimary, fontWeight: '600' },
  provider: { ...type.caption, color: colors.textSecondary },
  stuck: { ...type.caption, color: colors.accent, lineHeight: 18 },
  primaryBtn: { backgroundColor: colors.accent, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center' },
  primaryText: { ...type.body, color: colors.accentInk, fontWeight: '800' },
  row: { flexDirection: 'row', gap: space.sm },
  secondaryBtn: { flex: 1, backgroundColor: colors.surface, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center' },
  secondaryText: { ...type.body, color: colors.accent, fontWeight: '800' },
  disconnectText: { ...type.body, color: colors.textSecondary, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  footnote: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
});
