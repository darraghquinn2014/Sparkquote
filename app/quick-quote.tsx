import React, { useCallback, useState } from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { QuickQuoteScreen } from '@/src/ui/quick-quote/QuickQuoteScreen';
import { loadCatalogue } from '@/src/data/catalogue-repo';
import { useEstimateStore } from '@/src/state/estimateStore';
import { useSettingsStore } from '@/src/state/settingsStore';
import type { Assembly, LaborToggle, Material } from '@/src/domain/types';

type Catalogue = { materials: Material[]; assemblies: Assembly[]; toggles: LaborToggle[] };

export default function QuickQuoteRoute() {
  const router = useRouter();
  const hydrate = useEstimateStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hourlyRateMinor = useSettingsStore((s) => s.hourlyRateMinor);
  const vatRatePct = useSettingsStore((s) => s.vatRatePct);
  const currency = useSettingsStore((s) => s.currency);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      await Promise.all([hydrate(), hydrateSettings()]);
      const loaded = await loadCatalogue();
      setCat(loaded);
    } catch (e) {
      setError(String(e));
    }
  }, [hydrate, hydrateSettings]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#07101E', padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: '#E5564B', fontWeight: '700', marginBottom: 8 }}>Error loading catalogue</Text>
        <Text style={{ color: '#6B8DAE' }}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!cat) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#07101E', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#1B8FFF" />
        <Text style={{ color: '#6B8DAE', marginTop: 12 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <QuickQuoteScreen
        assemblies={cat.assemblies.filter((a) => a.quickQuoteRank != null).sort((a, b) => (a.quickQuoteRank ?? 0) - (b.quickQuoteRank ?? 0))}
        materials={cat.materials}
        toggles={cat.toggles}
        config={{ currency, hourlyRateMinor, vatRatePct }}
        onReview={() => router.push('/estimate' as never)}
        onManage={() => router.push('/manage-jobs' as never)}
      />
    </SafeAreaView>
  );
}
