/**
 * MediaSettingsScreen (spec §8).
 *
 * Two controls: the image-quality selector (Low/Medium/High) and a cache-clear
 * button. The clear button states EXACTLY what it removes — derived thumbnails,
 * temp PDF files, sync staging — and is explicit that original site photos are
 * never touched. That clarity is the safeguard: the §8 risk is a user deleting
 * their only copy of a photo because a button was vague.
 *
 * Verified by typecheck + review.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ImageQuality } from '../../media/media-types';
import { QUALITY_SPECS } from '../../media/media-types';
import { colors, space, radius, type } from '../theme/tokens';

interface Props {
  quality: ImageQuality;
  onChangeQuality: (q: ImageQuality) => void;
  /** Clears derived caches; resolves with bytes freed. Wired to clearCache(). */
  onClearCache: () => Promise<number>;
}

const ORDER: ImageQuality[] = ['low', 'medium', 'high'];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaSettingsScreen({ quality, onChangeQuality, onClearCache }: Props) {
  const [clearing, setClearing] = useState(false);
  const [lastFreed, setLastFreed] = useState<number | null>(null);

  const clear = async () => {
    setClearing(true);
    try {
      const freed = await onClearCache();
      setLastFreed(freed);
    } finally {
      setClearing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Photos &amp; storage</Text>

      <Text style={styles.sectionLabel}>IMAGE QUALITY</Text>
      <View style={styles.segment}>
        {ORDER.map((q) => {
          const active = quality === q;
          return (
            <Pressable
              key={q}
              onPress={() => onChangeQuality(q)}
              style={[styles.segBtn, active && styles.segBtnActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>
                {q[0]!.toUpperCase() + q.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>{QUALITY_SPECS[quality].note}</Text>

      <Text style={styles.sectionLabel}>STORAGE</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Clear cache</Text>
        <Text style={styles.cardBody}>
          Removes thumbnails, temporary PDF files and sync staging. Your site
          photos and estimates are not affected.
        </Text>
        <Pressable
          onPress={clear}
          disabled={clearing}
          style={[styles.clearBtn, clearing && styles.clearBtnDisabled]}
          accessibilityLabel="Clear cache"
        >
          <Text style={styles.clearText}>{clearing ? 'Clearing…' : 'Clear cache'}</Text>
        </Pressable>
        {lastFreed != null && (
          <Text style={styles.freed}>Freed {formatBytes(lastFreed)}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground, padding: space.lg, gap: space.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: space.sm },
  sectionLabel: { ...type.eyebrow, color: colors.textMuted, marginTop: space.lg },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.tile, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile - 2, alignItems: 'center' },
  segBtnActive: { backgroundColor: colors.accent },
  segText: { ...type.body, color: colors.textSecondary, fontWeight: '700' },
  segTextActive: { color: colors.accentInk, fontWeight: '800' },
  note: { ...type.caption, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, gap: space.sm },
  cardTitle: { ...type.body, color: colors.textPrimary, fontWeight: '700' },
  cardBody: { ...type.caption, color: colors.textSecondary, lineHeight: 18 },
  clearBtn: { backgroundColor: colors.ground, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center', marginTop: space.sm },
  clearBtnDisabled: { opacity: 0.6 },
  clearText: { ...type.body, color: colors.accent, fontWeight: '800' },
  freed: { ...type.caption, color: colors.catTesting, textAlign: 'center' },
});
