import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const TOOLS = [
  {
    key: 'voltage-drop',
    route: '/tools/voltage-drop',
    icon: '⤳',
    accent: '#FF6A3D',
    label: 'Voltage Drop',
    sub: 'Check cable run against BS7671 limits',
  },
  {
    key: 'ohms-law',
    route: '/tools/ohms-law',
    icon: 'Ω',
    accent: colors.accentSecondary,
    label: "Ohm's Law",
    sub: 'Solve V, I, R & P from any two',
  },
] as const;

export default function ToolsHubScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Tools</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.list}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.card, { borderTopColor: t.accent }]}
            onPress={() => router.push(t.route as never)}
          >
            <View style={[styles.badge, { backgroundColor: t.accent + '22' }]}>
              <Text style={[styles.badgeIcon, { color: t.accent }]}>{t.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{t.label}</Text>
              <Text style={styles.cardSub}>{t.sub}</Text>
            </View>
            <Text style={[styles.arrow, { color: t.accent }]}>›</Text>
          </Pressable>
        ))}
      </View>
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
  list: { padding: space.lg, gap: space.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.bar,
    borderWidth: 1, borderColor: colors.hairline, borderTopWidth: 3,
    padding: space.lg,
  },
  badge: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 22, fontWeight: '700' },
  cardLabel: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  cardSub: { fontSize: 13, color: colors.textMuted },
  arrow: { fontSize: 26, fontWeight: '300' },
});
