import React, { useEffect, useState } from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { QuickQuoteScreen } from '@/src/ui/quick-quote/QuickQuoteScreen';
import { seedIfEmpty, loadCatalogue } from '@/src/data/catalogue-repo';
import { useEstimateStore } from '@/src/state/estimateStore';
import type { Assembly, LaborToggle, Material } from '@/src/domain/types';

type Catalogue = { materials: Material[]; assemblies: Assembly[]; toggles: LaborToggle[] };

export default function HomeScreen() {
  const router = useRouter();
  const hydrate = useEstimateStore((s) => s.hydrate);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await seedIfEmpty();
        await hydrate();              // load any saved estimate before UI is interactive
        const loaded = await loadCatalogue();
        setCat(loaded);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [hydrate]);

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#14181F', padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: '#FF6B6B', fontWeight: '700', marginBottom: 8 }}>Database error</Text>
        <Text style={{ color: '#9AA7B4' }}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!cat) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#14181F', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFB020" />
        <Text style={{ color: '#9AA7B4', marginTop: 12 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <QuickQuoteScreen
        assemblies={cat.assemblies}
        materials={cat.materials}
        toggles={cat.toggles}
        config={{ currency: 'GBP', hourlyRateMinor: 5000, vatRatePct: 20 }}
        onReview={() => router.push('/review')}
      />
    </SafeAreaView>
  );
}
