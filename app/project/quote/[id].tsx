/**
 * Project quote screen — add items per room, see totals rolled up by floor.
 * id = projectId
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { priceEstimate, priceLine } from '@/src/domain/pricing';
import { formatMoney } from '@/src/domain/money';
import { addLine, removeLine, lineFromMaterial, lineFromLabour } from '@/src/data/estimate-service';
import { loadProjects, loadLocations } from '@/src/data/project-repo';
import { loadProjectEstimate, saveProjectEstimate } from '@/src/data/project-estimate-repo';
import { loadCatalogue } from '@/src/data/catalogue-repo';
import { MaterialPicker } from '@/src/ui/catalogue/MaterialPicker';
import { LabourSheet } from '@/src/ui/catalogue/LabourSheet';
import { EditLineSheet } from '@/src/ui/catalogue/EditLineSheet';
import { PhotoMeasureSheet } from '@/src/ui/measure/PhotoMeasureSheet';
import { useVoiceAction } from '@/src/voice/voice-bus';
import { toLaborToggle } from '@/src/data/mappers';
import { seedLaborToggles } from '@/src/data/seed/assemblies';
import type { Project, Location, Estimate, LineItem, Material } from '@/src/domain/types';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import { loadBusinessProfile, readLogoDataUri } from '@/src/data/business-profile';
import { toClientEstimate } from '@/src/pdf/client-view-model';
import { renderEstimateHtml } from '@/src/pdf/render-html';
import { PdfPreviewModal } from '@/src/ui/pdf/PdfPreviewModal';

const allToggles = seedLaborToggles.map(toLaborToggle);

function emptyEstimate(): Estimate {
  return {
    id: '',
    mode: 'project',
    status: 'draft',
    currency: 'GBP',
    hourlyRateMinor: 5000,
    vatRatePct: 20,
    appliedLaborToggleIds: [],
    lineItems: [],
  };
}

export default function ProjectQuoteScreen() {
  const router = useRouter();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [estimate, setEstimate] = useState<Estimate>(emptyEstimate());
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickerRoomId, setPickerRoomId] = useState<string | null>(null);
  const [labourRoomId, setLabourRoomId] = useState<string | null>(null);
  const [measureRoomId, setMeasureRoomId] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<LineItem | null>(null);
  const [rateEditing, setRateEditing] = useState(false);
  const [rateText, setRateText] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    const [ps, locs, saved, cat] = await Promise.all([
      loadProjects(),
      loadLocations(projectId),
      loadProjectEstimate(projectId),
      loadCatalogue(),
    ]);
    setProject(ps.find((p) => p.id === projectId) ?? null);
    setLocations(locs);
    setEstimate(saved ?? emptyEstimate());
    setMaterials(cat.materials);
    setLoading(false);
  }, [projectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = useCallback(async (updated: Estimate) => {
    setEstimate(updated);
    if (projectId) await saveProjectEstimate(projectId, updated).catch(console.error);
  }, [projectId]);

  const floors = locations.filter((l) => l.parentId == null);
  const roomsOf = (floorId: string) => locations.filter((l) => l.parentId === floorId);

  const priced = priceEstimate(estimate, allToggles);
  const lineTotalById = new Map(priced.lines.map((l) => [l.lineId, l.lineTotalMinor]));

  const roomTotal = (roomId: string) =>
    estimate.lineItems
      .filter((l) => l.locationId === roomId)
      .reduce((s, l) => s + (lineTotalById.get(l.id) ?? 0), 0);

  const floorTotal = (floorId: string) =>
    roomsOf(floorId).reduce((s, r) => s + roomTotal(r.id), 0);

  const unassigned = estimate.lineItems.filter((l) => !l.locationId);

  const handleAddMaterial = useCallback((material: Material, amount: number) => {
    if (!pickerRoomId) return;
    const line: LineItem = { ...lineFromMaterial(material, amount), locationId: pickerRoomId };
    save(addLine(estimate, line));
    setPickerRoomId(null);
  }, [pickerRoomId, estimate, save]);

  const handleAddLabour = useCallback((opts: { hours?: number; flatMinor?: number }) => {
    if (!labourRoomId) return;
    const line: LineItem = { ...lineFromLabour(opts), locationId: labourRoomId };
    save(addLine(estimate, line));
    setLabourRoomId(null);
  }, [labourRoomId, estimate, save]);

  const handleAddMeasureLines = useCallback((lines: LineItem[]) => {
    const updated = lines.reduce((est, line) => addLine(est, line), estimate);
    save(updated);
    setMeasureRoomId(null);
  }, [estimate, save]);

  const handleSaveEdit = useCallback((updated: LineItem) => {
    save({ ...estimate, lineItems: estimate.lineItems.map((l) => l.id === updated.id ? updated : l) });
  }, [estimate, save]);

  const handleRemove = (lineId: string) => save(removeLine(estimate, lineId));

  const previewPdf = async () => {
    try {
      setPreviewing(true);
      const [profile, logoDataUri] = await Promise.all([loadBusinessProfile(), readLogoDataUri()]);
      const meta = {
        businessName: profile.businessName || undefined,
        tagline: profile.tagline || undefined,
        logoDataUri: logoDataUri ?? undefined,
        clientName: project?.clientName || undefined,
        reference: project ? project.name.slice(0, 20).toUpperCase() : undefined,
        dateIso: new Date().toISOString(),
      };
      const priced = priceEstimate(estimate, allToggles);
      const client = toClientEstimate(estimate, priced, meta);
      setPreviewHtml(renderEstimateHtml(client));
    } catch (e) {
      Alert.alert('Preview error', String(e));
    } finally {
      setPreviewing(false);
    }
  };

  useVoiceAction('previewPdf', previewPdf);

  // Global voice control writes straight to the DB, bypassing this screen's
  // own in-memory estimate — reload so an item/labour line added by voice
  // (to this project, any room) actually shows up without a refocus.
  useVoiceAction('projectEstimateChanged', ({ projectId: changedId }) => {
    if (changedId === projectId) load();
  });

  const commitRate = () => {
    const n = parseFloat(rateText);
    if (Number.isFinite(n) && n > 0) save({ ...estimate, hourlyRateMinor: Math.round(n * 100) });
    setRateEditing(false);
  };

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{project?.name ?? 'Quote'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pressable
            style={[styles.reviewBtn, estimate.lineItems.length === 0 && styles.reviewBtnDisabled]}
            onPress={() => estimate.lineItems.length > 0 && router.push(`/review?projectId=${projectId}` as any)}
            hitSlop={8}
          >
            <Text style={styles.reviewBtnText}>Review ›</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Labour rate */}
        <Pressable
          style={styles.rateRow}
          onPress={() => { setRateText(String(estimate.hourlyRateMinor / 100)); setRateEditing(true); }}
        >
          <Text style={styles.rateLabel}>Labour rate</Text>
          {rateEditing ? (
            <View style={styles.rateEditRow}>
              <Text style={styles.rateCurrency}>£</Text>
              <TextInput
                value={rateText}
                onChangeText={(t) => setRateText(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                autoFocus
                style={styles.rateInput}
                onBlur={commitRate}
                onSubmitEditing={commitRate}
              />
              <Text style={styles.ratePerHr}>/hr</Text>
            </View>
          ) : (
            <Text style={styles.rateValue}>{formatMoney(estimate.hourlyRateMinor, estimate.currency)}/hr</Text>
          )}
        </Pressable>

        {floors.length === 0 && (
          <Text style={styles.noRooms}>Add floors and rooms to the project first, then come back to quote here.</Text>
        )}

        {floors.map((floor) => {
          const ft = floorTotal(floor.id);
          const rooms = roomsOf(floor.id);
          return (
            <View key={floor.id} style={styles.floorBlock}>
              <View style={styles.floorHeader}>
                <Text style={styles.floorName}>{floor.name}</Text>
                {ft > 0 && <Text style={styles.floorTotal}>{formatMoney(ft, estimate.currency)}</Text>}
              </View>

              {rooms.length === 0 && (
                <Text style={styles.noRooms}>No rooms on this floor yet.</Text>
              )}

              {rooms.map((room) => {
                const rt = roomTotal(room.id);
                const roomLines = estimate.lineItems.filter((l) => l.locationId === room.id);
                return (
                  <View key={room.id} style={styles.roomCard}>
                    <View style={styles.roomHeader}>
                      <Text style={styles.roomName}>{room.name}</Text>
                      {rt > 0 && <Text style={styles.roomTotal}>{formatMoney(rt, estimate.currency)}</Text>}
                    </View>

                    {roomLines.map((line) => (
                      <View key={line.id} style={styles.lineRow}>
                        <Pressable style={styles.lineMain} onPress={() => setEditLine(line)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.lineDesc}>{line.description}</Text>
                            {line.quantityMeters != null
                              ? <Text style={styles.lineQty}>{line.quantityMeters}m</Text>
                              : line.quantity != null && line.quantity !== 1
                                ? <Text style={styles.lineQty}>×{line.quantity}</Text>
                                : null}
                          </View>
                          <Text style={styles.editHint}>✎</Text>
                        </Pressable>
                        <Text style={styles.lineAmt}>{formatMoney(lineTotalById.get(line.id) ?? 0, estimate.currency)}</Text>
                        <Pressable onPress={() => handleRemove(line.id)} hitSlop={8} style={styles.removeBtn}>
                          <Text style={styles.removeText}>✕</Text>
                        </Pressable>
                      </View>
                    ))}

                    <View style={styles.roomActions}>
                      <Pressable style={styles.actionBtn} onPress={() => setPickerRoomId(room.id)}>
                        <Text style={styles.actionBtnText}>+ Add item</Text>
                      </Pressable>
                      <Pressable style={styles.actionBtn} onPress={() => setLabourRoomId(room.id)}>
                        <Text style={styles.actionBtnText}>+ Labour</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.cableEstBtn} onPress={() => setMeasureRoomId(room.id)}>
                      <Text style={styles.cableEstBtnText}>~ Measure room</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Unassigned lines */}
        {unassigned.length > 0 && (
          <View style={styles.floorBlock}>
            <View style={styles.floorHeader}>
              <Text style={styles.floorName}>General</Text>
            </View>
            {unassigned.map((line) => (
              <View key={line.id} style={[styles.lineRow, styles.lineRowUnassigned]}>
                <Text style={[styles.lineDesc, { flex: 1 }]}>{line.description}</Text>
                <Text style={styles.lineAmt}>{formatMoney(lineTotalById.get(line.id) ?? 0, estimate.currency)}</Text>
                <Pressable onPress={() => handleRemove(line.id)} hitSlop={8} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Grand total footer */}
        {estimate.lineItems.length > 0 && (
          <View style={styles.footer}>
            <Pressable
              style={[styles.previewBtn, previewing && styles.previewBtnBusy]}
              onPress={previewPdf}
              disabled={previewing}
            >
              <Text style={styles.previewBtnText}>{previewing ? 'Building…' : 'Preview PDF quote'}</Text>
            </Pressable>
            <View style={styles.bdRow}><Text style={styles.bdLabel}>Materials</Text><Text style={styles.bdValue}>{formatMoney(priced.materialsTotalMinor, estimate.currency)}</Text></View>
            <View style={styles.bdRow}><Text style={styles.bdLabel}>Labour</Text><Text style={styles.bdValue}>{formatMoney(priced.laborTotalMinor, estimate.currency)}</Text></View>
            <View style={styles.bdRow}><Text style={styles.bdLabel}>Subtotal</Text><Text style={styles.bdValue}>{formatMoney(priced.subtotalMinor, estimate.currency)}</Text></View>
            <View style={styles.bdRow}><Text style={styles.bdLabel}>VAT ({estimate.vatRatePct}%)</Text><Text style={styles.bdValue}>{formatMoney(priced.vatAmountMinor, estimate.currency)}</Text></View>
            <View style={[styles.bdRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatMoney(priced.grandTotalMinor, estimate.currency)}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <MaterialPicker
        visible={pickerRoomId != null}
        materials={materials}
        currency={estimate.currency}
        onAdd={handleAddMaterial}
        onClose={() => setPickerRoomId(null)}
      />
      <LabourSheet
        visible={labourRoomId != null}
        hourlyRateMinor={estimate.hourlyRateMinor}
        currency={estimate.currency}
        onAdd={handleAddLabour}
        onClose={() => setLabourRoomId(null)}
      />
      <EditLineSheet
        line={editLine}
        hourlyRateMinor={estimate.hourlyRateMinor}
        currency={estimate.currency}
        onSave={handleSaveEdit}
        onClose={() => setEditLine(null)}
      />
      <PhotoMeasureSheet
        visible={measureRoomId != null}
        roomName={measureRoomId ? (locations.find((l) => l.id === measureRoomId)?.name ?? '') : ''}
        locationId={measureRoomId ?? ''}
        materials={materials}
        onAdd={handleAddMeasureLines}
        onClose={() => setMeasureRoomId(null)}
      />
      <PdfPreviewModal
        visible={previewHtml != null}
        html={previewHtml}
        onClose={() => setPreviewHtml(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  headerTitle: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  reviewBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  reviewBtnDisabled: { opacity: 0.35 },
  reviewBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 13 },
  scroll: { padding: space.lg, paddingBottom: space.xxl },

  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.lg, marginBottom: space.lg },
  rateLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  rateValue: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  rateEditRow: { flexDirection: 'row', alignItems: 'center' },
  rateCurrency: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  rateInput: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', minWidth: 60, paddingHorizontal: 4 },
  ratePerHr: { color: colors.textSecondary, fontSize: 15 },

  noRooms: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic', paddingVertical: space.sm },

  floorBlock: { marginBottom: space.lg },
  floorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  floorName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  floorTotal: { color: colors.textSecondary, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },

  roomCard: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginBottom: space.sm },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  roomName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  roomTotal: { color: colors.accent, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.hairline, gap: space.sm },
  lineMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  editHint: { color: colors.hairline, fontSize: 13, paddingHorizontal: space.xs },
  lineRowUnassigned: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, marginBottom: space.xs, borderTopWidth: 0 },
  lineDesc: { color: colors.textPrimary, fontSize: 14 },
  lineQty: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  lineAmt: { color: colors.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] },
  removeBtn: { paddingHorizontal: space.xs },
  removeText: { color: colors.textMuted, fontSize: 14 },

  roomActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  actionBtn: { flex: 1, backgroundColor: colors.ground, borderRadius: radius.tile, paddingVertical: space.sm, alignItems: 'center' },
  actionBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  cableEstBtn: { marginTop: space.xs, paddingVertical: space.xs + 2, alignItems: 'center', borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline },
  cableEstBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  footer: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.hairline },
  previewBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginBottom: space.lg },
  previewBtnBusy: { opacity: 0.6 },
  previewBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  bdLabel: { color: colors.textSecondary, fontSize: 15 },
  bdValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: 6, paddingTop: 12 },
  totalLabel: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  totalValue: { color: colors.accent, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
