import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SignAndSendScreen } from '@/src/ui/pdf/SignAndSendScreen';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { priceEstimate } from '@/src/domain/pricing';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { useEstimateStore } from '@/src/state/estimateStore';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const toggles = seedLaborToggles.map(toLaborToggle);

export default function ReviewRoute() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const estimate = useEstimateStore((s) => s.estimate);
  const setShowLaborBreakdown = useEstimateStore((s) => s.setShowLaborBreakdown);

  const priced = priceEstimate(estimate, toggles);
  const client = toClientEstimate(estimate, priced, {
    businessName: 'Watts Electrical',
    clientName: 'Sample Client',
    reference: 'Q-DEMO',
    dateIso: new Date().toISOString(),
  });

  const onSigned = async (signatureDataUri: string) => {
    try {
      setBusy(true);
      // Rebuild fresh from current store state so the labour toggle is honoured.
      const liveEstimate = useEstimateStore.getState().estimate;
      const livePriced = priceEstimate(liveEstimate, toggles);
      const liveClient = toClientEstimate(liveEstimate, livePriced, {
        businessName: 'Watts Electrical',
        clientName: 'Sample Client',
        reference: 'Q-DEMO',
        dateIso: new Date().toISOString(),
      });
      const html = renderEstimateHtml(liveClient, {
        dataUri: signatureDataUri,
        signedByName: 'Sample Client',
        signedDateIso: new Date().toISOString(),
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Send estimate' });
      } else {
        Alert.alert('PDF created', uri);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setBusy(false);
    }
  };

  if (estimate.lineItems.length === 0) {
    return (
      <SafeAreaView style={styles.empty} edges={['top', 'bottom']}>
        <Text style={styles.emptyText}>No items yet. Add some jobs on Quick Quote first.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Show labour on quote</Text>
          <Text style={styles.toggleHint}>Adds an "includes labour" line for the client</Text>
        </View>
        <Switch
          value={estimate.showLaborBreakdown ?? true}
          onValueChange={setShowLaborBreakdown}
          trackColor={{ true: '#FFB020', false: '#2E3744' }}
          thumbColor='#F2F5F8'
        />
      </View>
      <SignAndSendScreen estimate={client} onSigned={onSigned} onCancel={() => router.back()} />
      {busy && <View style={styles.busy}><Text style={styles.busyText}>Generating PDF…</Text></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#14181F' },
  empty: { flex: 1, backgroundColor: '#14181F', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#9AA7B4', fontSize: 16, textAlign: 'center' },
  busy: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  busyText: { color: '#FFB020', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#1E242E', marginHorizontal: 16, marginTop: 12, borderRadius: 14 },
  toggleLabel: { color: '#F2F5F8', fontSize: 15, fontWeight: '600' },
  toggleHint: { color: '#5E6B79', fontSize: 12, marginTop: 2 },
});
