import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { seedIfEmpty, prefixAssembliesWithInstall, repairMissingSeedMaterials, loadCatalogue } from '@/src/data/catalogue-repo';
import { loadProjects } from '@/src/data/project-repo';
import { backfillClientsFromProjects } from '@/src/data/client-repo';
import { loadQuotes } from '@/src/data/quote-repo';
import { needsChaseUp } from '@/src/domain/quotes';
import { useEstimateStore } from '@/src/state/estimateStore';
import { useSettingsStore } from '@/src/state/settingsStore';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import { CircuitBackground } from '@/src/ui/home/CircuitBackground';
import { TabBarHeightReporter } from '@/src/ui/TabBarHeightReporter';
import { useHintWalkthrough } from '@/src/ui/hints/useHintWalkthrough';
import { ScreenHints, HintHeaderSlot } from '@/src/ui/hints/ScreenHints';
import {
  HouseIllustration,
  LightningIllustration,
  ShelvesIllustration,
} from '@/src/ui/home/CardIllustrations';
import { QuoteTypeExplainer } from '@/src/ui/home/QuoteTypeExplainer';

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
  quotes:     '#FFB020',
  chase:      '#E5564B',
} as const;
type Accent = keyof typeof C;

const HOME_HINTS = [
  { id: 'quick-estimate', text: "For a one-off job, tap Quick quote for an on-the-spot price." },
  { id: 'projects', text: 'For a bigger job across several rooms, use Projects instead. Not sure which? Tap “Which one?” on the Quick quote tile.' },
  { id: 'help', text: "Stuck? Tap Help any time — and you can switch these tips off in Settings once you're comfortable." },
];

interface BlockProps {
  accent: Accent;
  icon: string;
  label: string;
  sub: string;
  stat?: string;
  illustration?: React.ReactNode;
  /** Small extra control pinned top-right (standard layout only). */
  aside?: React.ReactNode;
  onPress: () => void;
  wide?: boolean;
  tall?: boolean;
  thin?: boolean;
}

function Block({ accent, icon, label, sub, stat, illustration, aside, onPress, wide, tall, thin }: BlockProps) {
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
            <View style={styles.blockTop}>
              <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                <Text style={[styles.badgeIcon, { color }]}>{icon}</Text>
              </View>
              {aside}
            </View>
            <View style={styles.blockBottom}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockLabel}>{label}</Text>
                <Text style={styles.blockSub}>{sub}</Text>
                {stat ? <Text style={[styles.blockStat, { color, marginTop: 4 }]}>{stat}</Text> : null}
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
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [quoteCounts, setQuoteCounts] = useState<{ chase: number; awaiting: number } | null>(null);
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const hint = useHintWalkthrough('home', HOME_HINTS);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          await seedIfEmpty();
          await repairMissingSeedMaterials();
          await prefixAssembliesWithInstall();
          // Voice setup is no longer forced on first launch — it's optional,
          // reachable from Settings → "Voice & vocabulary".
          await Promise.all([hydrate(), hydrateSettings()]);
          if (!useSettingsStore.getState().clientsBackfilled) {
            await backfillClientsFromProjects();
            useSettingsStore.getState().setClientsBackfilled();
          }
          if (!useSettingsStore.getState().firstRunSetupComplete) {
            router.push('/setup' as any);
          }
          const [projects, cat, quotes] = await Promise.all([loadProjects(), loadCatalogue(), loadQuotes()]);
          setProjectCount(projects.length);
          const now = Date.now();
          setQuoteCounts({
            chase: quotes.filter((q) => needsChaseUp(q.estimate, now)).length,
            awaiting: quotes.filter((q) => q.estimate.status === 'sent').length,
          });
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
      : undefined;

  const quotesStat = quoteCounts == null
    ? undefined
    : quoteCounts.chase > 0
      ? `${quoteCounts.chase} to chase up`
      : quoteCounts.awaiting > 0 ? `${quoteCounts.awaiting} awaiting reply` : undefined;

  const catStat = materialCount == null
    ? undefined
    : `${materialCount} materials`;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <TabBarHeightReporter />
      <CircuitBackground />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Brand */}
        <View style={styles.brandRow}>
          <Image source={require('@/assets/images/brand-mark.png')} style={styles.brandMark} />
          <View style={{ flex: 1 }}>
            {/* One line, shrinking to fit beside the ? and mic buttons on
                narrow screens or large system text sizes. */}
            <Text style={styles.brandName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              <Text style={{ color: C.brand }}>Spark</Text>Quote
            </Text>
            <View style={styles.brandMeta}>
              <View style={styles.brandLine} />
              <Text style={styles.brandTag}>Electrical estimating</Text>
            </View>
          </View>
          <View style={styles.headerBtns}>
            <HintHeaderSlot hint={hint} />
          </View>
        </View>

        {/* Bento grid */}
        <View style={styles.grid}>
          <Block
            accent="estimate"
            icon="⚡"
            label="Quick quote"
            sub="One-off job, priced on the spot — e.g. add 2 sockets"
            stat={estimateStat ? `In progress: ${estimateStat}` : undefined}
            aside={
              <Pressable onPress={() => setExplainerOpen(true)} hitSlop={10} style={[styles.asideLink, { borderColor: C.estimate }]}>
                <Text style={[styles.asideLinkText, { color: C.estimate }]}>Which one?</Text>
              </Pressable>
            }
            illustration={<LightningIllustration color={C.estimate} size={100} />}
            wide tall
            onPress={() => router.push('/estimate' as never)}
          />
          <View style={styles.row}>
            <Block
              accent="projects"
              icon="⊞"
              label="Projects"
              sub="Multi-room jobs — e.g. a rewire"
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
            accent={quoteCounts && quoteCounts.chase > 0 ? 'chase' : 'quotes'}
            icon="✉"
            label="Quotes"
            sub="Sent quotes — track and chase up"
            stat={quotesStat}
            wide thin
            onPress={() => router.push('/quotes' as never)}
          />
          {advancedMode && (
            <Block
              accent="tools"
              icon="Ω"
              label="Tools"
              sub="Site calculators"
              wide thin
              onPress={() => router.push('/tools' as never)}
            />
          )}
          <Block
            accent="help"
            icon="?"
            label="Help"
            sub="See what SparkQuote can do"
            wide thin
            onPress={() => router.push('/help')}
          />
          {!advancedMode && (
            <Pressable style={styles.moreCard} onPress={() => router.navigate('/(tabs)/settings' as never)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.moreTitle}>More features available</Text>
                <Text style={styles.moreSub}>Calculators, voice, shopping lists & more — switch on in Settings.</Text>
              </View>
              <Text style={styles.moreArrow}>›</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <QuoteTypeExplainer
        visible={explainerOpen}
        quickColor={C.estimate}
        projectColor={C.projects}
        onQuick={() => { setExplainerOpen(false); router.push('/estimate' as never); }}
        onProject={() => { setExplainerOpen(false); router.navigate('/(tabs)/projects' as never); }}
        onClose={() => setExplainerOpen(false)}
      />
      <ScreenHints hint={hint} showFab={false} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  brandMark: {
    width: 52,
    height: 52,
    resizeMode: 'contain',
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

  scrollContent: { flexGrow: 1, paddingBottom: 100 },
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
    // Fill the row height so side-by-side tiles match when one has more text.
    flexGrow: 1,
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

  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  moreCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.hairline,
    borderRadius: radius.bar, padding: space.lg,
  },
  moreTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  moreSub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  moreArrow: { fontSize: 26, fontWeight: '300', color: colors.textMuted },
  blockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  asideLink: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: colors.ground },
  asideLinkText: { fontSize: 13, fontWeight: '800' },
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
