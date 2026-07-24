import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { seedIfEmpty, prefixAssembliesWithInstall, repairMissingSeedMaterials, loadCatalogue } from '@/src/data/catalogue-repo';
import { loadProjects } from '@/src/data/project-repo';
import { useEstimateStore } from '@/src/state/estimateStore';
import { useSettingsStore } from '@/src/state/settingsStore';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import { CircuitBackground } from '@/src/ui/home/CircuitBackground';
import {
  HouseIllustration,
  LightningIllustration,
  ShelvesIllustration,
} from '@/src/ui/home/CardIllustrations';

const allToggles = seedLaborToggles.map(toLaborToggle);
const { width: W } = Dimensions.get('window');
const GAP = space.md;
const HALF_W = (W - space.lg * 2 - GAP) / 2;

const C = {
  brand:      '#F0B730',
  projects:   '#1B8FFF',
  estimate:   '#06D6A0',
  catalogue:  '#9B5DE5',
  tools:      '#FF6A3D',
  help:       '#00BCD4',
} as const;
type Accent = keyof typeof C;

interface BlockProps {
  accent: Accent;
  icon: string;
  label: string;
  sub: string;
  stat?: string;
  illustration?: React.ReactNode;
  onPress: () => void;
  wide?: boolean;
  tall?: boolean;
  thin?: boolean;
}

function Block({ accent, icon, label, sub, stat, illustration, onPress, wide, tall, thin }: BlockProps) {
  const color = C[accent];
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const height = tall ? 150 : thin ? 75 : 110;
  const containerStyle = wide ? styles.blockWide : { width: HALF_W };

  return (
    <Animated.View style={[containerStyle, animStyle]}>
      <Pressable
        style={[styles.block, { borderTopColor: color, shadowColor: color, minHeight: height }]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 14, stiffness: 200 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 200 }); }}
      >
        {/* Subtle inner highlight at top */}
        <View style={styles.cardHighlight} />

        {/* Illustration — ghost-faded, top-right */}
        {illustration && (
          <View style={styles.illustrationWrap} pointerEvents="none">
            {illustration}
          </View>
        )}

        {thin ? (
          /* Thin catalogue bar — horizontal layout */
          <View style={styles.thinRow}>
            <View style={[styles.badge, styles.badgeSm, { backgroundColor: color + '22' }]}>
              <Text style={[styles.badgeIconSm, { color }]}>{icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.blockLabel}>{label}</Text>
              <Text style={stat ? [styles.blockStat, { color }] : styles.blockSub}>
                {stat ?? sub}
              </Text>
            </View>
            <Text style={[styles.blockArrow, { color }]}>›</Text>
          </View>
        ) : (
          /* Standard vertical layout */
          <>
            <View style={[styles.badge, { backgroundColor: color + '22' }]}>
              <Text style={[styles.badgeIcon, { color }]}>{icon}</Text>
            </View>
            <View style={styles.blockBottom}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockLabel}>{label}</Text>
                <Text style={stat ? [styles.blockStat, { color }] : styles.blockSub}>
                  {stat ?? sub}
                </Text>
              </View>
              <Text style={[styles.blockArrow, { color }]}>›</Text>
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const hydrate = useEstimateStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const estimate = useEstimateStore((s) => s.estimate);
  const savedEstimate = useEstimateStore((s) => s.savedEstimate);

  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [materialCount, setMaterialCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          await seedIfEmpty();
          await repairMissingSeedMaterials();
          await prefixAssembliesWithInstall();
          await Promise.all([hydrate(), hydrateSettings()]);
          if (!useSettingsStore.getState().voiceSetupComplete) {
            router.push('/voice-setup' as any);
          }
          const [projects, cat] = await Promise.all([loadProjects(), loadCatalogue()]);
          setProjectCount(projects.length);
          setMaterialCount(cat.materials.length);
        } catch (e) {
          console.error('home init failed', e);
        }
      })();
    }, [hydrate, hydrateSettings]),
  );

  const hasActive = estimate.lineItems.length > 0;
  const hasSaved = savedEstimate != null;

  // Live stats for each block
  const projectStat = projectCount == null
    ? undefined
    : projectCount === 0 ? 'No projects yet' : `${projectCount} project${projectCount !== 1 ? 's' : ''}`;

  const estimateStat = hasActive
    ? `${estimate.lineItems.length} item${estimate.lineItems.length !== 1 ? 's' : ''} · ${formatMoney(priceEstimate(estimate, allToggles).grandTotalMinor, estimate.currency)}`
    : hasSaved && savedEstimate
      ? `${savedEstimate.lineItems.length} item${savedEstimate.lineItems.length !== 1 ? 's' : ''} · ${formatMoney(priceEstimate(savedEstimate, allToggles).grandTotalMinor, savedEstimate.currency)}`
      : 'No estimate yet';

  const catStat = materialCount == null
    ? undefined
    : `${materialCount} materials`;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <CircuitBackground />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Brand */}
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>
            <Text style={{ color: C.brand }}>Spark</Text>Quote
          </Text>
          <View style={styles.brandMeta}>
            <View style={styles.brandLine} />
            <Text style={styles.brandTag}>Electrical estimating</Text>
          </View>
        </View>

        {/* Bento grid */}
        <View style={styles.grid}>
          <Block
            accent="estimate"
            icon="⚡"
            label="Quick estimate"
            sub="Rough price on the spot — tap or talk"
            stat={estimateStat}
            illustration={<LightningIllustration color={C.estimate} size={100} />}
            wide tall
            onPress={() => router.push('/estimate' as never)}
          />
          <View style={styles.row}>
            <Block
              accent="projects"
              icon="⊞"
              label="Projects"
              sub="Jobs, rooms & photos"
              stat={projectStat}
              illustration={<HouseIllustration color={C.projects} size={72} />}
              onPress={() => router.navigate('/(tabs)/projects' as never)}
            />
            <Block
              accent="catalogue"
              icon="≡"
              label="Catalogue"
              sub="Materials & prices"
              stat={catStat}
              illustration={<ShelvesIllustration color={C.catalogue} size={72} />}
              onPress={() => router.push('/catalogue' as never)}
            />
          </View>
          <Block
            accent="tools"
            icon="Ω"
            label="Tools"
            sub="Site calculators"
            wide thin
            onPress={() => router.push('/tools' as never)}
          />
          <Block
            accent="help"
            icon="?"
            label="Help"
            sub="See what SparkQuote can do"
            wide thin
            onPress={() => router.push('/help')}
          />
        </View>
      </ScrollView>
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
    fontSize: 40,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  brandMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: 6,
  },
  brandLine: {
    height: 2,
    width: 32,
    backgroundColor: C.brand,
    borderRadius: 2,
  },
  brandTag: {
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },

  scrollContent: { flexGrow: 1, paddingBottom: 160 },
  grid: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP },

  blockWide: { width: '100%' },

  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.bar,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderTopWidth: 3,
    padding: space.lg,
    justifyContent: 'space-between',
    overflow: 'hidden',
    // Coloured glow — visible on iOS; elevation adds depth on Android
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },

  // Subtle inner highlight stripe at top of each card
  cardHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderTopLeftRadius: radius.bar,
    borderTopRightRadius: radius.bar,
  },

  badge: {
    width: 44, height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSm: {
    width: 36, height: 36, borderRadius: 8,
  },
  badgeIcon: { fontSize: 22, fontWeight: '700' },
  badgeIconSm: { fontSize: 18, fontWeight: '700' },

  blockBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: space.md,
  },
  blockLabel: {
    fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 3,
  },
  blockSub: { fontSize: 12, color: colors.textMuted },
  blockStat: { fontSize: 12, fontWeight: '600' },
  blockArrow: {
    fontSize: 26, fontWeight: '300', lineHeight: 28, marginLeft: space.sm,
  },

  illustrationWrap: {
    position: 'absolute',
    right: -4,
    top: -4,
    opacity: 0.13,
  },

  // Thin catalogue strip
  thinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
