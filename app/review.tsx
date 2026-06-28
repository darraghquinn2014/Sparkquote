import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SignAndSendScreen } from '@/src/ui/pdf/SignAndSendScreen';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { priceEstimate } from '@/src/domain/pricing';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { useEstimateStore } from '@/src/state/estimateStore';
import { loadProjectEstimate } from '@/src/data/project-estimate-repo';
import { loadProjects } from '@/src/data/project-repo';
import type { Estimate, Project } from '@/src/domain/types';
import { loadBusinessProfile, readLogoDataUri, type BusinessProfile } from '@/src/data/business-profile';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const toggles = seedLaborToggles.map(toLaborToggle);

export default function ReviewRoute() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const [busy, setBusy] = useState(false);
  const [projectEstimate, setProjectEstimate] = useState<Estimate | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [profile, setProfile] = useState<BusinessProfile>({ businessName: '', tagline: '', logoPath: null });
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);

  const activeEstimate = useEstimateStore((s) => s.estimate);
  const setShowLaborBreakdown = useEstimateStore((s) => s.setShowLaborBreakdown);

  const estimate = projectEstimate ?? activeEstimate;

  useEffect(() => {
    loadBusinessProfile().then(setProfile).catch(console.error);
    readLogoDataUri().then(setLogoDataUri).catch(console.error);
    if (!projectId) return;
    loadProjectEstimate(projectId).then((e) => { if (e) setProjectEstimate(e); }).catch(console.error);
    loadProjects().then((ps) => setProjectData(ps.find((p) => p.id === projectId) ?? null)).catch(console.error);
  }, [projectId]);

  const priced = priceEstimate(estimate, toggles);
  const meta = {
    businessName: profile.businessName || undefined,
    tagline: profile.tagline || undefined,
    logoDataUri: logoDataUri ?? undefined,
    clientName: projectData?.clientName || undefined,
    reference: projectData ? projectData.name.slice(0, 20).toUpperCase() : undefined,
    dateIso: new Date().toISOString(),
  };
  const client = toClientEstimate(estimate, priced, meta);

  const onSigned = async (signatureDataUri: string) => {
    try {
      setBusy(true);
      // For project estimates use projectEstimate; for quick quotes use live store state.
      const liveEstimate = projectEstimate ?? useEstimateStore.getState().estimate;
      const livePriced = priceEstimate(liveEstimate, toggles);
      const liveClient = toClientEstimate(liveEstimate, livePriced, meta);
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
        <Text style={styles.emptyText}>
          {projectId ? 'No items on this quote yet. Add items per room on the project quote screen.' : 'No items yet. Add some jobs on Quick Quote first.'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {!projectId && (
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
      )}
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
