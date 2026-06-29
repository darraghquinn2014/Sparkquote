/**
 * Profit report — per-project revenue, material cost, labour, and gross profit.
 *
 * Gross profit = revenue (ex-VAT) − material cost (before markup).
 * This includes labour as income, which is correct for a self-employed
 * electrician: labour is what they're paid for their time, not a cost.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { loadProjects } from '@/src/data/project-repo';
import { loadProjectEstimate } from '@/src/data/project-estimate-repo';
import { priceEstimate } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import type { Project } from '@/src/domain/types';
import { colors, space, radius } from '@/src/ui/theme/tokens';

const allToggles = seedLaborToggles.map(toLaborToggle);

interface ProjectProfit {
  project: Project;
  revenueMinor: number;
  materialCostMinor: number;
  labourMinor: number;
  grossProfitMinor: number;
  marginPct: number;
  hasEstimate: boolean;
}

function marginColor(pct: number): string {
  if (pct >= 30) return '#4CAF50';
  if (pct >= 15) return colors.accent;
  return colors.danger;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function buildReportHtml(rows: ProjectProfit[], totals: { revenue: number; materials: number; labour: number; profit: number }, totalMargin: number, currency: 'GBP' | 'EUR'): string {
  const fmt = (n: number) => formatMoney(n, currency);
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const projectRows = rows.map((r) => {
    if (!r.hasEstimate) {
      return `<tr><td>${r.project.name}${r.project.clientName ? `<br/><span class="sub">${r.project.clientName}</span>` : ''}</td><td colspan="4" class="muted">No quote yet</td></tr>`;
    }
    const mc = marginColor(r.marginPct);
    return `<tr>
      <td>${r.project.name}${r.project.clientName ? `<br/><span class="sub">${r.project.clientName}</span>` : ''}</td>
      <td class="num">${fmt(r.revenueMinor)}</td>
      <td class="num">${fmt(r.materialCostMinor)}</td>
      <td class="num">${fmt(r.labourMinor)}</td>
      <td class="num" style="color:${mc};font-weight:700">${fmt(r.grossProfitMinor)}</td>
      <td class="num" style="color:${mc};font-weight:700">${pct(r.marginPct)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, sans-serif; padding: 28px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .date { color: #888; font-size: 12px; margin-bottom: 24px; }
  .summary { background: #f7f7f7; border-radius: 8px; padding: 16px; display: flex; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; }
  .sum-item { flex: 1; min-width: 120px; }
  .sum-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .sum-val { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .sum-margin { font-size: 24px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #ddd; padding: 7px 6px; }
  td { padding: 10px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sub { font-size: 11px; color: #888; }
  .muted { color: #bbb; font-style: italic; }
  tfoot td { font-weight: 700; border-top: 2px solid #1a1a1a; padding-top: 10px; }
  .footnote { margin-top: 24px; font-size: 11px; color: #aaa; }
</style>
</head><body>
  <h1>Profit Report</h1>
  <div class="date">Generated ${date}</div>
  <div class="summary">
    <div class="sum-item"><div class="sum-label">Revenue</div><div class="sum-val">${fmt(totals.revenue)}</div></div>
    <div class="sum-item"><div class="sum-label">Materials</div><div class="sum-val">${fmt(totals.materials)}</div></div>
    <div class="sum-item"><div class="sum-label">Labour</div><div class="sum-val">${fmt(totals.labour)}</div></div>
    <div class="sum-item"><div class="sum-label">Gross Profit</div><div class="sum-val" style="color:${marginColor(totalMargin)}">${fmt(totals.profit)}</div></div>
    <div class="sum-item"><div class="sum-label">Overall Margin</div><div class="sum-margin" style="color:${marginColor(totalMargin)}">${pct(totalMargin)}</div></div>
  </div>
  <table>
    <thead><tr><th>Project</th><th class="num">Revenue</th><th class="num">Materials</th><th class="num">Labour</th><th class="num">Gross Profit</th><th class="num">Margin</th></tr></thead>
    <tbody>${projectRows}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td class="num">${fmt(totals.revenue)}</td>
      <td class="num">${fmt(totals.materials)}</td>
      <td class="num">${fmt(totals.labour)}</td>
      <td class="num" style="color:${marginColor(totalMargin)}">${fmt(totals.profit)}</td>
      <td class="num" style="color:${marginColor(totalMargin)}">${pct(totalMargin)}</td>
    </tr></tfoot>
  </table>
  <div class="footnote">Gross profit = revenue − material cost. Labour counted as income. VAT excluded.</div>
</body></html>`;
}

export default function ProfitReportScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [rows, setRows] = useState<ProjectProfit[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const projects = await loadProjects();
    const results: ProjectProfit[] = [];

    for (const project of projects) {
      const estimate = await loadProjectEstimate(project.id);
      if (!estimate || estimate.lineItems.length === 0) {
        results.push({
          project, revenueMinor: 0, materialCostMinor: 0, labourMinor: 0,
          grossProfitMinor: 0, marginPct: 0, hasEstimate: false,
        });
        continue;
      }

      const priced = priceEstimate(estimate, allToggles);
      const revenueMinor = priced.subtotalMinor; // ex-VAT
      const materialCostMinor = priced.lines.reduce((s, l) => s + l.materialSubtotalMinor, 0);
      const labourMinor = priced.laborTotalMinor;
      const grossProfitMinor = revenueMinor - materialCostMinor;
      const marginPct = revenueMinor > 0 ? (grossProfitMinor / revenueMinor) * 100 : 0;

      results.push({
        project, revenueMinor, materialCostMinor, labourMinor,
        grossProfitMinor, marginPct, hasEstimate: true,
      });
    }

    setRows(results);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shareReport = async () => {
    setSharing(true);
    try {
      const html = buildReportHtml(rows, totals, totalMargin, currency);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Profit report', UTI: 'com.adobe.pdf' });
    } catch (e) {
      Alert.alert('Share failed', String(e));
    } finally {
      setSharing(false);
    }
  };

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenueMinor,
      materials: acc.materials + r.materialCostMinor,
      labour: acc.labour + r.labourMinor,
      profit: acc.profit + r.grossProfitMinor,
    }),
    { revenue: 0, materials: 0, labour: 0, profit: 0 },
  );
  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const currency: 'GBP' | 'EUR' = 'GBP';

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profit report</Text>
        <Pressable onPress={shareReport} disabled={sharing || loading} hitSlop={8}>
          {sharing
            ? <ActivityIndicator color={colors.accent} size="small" />
            : <Text style={styles.shareBtn}>Share</Text>
          }
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>All projects</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Revenue</Text>
              <Text style={styles.summaryValue}>{formatMoney(totals.revenue, currency)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Materials</Text>
              <Text style={styles.summaryValue}>{formatMoney(totals.materials, currency)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Labour</Text>
              <Text style={styles.summaryValue}>{formatMoney(totals.labour, currency)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Gross profit</Text>
              <Text style={[styles.summaryValue, styles.profitValue]}>{formatMoney(totals.profit, currency)}</Text>
            </View>
          </View>
          <View style={styles.marginBadge}>
            <Text style={styles.marginBadgeLabel}>Overall margin</Text>
            <Text style={[styles.marginBadgeValue, { color: marginColor(totalMargin) }]}>{pct(totalMargin)}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Per project</Text>

        {rows.length === 0 && (
          <Text style={styles.empty}>No projects yet.</Text>
        )}

        {rows.map((row) => (
          <View key={row.project.id} style={styles.projectCard}>
            <View style={styles.projectHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.projectName}>{row.project.name}</Text>
                {row.project.clientName ? (
                  <Text style={styles.projectClient}>{row.project.clientName}</Text>
                ) : null}
              </View>
              {row.hasEstimate && (
                <View style={[styles.marginPill, { backgroundColor: marginColor(row.marginPct) + '22' }]}>
                  <Text style={[styles.marginPillText, { color: marginColor(row.marginPct) }]}>
                    {pct(row.marginPct)}
                  </Text>
                </View>
              )}
            </View>

            {!row.hasEstimate ? (
              <Text style={styles.noEstimate}>No quote yet</Text>
            ) : (
              <View style={styles.breakdown}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Revenue (ex-VAT)</Text>
                  <Text style={styles.breakdownValue}>{formatMoney(row.revenueMinor, currency)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Materials cost</Text>
                  <Text style={[styles.breakdownValue, { color: colors.danger }]}>−{formatMoney(row.materialCostMinor, currency)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Labour</Text>
                  <Text style={styles.breakdownValue}>{formatMoney(row.labourMinor, currency)}</Text>
                </View>
                <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                  <Text style={styles.breakdownTotalLabel}>Gross profit</Text>
                  <Text style={[styles.breakdownTotalValue, { color: row.grossProfitMinor >= 0 ? '#4CAF50' : colors.danger }]}>
                    {formatMoney(row.grossProfitMinor, currency)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        ))}

        <Text style={styles.footnote}>
          Gross profit = revenue − material cost. Labour is counted as income, not a cost.
          VAT excluded throughout.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  shareBtn: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  scroll: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },

  summaryCard: {
    backgroundColor: colors.surface, borderRadius: radius.tile,
    padding: space.lg, gap: space.md,
  },
  summaryTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  summaryItem: { flex: 1, minWidth: '45%' },
  summaryLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 2 },
  summaryValue: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  profitValue: { color: colors.accent },
  marginBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.md,
  },
  marginBadgeLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  marginBadgeValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },

  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: space.sm },

  projectCard: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, gap: space.sm },
  projectHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  projectName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  projectClient: { color: colors.textSecondary, fontSize: 13, marginTop: 1 },
  marginPill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  marginPillText: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  noEstimate: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },

  breakdown: { gap: 4, marginTop: space.xs },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  breakdownLabel: { color: colors.textSecondary, fontSize: 13 },
  breakdownValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.sm, marginTop: space.xs },
  breakdownTotalLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  breakdownTotalValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },

  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: space.sm },
});
