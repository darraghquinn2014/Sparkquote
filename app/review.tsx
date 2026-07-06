import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Switch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SignAndSendScreen } from '@/src/ui/pdf/SignAndSendScreen';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { priceEstimate } from '@/src/domain/pricing';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { useEstimateStore } from '@/src/state/estimateStore';
import { useSettingsStore } from '@/src/state/settingsStore';
import { loadProjectEstimate } from '@/src/data/project-estimate-repo';
import { loadProjects } from '@/src/data/project-repo';
import type { Estimate, Project } from '@/src/domain/types';
import { loadBusinessProfile, readLogoDataUri, type BusinessProfile } from '@/src/data/business-profile';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors, space, radius } from '@/src/ui/theme/tokens';

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
  const showLaborBreakdown = useSettingsStore((s) => s.showLaborBreakdown);
  const setShowLaborBreakdown = useSettingsStore((s) => s.setShowLaborBreakdown);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  const estimate = { ...(projectEstimate ?? activeEstimate), showLaborBreakdown };

  useEffect(() => {
    hydrateSettings();
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

  const onPrint = async () => {
    try {
      setBusy(true);
      const html = renderEstimateHtml(client);
      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Print error', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSigned = async (signatureDataUri: string) => {
    try {
      setBusy(true);
      // For project estimates use projectEstimate; for quick quotes use live store state.
      const liveEstimate = {
        ...(projectEstimate ?? useEstimateStore.getState().estimate),
        showLaborBreakdown,
      };
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
          {projectId ? 'No items on this quote yet. Add items per room on the project quote screen.' : 'No items yet. Add a job, labour, or material on the Estimate screen first.'}
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
            value={showLaborBreakdown}
            onValueChange={setShowLaborBreakdown}
            trackColor={{ true: colors.accent, false: colors.hairline }}
            thumbColor={colors.textPrimary}
          />
        </View>
      )}
      <Pressable style={styles.printBtn} onPress={onPrint} hitSlop={8}>
        <Text style={styles.printBtnText}>Print quote</Text>
      </Pressable>
      <SignAndSendScreen estimate={client} onSigned={onSigned} onCancel={() => router.back()} />
      {busy && <View style={styles.busy}><Text style={styles.busyText}>Generating PDF…</Text></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  empty: { flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  emptyText: { color: colors.textSecondary, fontSize: 16, textAlign: 'center' },
  busy: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  busyText: { color: colors.accent, fontWeight: '700' },
  printBtn: {
    alignSelf: 'flex-end',
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  printBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, paddingVertical: space.md,
    backgroundColor: colors.surface, marginHorizontal: space.lg, marginTop: space.md,
    borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  toggleHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
