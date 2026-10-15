import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Switch, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SignAndSendScreen } from '@/src/ui/pdf/SignAndSendScreen';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { priceEstimate } from '@/src/domain/pricing';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { useEstimateStore } from '@/src/state/estimateStore';
import { useSettingsStore } from '@/src/state/settingsStore';
import { loadProjectEstimate, projectEstimateId } from '@/src/data/project-estimate-repo';
import { loadProjects } from '@/src/data/project-repo';
import { saveQuickQuote, setQuoteStatus } from '@/src/data/quote-repo';
import type { Client, Estimate, EstimateStatus, Project } from '@/src/domain/types';
import { loadBusinessProfile, readLogoDataUri, type BusinessProfile } from '@/src/data/business-profile';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import { useHintWalkthrough } from '@/src/ui/hints/useHintWalkthrough';
import { ScreenHints, HintHeaderSlot } from '@/src/ui/hints/ScreenHints';
import { ClientPicker } from '@/src/ui/clients/ClientPicker';

const toggles = seedLaborToggles.map(toLaborToggle);

const REVIEW_HINTS = [
  { id: 'labour-toggle', text: 'Choose whether the client-facing quote shows an "includes labour" note or stays materials-only.' },
  { id: 'send', text: 'Send quote shares the PDF (email, WhatsApp…) and saves it to your Quotes list as Sent, so you can chase it up.' },
  { id: 'sign', text: 'Or have the client sign on screen below — that saves it as Accepted.' },
];

export default function ReviewRoute() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const [busy, setBusy] = useState(false);
  const [projectEstimate, setProjectEstimate] = useState<Estimate | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [profile, setProfile] = useState<BusinessProfile>({ businessName: '', tagline: '', logoPath: null });
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  // Client for a quick quote (project quotes use the project's client).
  const [quoteClient, setQuoteClient] = useState<Client | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const activeEstimate = useEstimateStore((s) => s.estimate);
  const clearActive = useEstimateStore((s) => s.clear);
  const showLaborBreakdown = useSettingsStore((s) => s.showLaborBreakdown);
  const setShowLaborBreakdown = useSettingsStore((s) => s.setShowLaborBreakdown);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  const estimate = { ...(projectEstimate ?? activeEstimate), showLaborBreakdown };
  const hint = useHintWalkthrough('review', REVIEW_HINTS);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    hydrateSettings();
    loadBusinessProfile().then(setProfile).catch(console.error);
    readLogoDataUri().then(setLogoDataUri).catch(console.error);
    if (!projectId) return;
    loadProjectEstimate(projectId).then((e) => { if (e) setProjectEstimate(e); }).catch(console.error);
    loadProjects().then((ps) => setProjectData(ps.find((p) => p.id === projectId) ?? null)).catch(console.error);
  }, [projectId]);

  const clientName = projectId ? projectData?.clientName : quoteClient?.name;

  const buildMeta = () => ({
    businessName: profile.businessName || undefined,
    tagline: profile.tagline || undefined,
    logoDataUri: logoDataUri ?? undefined,
    clientName: clientName || undefined,
    reference: projectData ? projectData.name.slice(0, 20).toUpperCase() : undefined,
    dateIso: new Date().toISOString(),
  });

  const priced = priceEstimate(estimate, toggles);
  const client = toClientEstimate(estimate, priced, buildMeta());

  /** The estimate as it stands right now (quick quotes read live store state). */
  const liveEstimate = () => ({
    ...(projectEstimate ?? useEstimateStore.getState().estimate),
    showLaborBreakdown,
  });

  /**
   * Record the quote in the Quotes list. Quick quotes are saved as a copy (the
   * active one is cleared in finish(), once we navigate away); project quotes
   * just move status (never back from accepted/invoiced to sent).
   */
  const recordQuote = async (status: EstimateStatus) => {
    if (projectId) {
      const current = projectEstimate?.status ?? 'draft';
      if (status === 'sent' && current !== 'draft') return projectEstimateId(projectId);
      await setQuoteStatus(projectEstimateId(projectId), status);
      return projectEstimateId(projectId);
    }
    return saveQuickQuote(liveEstimate(), { status, client: quoteClient });
  };

  const finish = (quoteId: string, status: EstimateStatus) => {
    Alert.alert(
      status === 'sent' ? 'Saved as Sent' : 'Saved as Accepted',
      status === 'sent'
        ? "It's in your Quotes list. You'll get a nudge to chase it up if there's no reply after 3 days."
        : "It's in your Quotes list as Accepted.",
      [{
        text: 'OK', onPress: () => {
          // Fresh quick quote for the next job — the sent one lives in Quotes now.
          if (!projectId) clearActive();
          router.replace(`/quote/${quoteId}` as any);
        },
      }],
    );
  };

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

  const onSend = async () => {
    try {
      setBusy(true);
      const est = liveEstimate();
      const html = renderEstimateHtml(toClientEstimate(est, priceEstimate(est, toggles), buildMeta()));
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Send quote' });
      }
      setBusy(false);
      // The share sheet doesn't say whether it was actually sent, so ask.
      Alert.alert('Did you send it?', 'Mark this quote as Sent and add it to your Quotes list?', [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Yes, sent', onPress: async () => {
            try { finish(await recordQuote('sent'), 'sent'); } catch (e) { Alert.alert('Could not save quote', String(e)); }
          },
        },
      ]);
    } catch (e) {
      setBusy(false);
      Alert.alert('Error', String(e));
    }
  };

  const onSigned = async (signatureDataUri: string) => {
    try {
      setBusy(true);
      const est = liveEstimate();
      const html = renderEstimateHtml(toClientEstimate(est, priceEstimate(est, toggles), buildMeta()), {
        dataUri: signatureDataUri,
        signedByName: clientName || 'Client',
        signedDateIso: new Date().toISOString(),
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Send signed quote' });
      } else {
        Alert.alert('PDF created', uri);
      }
      finish(await recordQuote('accepted'), 'accepted');
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Send or sign</Text>
        <View style={styles.headerRight}>
          <HintHeaderSlot hint={hint} />
        </View>
      </View>
      {!projectId && (
        <Pressable style={styles.toggleRow} onPress={() => setClientPickerOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleHint}>Client</Text>
            <Text style={quoteClient ? styles.toggleLabel : styles.clientPlaceholder}>
              {quoteClient ? quoteClient.name : 'Choose or add a client'}
            </Text>
          </View>
          <Text style={styles.clientChange}>{quoteClient ? 'Change' : '›'}</Text>
        </Pressable>
      )}
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
      <View style={styles.actionRow}>
        <Pressable style={styles.printBtn} onPress={onPrint} disabled={busy} hitSlop={8}>
          <Text style={styles.printBtnText}>Print</Text>
        </Pressable>
        <Pressable style={styles.sendBtn} onPress={onSend} disabled={busy} hitSlop={8}>
          <Text style={styles.sendBtnText}>Send quote</Text>
        </Pressable>
      </View>
      <SignAndSendScreen estimate={client} onSigned={onSigned} onCancel={() => router.back()} />
      {busy && <View style={styles.busy}><Text style={styles.busyText}>Generating PDF…</Text></View>}
      <ClientPicker
        visible={clientPickerOpen}
        selectedId={quoteClient?.id}
        onPick={(c) => { setQuoteClient(c); setClientPickerOpen(false); }}
        onClear={() => { setQuoteClient(null); setClientPickerOpen(false); }}
        onClose={() => setClientPickerOpen(false)}
      />
      <ScreenHints hint={hint} bottomInset={insets.bottom} showFab={false} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingTop: space.sm,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 60 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  headerRight: { width: 60, alignItems: 'flex-end' },
  empty: { flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  emptyText: { color: colors.textSecondary, fontSize: 16, textAlign: 'center' },
  busy: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  busyText: { color: colors.accent, fontWeight: '700' },
  actionRow: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm,
    marginHorizontal: space.lg, marginTop: space.md,
  },
  printBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  printBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  sendBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  sendBtnText: { color: colors.accentInk, fontSize: 13, fontWeight: '800' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, paddingVertical: space.md,
    backgroundColor: colors.surface, marginHorizontal: space.lg, marginTop: space.md,
    borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  toggleHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  clientPlaceholder: { color: colors.textMuted, fontSize: 15 },
  clientChange: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
