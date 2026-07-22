/**
 * Voice-add modal — push-to-talk mic, live transcript, fuzzy item/project
 * matching, then a big glove-friendly Confirm/Cancel card before anything is
 * written. Writes go through addMaterialToProjectByVoice, which reuses the
 * same lineFromMaterial/addLine/saveProjectEstimate functions as the manual
 * MaterialPicker flow.
 *
 * Pass `lockedProjectId` when opened from inside a project (the quote
 * screen) to skip project resolution — the spoken "to the ... job" clause,
 * if any, is then ignored.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Currency, Material, Project } from '../../domain/types';
import { colors, space, radius } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import { parseVoiceCommand } from '../../voice/command-parser';
import { matchMaterials, matchProjects, type MaterialMatch, type ProjectMatch } from '../../voice/matcher';
import { useVoiceCommand } from '../../voice/useVoiceCommand';
import { addMaterialToProjectByVoice } from '../../voice/voice-write';

interface Props {
  visible: boolean;
  materials: Material[];
  /** Not needed when `lockedProjectId` is set. */
  projects?: Project[];
  currency: Currency;
  /** When set, skip project resolution and add straight to this project. */
  lockedProjectId?: string;
  lockedProjectName?: string;
  onAdded?: () => void;
  onClose: () => void;
}

type Step =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'project-pick'
  | 'item-pick'
  | 'manual-search'
  | 'confirm'
  | 'saving'
  | 'saved';

const CONFIDENT_SCORE = 0.25;

export function VoiceAddModal({
  visible, materials, projects = [], currency, lockedProjectId, lockedProjectName, onAdded, onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const voice = useVoiceCommand();

  const [step, setStep] = useState<Step>('idle');
  const [rawTranscript, setRawTranscript] = useState('');
  const [projectCandidates, setProjectCandidates] = useState<ProjectMatch[]>([]);
  const [itemCandidates, setItemCandidates] = useState<MaterialMatch[]>([]);
  const [manualQuery, setManualQuery] = useState('');
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null);
  const [resolvedProjectName, setResolvedProjectName] = useState<string>('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [amountText, setAmountText] = useState('1');

  // Reset everything each time the modal opens.
  useEffect(() => {
    if (visible) {
      setStep('idle');
      setRawTranscript('');
      setProjectCandidates([]);
      setItemCandidates([]);
      setManualQuery('');
      setResolvedProjectId(lockedProjectId ?? null);
      setResolvedProjectName(lockedProjectName ?? '');
      setSelectedMaterial(null);
      setAmountText('1');
      voice.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Process the final transcript once recognition finishes.
  useEffect(() => {
    if (voice.transcript && step === 'listening') {
      setRawTranscript(voice.transcript);
      setStep('processing');
      runPipeline(voice.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.transcript]);

  const runPipeline = (transcript: string) => {
    const parsed = parseVoiceCommand(transcript);

    if (lockedProjectId) {
      resolveItem(parsed.itemQuery, lockedProjectId, lockedProjectName ?? '', parsed.quantity, parsed.unit);
      return;
    }

    if (parsed.projectQuery) {
      const matches = matchProjects(parsed.projectQuery, projects, 3);
      if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
        resolveItem(parsed.itemQuery, matches[0].project.id, matches[0].project.name, parsed.quantity, parsed.unit);
        return;
      }
      if (matches.length > 0) {
        setProjectCandidates(matches);
        setItemCandidates([]);
        setStep('project-pick');
        pendingItem.current = { query: parsed.itemQuery, quantity: parsed.quantity, unit: parsed.unit };
        return;
      }
    }

    // No project named, or no fuzzy match — let the electrician pick from the full list.
    setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
    pendingItem.current = { query: parsed.itemQuery, quantity: parsed.quantity, unit: parsed.unit };
    setStep('project-pick');
  };

  // Holds the item query/quantity while we wait on a project pick.
  const pendingItem = React.useRef<{ query: string; quantity: number; unit?: 'm' | 'each' }>({ query: '', quantity: 1 });

  const resolveItem = (itemQuery: string, projectId: string, projectName: string, quantity: number, _unit?: 'm' | 'each') => {
    setResolvedProjectId(projectId);
    setResolvedProjectName(projectName);
    setAmountText(String(quantity));

    const matches = matchMaterials(itemQuery, materials, 3);
    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
      setSelectedMaterial(matches[0].material);
      setStep('confirm');
      return;
    }
    if (matches.length > 0) {
      setItemCandidates(matches);
      setStep('item-pick');
      return;
    }
    setManualQuery(itemQuery);
    setStep('manual-search');
  };

  const pickProject = (p: Project) => {
    resolveItem(pendingItem.current.query, p.id, p.name, pendingItem.current.quantity, pendingItem.current.unit);
  };

  const pickMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setStep('confirm');
  };

  const manualMatches = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q) return [];
    return materials
      .filter((m) => m.description.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
      .slice(0, 20);
  }, [manualQuery, materials]);

  const confirmAdd = async () => {
    if (!selectedMaterial || !resolvedProjectId) return;
    const n = parseFloat(amountText);
    const amount = Number.isFinite(n) && n > 0 ? n : 1;
    setStep('saving');
    try {
      await addMaterialToProjectByVoice(resolvedProjectId, selectedMaterial, amount);
      setStep('saved');
      onAdded?.();
      setTimeout(() => { backToIdle(); }, 900);
    } catch {
      setStep('confirm');
    }
  };

  const backToIdle = () => {
    setStep('idle');
    setRawTranscript('');
    setProjectCandidates([]);
    setItemCandidates([]);
    setManualQuery('');
    setSelectedMaterial(null);
    if (!lockedProjectId) setResolvedProjectId(null);
    voice.reset();
  };

  const startListening = async () => {
    setStep('listening');
    await voice.start();
  };

  const isMetres = selectedMaterial?.unit === 'm';
  const amountNum = parseFloat(amountText);
  const previewTotal = selectedMaterial && Number.isFinite(amountNum)
    ? Math.round(amountNum * selectedMaterial.unitCostMinor)
    : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Add by voice</Text>
            <Pressable onPress={onClose}><Text style={styles.done}>Done</Text></Pressable>
          </View>
          {lockedProjectName ? <Text style={styles.subtitle}>Adding to {lockedProjectName}</Text> : null}

          {(step === 'idle' || step === 'listening' || step === 'processing') && (
            <View style={styles.micArea}>
              {voice.error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage(voice.error)}</Text>
                </View>
              )}
              <Pressable
                style={[styles.micBtn, step === 'listening' && styles.micBtnActive]}
                onPress={startListening}
                disabled={step === 'processing'}
              >
                <Text style={styles.micGlyph}>{step === 'listening' ? '●' : '🎤'}</Text>
              </Pressable>
              <Text style={styles.micHint}>
                {step === 'listening' ? 'Listening… speak your command' : step === 'processing' ? 'Working it out…' : 'Tap to speak, e.g. "add 50 metres of 2.5mm twin and earth to the Smith job"'}
              </Text>
              {(voice.interimTranscript || rawTranscript) ? (
                <Text style={styles.transcript}>"{voice.interimTranscript || rawTranscript}"</Text>
              ) : null}
            </View>
          )}

          {step === 'project-pick' && (
            <View style={styles.pickArea}>
              <Text style={styles.pickLabel}>Which job?</Text>
              <ScrollView style={styles.pickList}>
                {projectCandidates.map(({ project }) => (
                  <Pressable key={project.id} style={styles.pickRow} onPress={() => pickProject(project)}>
                    <Text style={styles.pickRowTitle}>{project.name}</Text>
                    {project.clientName ? <Text style={styles.pickRowMeta}>{project.clientName}</Text> : null}
                  </Pressable>
                ))}
                {projectCandidates.length === 0 && (
                  <Text style={styles.empty}>No projects yet — create one first.</Text>
                )}
              </ScrollView>
              <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={[styles.cancelLinkText, { color: colors.danger }]}>Cancel</Text></Pressable>
            </View>
          )}

          {step === 'item-pick' && (
            <View style={styles.pickArea}>
              <Text style={styles.pickLabel}>Which item?</Text>
              <ScrollView style={styles.pickList}>
                {itemCandidates.map(({ material }) => (
                  <Pressable key={material.id} style={styles.pickRow} onPress={() => pickMaterial(material)}>
                    <Text style={styles.pickRowTitle}>{material.description}</Text>
                    <Text style={styles.pickRowMeta}>{material.sku} · {formatMoney(material.unitCostMinor, currency)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                style={styles.cancelLink}
                onPress={() => { setManualQuery(rawTranscript); setStep('manual-search'); }}
              >
                <Text style={styles.cancelLinkText}>None of these — search manually</Text>
              </Pressable>
            </View>
          )}

          {step === 'manual-search' && (
            <View style={styles.pickArea}>
              <Text style={styles.pickLabel}>Search for the item</Text>
              <TextInput
                value={manualQuery}
                onChangeText={setManualQuery}
                placeholder="Search by name or code"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
                autoFocus
              />
              <ScrollView style={styles.pickList}>
                {manualMatches.map((m) => (
                  <Pressable key={m.id} style={styles.pickRow} onPress={() => pickMaterial(m)}>
                    <Text style={styles.pickRowTitle}>{m.description}</Text>
                    <Text style={styles.pickRowMeta}>{m.sku} · {formatMoney(m.unitCostMinor, currency)}</Text>
                  </Pressable>
                ))}
                {manualQuery.trim() && manualMatches.length === 0 && (
                  <Text style={styles.empty}>No materials match "{manualQuery}".</Text>
                )}
              </ScrollView>
              <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={[styles.cancelLinkText, { color: colors.danger }]}>Cancel</Text></Pressable>
            </View>
          )}

          {step === 'confirm' && selectedMaterial && (
            <View style={styles.confirmArea}>
              <Text style={styles.confirmItem}>{selectedMaterial.description}</Text>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{isMetres ? 'Metres' : 'Quantity'}</Text>
                <TextInput
                  value={amountText}
                  onChangeText={(t) => setAmountText(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  style={styles.confirmInput}
                  selectTextOnFocus
                />
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Price</Text>
                <Text style={styles.confirmValue}>{formatMoney(previewTotal, currency)}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Job</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
              </View>

              <View style={styles.confirmActions}>
                <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmAdd}>
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 'saving' && (
            <View style={styles.micArea}><Text style={styles.micHint}>Adding…</Text></View>
          )}
          {step === 'saved' && (
            <View style={styles.micArea}><Text style={styles.savedText}>Added ✓</Text></View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function errorMessage(error: 'permission-denied' | 'no-speech' | 'other'): string {
  switch (error) {
    case 'permission-denied':
      return 'Microphone / speech permission denied. Enable it in phone Settings › Apps › SparkQuote, then try again.';
    case 'no-speech':
      return "Didn't catch that — tap the mic and try again.";
    default:
      return 'Speech recognition error — tap the mic to try again.';
  }
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  sheet: { minHeight: 260, backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2, marginBottom: space.sm },
  done: { fontSize: 16, fontWeight: '700', color: colors.accent },

  micArea: { alignItems: 'center', paddingVertical: space.lg, gap: space.sm },
  micBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: colors.danger },
  micGlyph: { fontSize: 30 },
  micHint: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: space.lg },
  transcript: { color: colors.textPrimary, fontSize: 16, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: space.lg },
  errorBox: { backgroundColor: colors.danger + '22', borderColor: colors.danger + '55', borderWidth: 1, borderRadius: radius.tile, padding: space.md },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' },

  pickArea: { paddingVertical: space.md, gap: space.sm },
  pickLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  pickList: { maxHeight: 320 },
  pickRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pickRowTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  pickRowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
  cancelLink: { alignSelf: 'center', paddingVertical: space.md },
  cancelLinkText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  search: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16, marginBottom: space.sm },

  confirmArea: { paddingVertical: space.lg, gap: space.md },
  confirmItem: { color: colors.textPrimary, fontSize: 19, fontWeight: '800' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md },
  confirmLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  confirmValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  confirmInput: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  confirmActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  bigBtn: { flex: 1, paddingVertical: space.lg, borderRadius: radius.tile, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelBtnText: { color: colors.danger, fontWeight: '800', fontSize: 17 },
  confirmBtn: { backgroundColor: colors.accent },
  confirmBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 17 },
  savedText: { color: colors.accent, fontWeight: '800', fontSize: 20 },
});
