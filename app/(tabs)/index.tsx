import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { seedIfEmpty, prefixAssembliesWithInstall } from '@/src/data/catalogue-repo';
import { useEstimateStore } from '@/src/state/estimateStore';
import { useSettingsStore } from '@/src/state/settingsStore';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const allToggles = seedLaborToggles.map(toLaborToggle);
const { width: SCREEN_W } = Dimensions.get('window');
const GAP = space.md;
const HALF_W = (SCREEN_W - space.lg * 2 - GAP) / 2;

// Per-section accent colours
const C = {
  projects:   '#1B8FFF',
  quickQuote: '#F0B730',
  estimate:   '#06D6A0',
  catalogue:  '#9B5DE5',
} as const;

type BlockAccent = keyof typeof C;

interface BlockProps {
  accent: BlockAccent;
  icon: string;
  label: string;
  sub: string;
  onPress: () => void;
  style?: object;
  wide?: boolean;
}

function Block({ accent, icon, label, sub, onPress, style, wide = false }: BlockProps) {
  const color = C[accent];
  return (
    <Pressable
      style={({ pressed }) => [
        styles.block,
        wide ? styles.blockWide : { width: HALF_W },
        { borderTopColor: color },
        pressed && styles.blockPressed,
        style,
      ]}
      onPress={onPress}
    >
      <View style={[styles.badge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.badgeIcon, { color }]}>{icon}</Text>
      </View>
      <View style={styles.blockBottom}>
        <View style={{ flex: 1 }}>
          <Text style={styles.blockLabel}>{label}</Text>
          <Text style={styles.blockSub}>{sub}</Text>
        </View>
        <Text style={[styles.blockArrow, { color }]}>›</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const hydrate = useEstimateStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const estimate = useEstimateStore((s) => s.estimate);
  const savedEstimate = useEstimateStore((s) => s.savedEstimate);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          await seedIfEmpty();
          await prefixAssembliesWithInstall();
          await Promise.all([hydrate(), hydrateSettings()]);
        } catch (e) {
          console.error('home init failed', e);
        }
      })();
    }, [hydrate, hydrateSettings]),
  );

  const hasActive = estimate.lineItems.length > 0;
  const hasSaved = savedEstimate != null;
  const bannerEst = hasActive ? estimate : savedEstimate;
  const bannerTotal = bannerEst
    ? formatMoney(priceEstimate(bannerEst, allToggles).grandTotalMinor, bannerEst.currency)
    : '';
  const bannerCount = bannerEst?.lineItems.length ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>

      {/* Brand */}
      <View style={styles.brandRow}>
        <Text style={styles.brandName}>
          <Text style={{ color: C.quickQuote }}>Spark</Text>Quote
        </Text>
        <Text style={styles.brandTag}>Electrical estimating</Text>
        <View style={styles.brandLine} />
      </View>

      {/* Resume banner */}
      {(hasActive || hasSaved) && (
        <Pressable style={styles.banner} onPress={() => router.push('/estimate' as never)}>
          <View style={styles.bannerDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {hasActive ? 'Estimate in progress' : 'Resume last estimate'}
            </Text>
            <Text style={styles.bannerSub}>
              {bannerCount} item{bannerCount !== 1 ? 's' : ''} · {bannerTotal}
            </Text>
          </View>
          <Text style={styles.bannerArrow}>›</Text>
        </Pressable>
      )}

      {/* Grid */}
      <View style={styles.grid}>
        <Block
          accent="projects"
          icon="⊞"
          label="Projects"
          sub="Jobs, rooms & photos"
          wide
          onPress={() => router.navigate('/(tabs)/projects' as never)}
        />
        <View style={styles.row}>
          <Block
            accent="quickQuote"
            icon="⚡"
            label="Quick Quote"
            sub="Tap to price a job"
            onPress={() => router.push('/quick-quote' as never)}
          />
          <Block
            accent="estimate"
            icon="£"
            label="Estimate"
            sub="View & edit quote"
            onPress={() => router.push('/estimate' as never)}
          />
        </View>
        <Block
          accent="catalogue"
          icon="≡"
          label="Catalogue"
          sub="Materials & prices"
          wide
          onPress={() => router.push('/catalogue' as never)}
        />
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ground,
    paddingHorizontal: space.lg,
  },

  brandRow: {
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandTag: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
    marginBottom: space.md,
  },
  brandLine: {
    height: 2,
    width: 48,
    backgroundColor: C.quickQuote,
    borderRadius: 2,
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderTopWidth: 3,
    borderTopColor: C.estimate,
    padding: space.lg,
    marginBottom: space.lg,
    gap: space.md,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.estimate,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  bannerSub: {
    fontSize: 13,
    color: C.estimate,
    fontVariant: ['tabular-nums'],
  },
  bannerArrow: {
    fontSize: 22,
    color: C.estimate,
  },

  grid: {
    flex: 1,
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },

  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.bar,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderTopWidth: 3,
    padding: space.lg,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  blockWide: {
    width: '100%',
  },
  blockPressed: {
    opacity: 0.82,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: {
    fontSize: 22,
    fontWeight: '700',
  },
  blockBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: space.md,
  },
  blockLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  blockSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  blockArrow: {
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 28,
    marginLeft: space.sm,
  },
});
