import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const HELP_TOPICS = [
  {
    key: 'quick-quote',
    icon: '⚡',
    accent: colors.accent,
    title: 'Quick Quote',
    description: 'Tap favourite job tiles to build a fast estimate in seconds, no typing required.',
  },
  {
    key: 'estimate',
    icon: '📋',
    accent: colors.accentSecondary,
    title: 'Estimate & line items',
    description: 'Review every line, adjust quantities, and see materials, labour, VAT and the total break down live.',
  },
  {
    key: 'materials-picker',
    icon: '🔍',
    accent: colors.catPower,
    title: 'Materials picker',
    description: 'Search the full catalogue and add items by quantity or by the metre.',
  },
  {
    key: 'labour',
    icon: '🛠',
    accent: colors.catLighting,
    title: 'Labour',
    description: 'Set your hourly rate once, add flexible labour lines, and see labour costed separately from materials.',
  },
  {
    key: 'assemblies',
    icon: '⭐',
    accent: colors.catDistribution,
    title: 'Custom assemblies & favourites',
    description: 'Build your own reusable "Add-Job" tiles with materials and labour baked in, then favourite the ones you use most.',
  },
  {
    key: 'projects',
    icon: '🏠',
    accent: colors.catTesting,
    title: 'Projects — floors & rooms',
    description: 'Organise a job into floors and rooms, with materials and labour assignable to each specific room.',
  },
  {
    key: 'room-photos',
    icon: '📷',
    accent: colors.accent,
    title: 'Room photos & measurement',
    description: 'Capture reference photos per room and measure room dimensions straight from a photo.',
  },
  {
    key: 'voice-control',
    icon: '🎙',
    accent: colors.accentSecondary,
    title: 'Voice control',
    description: 'Use the mic button to add materials, create rooms, or ask questions like "what materials are needed for the kitchen" — hands-free.',
  },
  {
    key: 'review-sign',
    icon: '✍',
    accent: colors.catPower,
    title: 'Review, sign & share PDF',
    description: 'Walk the client through the quote, capture a signature, and share a branded PDF on the spot.',
  },
  {
    key: 'import',
    icon: '⬆',
    accent: colors.catLighting,
    title: 'Import wholesale prices',
    description: "Bring in a supplier's CSV or spreadsheet price list to keep your catalogue current.",
  },
  {
    key: 'settings',
    icon: '⚙',
    accent: colors.catDistribution,
    title: 'Settings',
    description: 'Set your default labour rate, VAT rate, currency and business details.',
  },
] as const;

export default function HelpScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Help</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {HELP_TOPICS.map((t) => (
          <View key={t.key} style={[styles.card, { borderTopColor: t.accent }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.badge, { backgroundColor: `${t.accent}22` }]}>
                <Text style={[styles.badgeIcon, { color: t.accent }]}>{t.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{t.title}</Text>
                <Text style={styles.cardSub}>{t.description}</Text>
              </View>
            </View>
            <View style={styles.screenshotPlaceholder}>
              <Text style={styles.screenshotText}>Screenshot coming soon</Text>
            </View>
          </View>
        ))}
      </ScrollView>
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
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.bar,
    borderWidth: 1, borderColor: colors.hairline, borderTopWidth: 3,
    padding: space.lg, gap: space.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 22, fontWeight: '700' },
  cardLabel: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  cardSub: { fontSize: 13, color: colors.textMuted },
  screenshotPlaceholder: {
    aspectRatio: 9 / 16, maxHeight: 220,
    borderRadius: radius.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairline,
    backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center',
  },
  screenshotText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
