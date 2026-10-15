/**
 * Quote detail — one quote from the Quotes list: client (call/text), total,
 * status (tap to change), a chase-up card when a sent quote has had no reply,
 * the items, and share-again / delete.
 */
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { deleteQuote, loadQuote, setQuoteClient, setQuoteStatus, type QuoteSummary } from '@/src/data/quote-repo';
import { loadClient } from '@/src/data/client-repo';
import { loadBusinessProfile, readLogoDataUri } from '@/src/data/business-profile';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import {
  chaseUpMessage, daysSince, needsChaseUp, QUOTE_STATUSES, QUOTE_STATUS_LABELS,
} from '@/src/domain/quotes';
import type { Client, EstimateStatus } from '@/src/domain/types';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { ClientPicker } from '@/src/ui/clients/ClientPicker';
import { QUOTE_STATUS_COLORS } from '@/src/ui/quotes/StatusChip';
import { colors, radius, space } from '@/src/ui/theme/tokens';

const toggles = seedLaborToggles.map(toLaborToggle);

export default function QuoteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const q = await loadQuote(id);
    setQuote(q);
    setClient(q?.clientId ? await loadClient(q.clientId) : null);
    setLoaded(true);
  }, [id]);

  useFocusEffect(useCallback(() => {
    reload().catch((e) => console.error('load quote failed', e));
    loadBusinessProfile().then((p) => setBusinessName(p.businessName)).catch(() => {});
  }, [reload]));

  if (!quote) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        </View>
        {loaded && <Text style={styles.missing}>Quote not found.</Text>}
      </SafeAreaView>
    );
  }

  const { estimate } = quote;
  const priced = priceEstimate(estimate, toggles);
  const totalText = formatMoney(priced.grandTotalMinor, estimate.currency);
  const now = Date.now();
  const chase = needsChaseUp(estimate, now);
  const isQuick = quote.projectId == null;
  const phone = client?.phone?.replace(/\s+/g, '');

  const changeStatus = async (next: EstimateStatus) => {
    if (next === estimate.status) return;
    await setQuoteStatus(estimate.id, next);
    reload();
  };

  const followUpText = () => chaseUpMessage({
    clientName: quote.clientName, sentAt: estimate.sentAt ?? now, totalText, businessName,
  });

  const textClient = () => {
    const body = encodeURIComponent(followUpText());
    Linking.openURL(`sms:${phone}?body=${body}`).catch(() => Alert.alert('Could not open messages'));
  };

  const shareFollowUp = () => {
    Share.share({ message: followUpText() }).catch(() => {});
  };

  const shareAgain = async () => {
    try {
      const logoDataUri = await readLogoDataUri();
      const profile = await loadBusinessProfile();
      const html = renderEstimateHtml(toClientEstimate(estimate, priced, {
        businessName: profile.businessName || undefined,
        tagline: profile.tagline || undefined,
        logoDataUri: logoDataUri ?? undefined,
        clientName: quote.clientName,
        reference: quote.projectName ? quote.projectName.slice(0, 20).toUpperCase() : undefined,
        dateIso: new Date(estimate.sentAt ?? now).toISOString(),
      }));
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share quote' });
    } catch (e) {
      Alert.alert('Could not share quote', String(e));
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this quote?', 'It will be removed from your Quotes list. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteQuote(estimate.id); router.back(); } },
    ]);
  };

  const pickClient = async (c: Client | null) => {
    setClientPickerOpen(false);
    await setQuoteClient(estimate.id, c);
    reload();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>{isQuick ? 'Quick quote' : 'Project quote'}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Client */}
        <Pressable disabled={!isQuick} onPress={() => setClientPickerOpen(true)}>
          <Text style={styles.clientName}>{quote.clientName || (isQuick ? '+ Add client' : 'No client')}</Text>
        </Pressable>
        {quote.projectName ? (
          <Pressable onPress={() => router.push(`/project/${quote.projectId}` as any)} hitSlop={6}>
            <Text style={styles.projectLink}>{quote.projectName} ›</Text>
          </Pressable>
        ) : null}
        {phone ? (
          <View style={styles.contactRow}>
            <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}>
              <Text style={styles.contactText}>📞 Call</Text>
            </Pressable>
            <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`sms:${phone}`).catch(() => {})}>
              <Text style={styles.contactText}>💬 Text</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Total + dates */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total (inc. VAT)</Text>
          <Text style={styles.totalValue}>{totalText}</Text>
          {estimate.sentAt ? (
            <Text style={styles.dateText}>
              Sent {new Date(estimate.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{daysSince(estimate.sentAt, now) === 0 ? 'today' : `${daysSince(estimate.sentAt, now)} day${daysSince(estimate.sentAt, now) === 1 ? '' : 's'} ago`}
            </Text>
          ) : null}
        </View>

        {/* Chase-up nudge */}
        {chase && (
          <View style={styles.chaseCard}>
            <Text style={styles.chaseTitle}>No reply for {daysSince(estimate.sentAt!, now)} days</Text>
            <Text style={styles.chaseText}>Send a quick follow-up — it’s written for you.</Text>
            <View style={styles.contactRow}>
              {phone ? (
                <>
                  <Pressable style={[styles.chaseBtn, { flex: 2 }]} onPress={textClient}>
                    <Text style={styles.chaseBtnText}>Text follow-up</Text>
                  </Pressable>
                  <Pressable style={[styles.chaseBtnOutline, { flex: 1 }]} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}>
                    <Text style={styles.chaseBtnOutlineText}>Call</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable style={[styles.chaseBtn, { flex: 1 }]} onPress={shareFollowUp}>
                  <Text style={styles.chaseBtnText}>Share follow-up message</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Status */}
        <Text style={styles.section}>STATUS</Text>
        <View style={styles.statusRow}>
          {QUOTE_STATUSES.map((s) => {
            const active = estimate.status === s;
            const color = QUOTE_STATUS_COLORS[s];
            return (
              <Pressable
                key={s}
                onPress={() => changeStatus(s)}
                style={[styles.statusChip, active && { backgroundColor: color, borderColor: color }]}
              >
                <Text style={[styles.statusText, { color: active ? colors.accentInk : color }]}>{QUOTE_STATUS_LABELS[s]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Items */}
        <Text style={styles.section}>ITEMS</Text>
        {estimate.lineItems.map((line) => {
          const p = priced.lines.find((l) => l.lineId === line.id);
          const qty = line.quantityMeters != null ? `${line.quantityMeters}m` : `×${line.quantity ?? 1}`;
          return (
            <View key={line.id} style={styles.lineRow}>
              <Text style={styles.lineDesc} numberOfLines={2}>{line.description}</Text>
              <Text style={styles.lineQty}>{qty}</Text>
              <Text style={styles.lineTotal}>{formatMoney(p?.lineTotalMinor ?? 0, estimate.currency)}</Text>
            </View>
          );
        })}

        {/* Actions */}
        <Pressable style={styles.actionBtn} onPress={shareAgain}>
          <Text style={styles.actionText}>Share quote PDF again</Text>
        </Pressable>
        {isQuick && (
          <Pressable onPress={confirmDelete} hitSlop={8} style={styles.deleteLink}>
            <Text style={styles.deleteText}>Delete quote</Text>
          </Pressable>
        )}
      </ScrollView>

      <ClientPicker
        visible={clientPickerOpen}
        selectedId={quote.clientId}
        onPick={pickClient}
        onClear={() => pickClient(null)}
        onClose={() => setClientPickerOpen(false)}
      />
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
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600', width: 50 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  missing: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
  body: { padding: space.lg, paddingBottom: space.xxl },
  clientName: { color: colors.textPrimary, fontSize: 24, fontWeight: '800' },
  projectLink: { color: colors.accent, fontSize: 15, fontWeight: '600', marginTop: 2 },
  contactRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  contactBtn: {
    borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface,
    borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  contactText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  totalCard: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, marginTop: space.lg },
  totalLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  totalValue: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', marginTop: 2 },
  dateText: { color: colors.textSecondary, fontSize: 13, marginTop: space.xs },
  chaseCard: {
    backgroundColor: colors.danger + '12', borderRadius: radius.tile, padding: space.lg, marginTop: space.md,
    borderWidth: 1, borderColor: colors.danger + '44',
  },
  chaseTitle: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  chaseText: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
  chaseBtn: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  chaseBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  chaseBtnOutline: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  chaseBtnOutlineText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  section: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2,
    marginTop: space.xl, marginBottom: space.sm,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  statusChip: {
    borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface,
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6,
  },
  statusText: { fontSize: 13, fontWeight: '800' },
  lineRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  lineDesc: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  lineQty: { color: colors.textMuted, fontSize: 13, minWidth: 40, textAlign: 'right' },
  lineTotal: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', minWidth: 72, textAlign: 'right' },
  actionBtn: {
    marginTop: space.xl, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: space.md, alignItems: 'center',
  },
  actionText: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  deleteLink: { alignSelf: 'center', marginTop: space.lg, padding: space.sm },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
