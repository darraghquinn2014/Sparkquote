/**
 * CableEstimatorSheet — bottom sheet for estimating cable runs from room dimensions.
 *
 * Calculates 2.5mm T+E (ring main) and 1.5mm T+E (lighting) cable quantities.
 * If those materials exist in the catalogue, their price is used. If not, the
 * lines are added at £0 with a note — the electrician can correct later or
 * import a price list.
 *
 * To remove this feature: delete this file + cable-calc.ts, and remove the
 * "~ Estimate cable" button from project/quote/[id].tsx. ~30 min of work.
 */
import React, { useState, useMemo } from 'react';
import {
  Modal, Pressable, Text, TextInput, View, StyleSheet, ScrollView, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius } from '../theme/tokens';
import { calcCableRuns, type CircuitType, type RoomDimensions } from '../../domain/cable-calc';
import { lineFromMaterial } from '../../data/estimate-service';
import type { LineItem, Material } from '../../domain/types';

interface Props {
  visible: boolean;
  roomName: string;
  locationId: string;
  materials: Material[];
  onAdd: (lines: LineItem[]) => void;
  onClose: () => void;
}

function findCable(materials: Material[], spec: '2.5mm T+E' | '1.5mm T+E'): Material | undefined {
  const key = spec.split(' ')[0].toLowerCase(); // '2.5mm' or '1.5mm'
  return materials.find((m) => m.unit === 'm' && m.description.toLowerCase().includes(key));
}

export function CableEstimatorSheet({ visible, roomName, locationId, materials, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [lengthText, setLengthText] = useState('');
  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('2.4');
  const [cuText, setCuText] = useState('');
  const [ring, setRing] = useState(true);
  const [lighting, setLighting] = useState(true);
  const [buffer, setBuffer] = useState(true);

  const L = parseFloat(lengthText);
  const W = parseFloat(widthText);
  const H = parseFloat(heightText) || 2.4;
  const CU = parseFloat(cuText) || 0;
  const dimsValid = Number.isFinite(L) && L > 0 && Number.isFinite(W) && W > 0;

  const circuits = useMemo((): ReadonlySet<CircuitType> => {
    const s = new Set<CircuitType>();
    if (ring) s.add('ring');
    if (lighting) s.add('lighting');
    return s;
  }, [ring, lighting]);

  const runs = useMemo(() => {
    if (!dimsValid || circuits.size === 0) return [];
    const dims: RoomDimensions = { lengthM: L, widthM: W, heightM: H, cuDistanceM: CU };
    return calcCableRuns(dims, circuits, buffer ? 10 : 0);
  }, [dimsValid, L, W, H, CU, circuits, buffer]);

  const canAdd = runs.length > 0;
  const hasMissingPrices = runs.some((r) => !findCable(materials, r.cableSpec));

  const handleAdd = () => {
    if (!canAdd) return;
    const lines: LineItem[] = runs.map((run) => {
      const mat = findCable(materials, run.cableSpec);
      if (mat) {
        return {
          ...lineFromMaterial(mat, run.metres),
          description: run.description,
          locationId,
        };
      }
      return {
        id: `cable_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        description: run.description,
        resolvedMaterialCostMinor: 0,
        laborBaseHours: 0,
        quantityMeters: run.metres,
        locationId,
        appliedLaborToggleIds: [],
      };
    });
    onAdd(lines);
    // Reset dims on confirm so next room starts fresh
    setLengthText('');
    setWidthText('');
    setHeightText('2.4');
    setCuText('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Estimate cable</Text>
          {roomName ? <Text style={styles.sub}>{roomName}</Text> : null}

          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Dimensions */}
            <Text style={styles.sectionLabel}>ROOM DIMENSIONS</Text>

            <View style={styles.dimRow}>
              <View style={styles.dimGroup}>
                <Text style={styles.dimLabel}>Length (m)</Text>
                <TextInput
                  value={lengthText}
                  onChangeText={setLengthText}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 4.5"
                  placeholderTextColor={colors.textMuted}
                  style={styles.dimInput}
                  selectTextOnFocus
                />
              </View>
              <View style={styles.dimGroup}>
                <Text style={styles.dimLabel}>Width (m)</Text>
                <TextInput
                  value={widthText}
                  onChangeText={setWidthText}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 3.2"
                  placeholderTextColor={colors.textMuted}
                  style={styles.dimInput}
                  selectTextOnFocus
                />
              </View>
            </View>

            <View style={styles.dimRow}>
              <View style={styles.dimGroup}>
                <Text style={styles.dimLabel}>Height (m)</Text>
                <TextInput
                  value={heightText}
                  onChangeText={setHeightText}
                  keyboardType="decimal-pad"
                  placeholder="2.4"
                  placeholderTextColor={colors.textMuted}
                  style={styles.dimInput}
                  selectTextOnFocus
                />
              </View>
              <View style={styles.dimGroup}>
                <Text style={styles.dimLabel}>CU distance (m)</Text>
                <TextInput
                  value={cuText}
                  onChangeText={setCuText}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  style={styles.dimInput}
                  selectTextOnFocus
                />
              </View>
            </View>

            <Text style={styles.hint}>CU = distance from fuse board to this room. Leave 0 if unsure.</Text>

            {/* Circuit toggles */}
            <Text style={[styles.sectionLabel, { marginTop: space.lg }]}>CIRCUITS</Text>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Ring main sockets</Text>
                <Text style={styles.toggleHint}>2.5mm T+E  ·  perimeter run</Text>
              </View>
              <Switch
                value={ring}
                onValueChange={setRing}
                trackColor={{ true: colors.accent, false: colors.hairline }}
                thumbColor={colors.textPrimary}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Lighting circuit</Text>
                <Text style={styles.toggleHint}>1.5mm T+E  ·  ceiling run + switch drops</Text>
              </View>
              <Switch
                value={lighting}
                onValueChange={setLighting}
                trackColor={{ true: colors.accent, false: colors.hairline }}
                thumbColor={colors.textPrimary}
              />
            </View>

            <View style={[styles.toggleRow, { marginTop: space.xs }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>+10% safety buffer</Text>
                <Text style={styles.toggleHint}>Extra margin for routing and offcuts</Text>
              </View>
              <Switch
                value={buffer}
                onValueChange={setBuffer}
                trackColor={{ true: colors.accent, false: colors.hairline }}
                thumbColor={colors.textPrimary}
              />
            </View>

            {/* Preview */}
            {dimsValid && runs.length > 0 && (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>ESTIMATE</Text>
                {runs.map((run) => (
                  <View key={run.cableSpec} style={styles.previewRow}>
                    <Text style={styles.previewDesc}>{run.description}</Text>
                    <Text style={styles.previewMetres}>{run.metres} m</Text>
                  </View>
                ))}
                {hasMissingPrices && (
                  <Text style={styles.noPriceNote}>
                    No cable price found in catalogue — items added at £0. Import a price list to get material costs.
                  </Text>
                )}
              </View>
            )}

            {!dimsValid && (
              <Text style={styles.emptyHint}>Enter room length and width above to see the estimate.</Text>
            )}

            {dimsValid && circuits.size === 0 && (
              <Text style={styles.emptyHint}>Enable at least one circuit type above.</Text>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.addBtn, !canAdd && styles.addBtnDisabled]}
                onPress={handleAdd}
                disabled={!canAdd}
              >
                <Text style={styles.addText}>
                  Add {runs.length} {runs.length === 1 ? 'line' : 'lines'} to room
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.ground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  sub: { color: colors.textMuted, fontSize: 13, marginBottom: space.md },
  scrollContent: { paddingTop: space.sm },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2, marginBottom: space.sm },
  dimRow: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  dimGroup: { flex: 1 },
  dimLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: space.xs },
  dimInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    marginBottom: space.xs,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  toggleHint: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  preview: { backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.md, marginTop: space.lg },
  previewLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1.2, marginBottom: space.sm },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  previewDesc: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  previewMetres: { color: colors.accent, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  noPriceNote: { color: colors.textMuted, fontSize: 11, marginTop: space.sm, fontStyle: 'italic', lineHeight: 16 },

  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: space.xl },

  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  actionBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  addBtn: { backgroundColor: colors.accent },
  addBtnDisabled: { opacity: 0.4 },
  addText: { color: colors.accentInk, fontWeight: '800', fontSize: 14 },
});
