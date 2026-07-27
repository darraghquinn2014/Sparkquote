/**
 * Minor Works Certificate — edit form + generate/sign/share.
 *
 * Field set follows the standard BS7671 Model Form 3 layout (see the caveat
 * on Certificate/MinorWorksFields in src/domain/types.ts — not yet reviewed
 * by a qualified electrician). "Generate certificate" saves the current form,
 * captures the installer's signature, renders the PDF, and shares it, mirroring
 * the existing estimate sign/PDF/share flow in app/review.tsx.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { getCertificate, updateCertificateFields, setCertificateStatus, deleteCertificate } from '@/src/data/certificate-repo';
import { loadProjects } from '@/src/data/project-repo';
import { loadBusinessProfile, readLogoDataUri } from '@/src/data/business-profile';
import { renderMinorWorksCertificateHtml } from '@/src/pdf/render-certificate';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import type { MinorWorksCertificate, SystemEarthing } from '@/src/domain/types';

const ACCENT = '#6B4C6E'; // plum — matches the certificates list screen

const EARTHING_OPTIONS: SystemEarthing[] = ['TN-S', 'TN-C-S', 'TT', 'Other'];

function numOrUndef(s: string): number | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export default function CertificateEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cert, setCert] = useState<MinorWorksCertificate | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const sigRef = React.useRef<SignatureViewRef>(null);

  // Form state — kept as strings for the numeric fields so TextInput binding
  // stays simple; converted at save time via numOrUndef.
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [descriptionOfWork, setDescriptionOfWork] = useState('');
  const [dateCompleted, setDateCompleted] = useState('');
  const [systemEarthing, setSystemEarthing] = useState<SystemEarthing | undefined>(undefined);
  const [protectiveDeviceType, setProtectiveDeviceType] = useState('');
  const [protectiveDeviceRatingA, setProtectiveDeviceRatingA] = useState('');
  const [existingInstallationComments, setExistingInstallationComments] = useState('');
  const [continuityOhms, setContinuityOhms] = useState('');
  const [insulationLN, setInsulationLN] = useState('');
  const [insulationLE, setInsulationLE] = useState('');
  const [insulationNE, setInsulationNE] = useState('');
  const [polaritySatisfactory, setPolaritySatisfactory] = useState<boolean | undefined>(undefined);
  const [zsOhms, setZsOhms] = useState('');
  const [rcdRatedMa, setRcdRatedMa] = useState('');
  const [rcdDisconnectionTimeMs, setRcdDisconnectionTimeMs] = useState('');
  const [comments, setComments] = useState('');
  const [signedByName, setSignedByName] = useState('');
  const [signedForCompany, setSignedForCompany] = useState('');
  const [nextInspectionYears, setNextInspectionYears] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [loaded, projects, profile] = await Promise.all([getCertificate(id), loadProjects(), loadBusinessProfile()]);
      if (!loaded || loaded.type !== 'minorWorks') { setLoading(false); return; }
      setCert(loaded);
      const project = projects.find((p) => p.id === loaded.projectId);
      setProjectName(project?.name ?? '');
      setProjectAddress(project?.address);
      const f = loaded.fields;
      // Prefill from the project record on a fresh draft only — never overwrite
      // an already-saved value, since the client name/address on a certificate
      // can legitimately differ from the project's (e.g. a tenant vs landlord).
      setClientName(f.clientName ?? project?.clientName ?? '');
      setClientAddress(f.clientAddress ?? project?.address ?? '');
      setDescriptionOfWork(f.descriptionOfWork ?? '');
      setDateCompleted(f.dateCompleted ?? '');
      setSystemEarthing(f.systemEarthing);
      setProtectiveDeviceType(f.protectiveDeviceType ?? '');
      setProtectiveDeviceRatingA(f.protectiveDeviceRatingA != null ? String(f.protectiveDeviceRatingA) : '');
      setExistingInstallationComments(f.existingInstallationComments ?? '');
      setContinuityOhms(f.testResults.continuityOhms != null ? String(f.testResults.continuityOhms) : '');
      setInsulationLN(f.testResults.insulationResistanceLNMOhms != null ? String(f.testResults.insulationResistanceLNMOhms) : '');
      setInsulationLE(f.testResults.insulationResistanceLEMOhms != null ? String(f.testResults.insulationResistanceLEMOhms) : '');
      setInsulationNE(f.testResults.insulationResistanceNEMOhms != null ? String(f.testResults.insulationResistanceNEMOhms) : '');
      setPolaritySatisfactory(f.testResults.polaritySatisfactory);
      setZsOhms(f.testResults.zsOhms != null ? String(f.testResults.zsOhms) : '');
      setRcdRatedMa(f.testResults.rcdRatedMa != null ? String(f.testResults.rcdRatedMa) : '');
      setRcdDisconnectionTimeMs(f.testResults.rcdDisconnectionTimeMs != null ? String(f.testResults.rcdDisconnectionTimeMs) : '');
      setComments(f.comments ?? '');
      setSignedByName(f.signedByName ?? '');
      setSignedForCompany(f.signedForCompany ?? profile.businessName ?? '');
      setNextInspectionYears(f.nextInspectionRecommendedYears != null ? String(f.nextInspectionRecommendedYears) : '');
      setLoading(false);
    })();
  }, [id]);

  const buildFields = () => ({
    clientName: clientName.trim() || undefined,
    clientAddress: clientAddress.trim() || undefined,
    descriptionOfWork: descriptionOfWork.trim(),
    dateCompleted: dateCompleted.trim() || undefined,
    systemEarthing,
    protectiveDeviceType: protectiveDeviceType.trim() || undefined,
    protectiveDeviceRatingA: numOrUndef(protectiveDeviceRatingA),
    existingInstallationComments: existingInstallationComments.trim() || undefined,
    testResults: {
      continuityOhms: numOrUndef(continuityOhms),
      insulationResistanceLNMOhms: numOrUndef(insulationLN),
      insulationResistanceLEMOhms: numOrUndef(insulationLE),
      insulationResistanceNEMOhms: numOrUndef(insulationNE),
      polaritySatisfactory,
      zsOhms: numOrUndef(zsOhms),
      rcdRatedMa: numOrUndef(rcdRatedMa),
      rcdDisconnectionTimeMs: numOrUndef(rcdDisconnectionTimeMs),
    },
    comments: comments.trim() || undefined,
    signedByName: signedByName.trim() || undefined,
    signedForCompany: signedForCompany.trim() || undefined,
    nextInspectionRecommendedYears: numOrUndef(nextInspectionYears),
  });

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateCertificateFields(id, buildFields());
      Alert.alert('Saved', 'Certificate details saved.');
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  const onGeneratePress = async () => {
    if (!descriptionOfWork.trim()) {
      Alert.alert('Description needed', 'Add a description of the minor works before generating the certificate.');
      return;
    }
    if (!id) return;
    setSaving(true);
    try {
      await updateCertificateFields(id, buildFields());
      setSignOpen(true);
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  const onSigned = async (signatureDataUri: string) => {
    if (!id || !cert) return;
    setSignOpen(false);
    setGenerating(true);
    try {
      const [profile, logoDataUri, fresh] = await Promise.all([
        loadBusinessProfile(),
        readLogoDataUri(),
        getCertificate(id),
      ]);
      if (!fresh || fresh.type !== 'minorWorks') throw new Error('Certificate not found');
      const html = renderMinorWorksCertificateHtml(
        fresh,
        {
          businessName: profile.businessName || undefined,
          logoDataUri: logoDataUri ?? undefined,
          projectName,
          projectAddress,
        },
        { dataUri: signatureDataUri, signedByName: fresh.fields.signedByName, signedDateIso: new Date().toISOString() },
      );
      const { uri } = await Print.printToFileAsync({ html });
      await setCertificateStatus(id, 'completed');
      setCert({ ...fresh, status: 'completed' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share certificate' });
      } else {
        Alert.alert('Certificate created', uri);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setGenerating(false);
    }
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert('Delete certificate?', 'This will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteCertificate(id); router.back(); } },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={ACCENT} style={{ marginTop: space.xxl }} /></SafeAreaView>;
  }
  if (!cert) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable></View>
        <Text style={styles.empty}>Certificate not found.</Text>
      </SafeAreaView>
    );
  }

  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; background: ${colors.surface}; }
    .m-signature-pad--body { border: 1px dashed ${colors.hairline}; }
    .m-signature-pad--footer { display: none; }
    body, html { background: ${colors.surface}; }
  `;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} numberOfLines={1}>{projectName || 'Project'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Minor Works Certificate</Text>
        </View>
        <Pressable onPress={confirmDelete} hitSlop={12}><Text style={styles.deleteLink}>Delete</Text></Pressable>
      </View>

      <View style={[styles.statusPill, cert.status === 'completed' ? styles.statusCompleted : styles.statusDraft, { marginHorizontal: space.lg }]}>
        <Text style={[styles.statusText, cert.status === 'completed' ? styles.statusTextCompleted : styles.statusTextDraft]}>
          {cert.status === 'completed' ? 'Completed' : 'Draft'}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">

          <Section title="Part 1 — Description of the minor works">
            <Field label="Client name" value={clientName} onChangeText={setClientName} placeholder="e.g. Jane Smith" />
            <Field label="Client address" value={clientAddress} onChangeText={setClientAddress} placeholder={projectAddress || 'Site address'} />
            <Field label="Description of the minor works" value={descriptionOfWork} onChangeText={setDescriptionOfWork} placeholder="e.g. Replaced socket outlet in kitchen" multiline />
            <Field label="Date completed" value={dateCompleted} onChangeText={setDateCompleted} placeholder="YYYY-MM-DD" />
          </Section>

          <Section title="Part 2 — Installation details">
            <Text style={styles.fieldLabel}>System earthing arrangement</Text>
            <View style={styles.chipRow}>
              {EARTHING_OPTIONS.map((opt) => (
                <Pressable key={opt} style={[styles.chip, systemEarthing === opt && styles.chipActive]} onPress={() => setSystemEarthing(systemEarthing === opt ? undefined : opt)}>
                  <Text style={[styles.chipText, systemEarthing === opt && styles.chipTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Protective device" value={protectiveDeviceType} onChangeText={setProtectiveDeviceType} placeholder="e.g. BS EN 60898 Type B" />
            <Field label="Protective device rating (A)" value={protectiveDeviceRatingA} onChangeText={setProtectiveDeviceRatingA} placeholder="e.g. 32" keyboardType="decimal-pad" />
            <Field label="Comments on existing installation" value={existingInstallationComments} onChangeText={setExistingInstallationComments} placeholder="Adequacy of earthing/bonding etc." multiline />
          </Section>

          <Section title="Part 3 — Essential tests">
            <Field label="Continuity of protective conductors (Ω)" value={continuityOhms} onChangeText={setContinuityOhms} keyboardType="decimal-pad" />
            <Field label="Insulation resistance — Line/Neutral (MΩ)" value={insulationLN} onChangeText={setInsulationLN} keyboardType="decimal-pad" />
            <Field label="Insulation resistance — Line/Earth (MΩ)" value={insulationLE} onChangeText={setInsulationLE} keyboardType="decimal-pad" />
            <Field label="Insulation resistance — Neutral/Earth (MΩ)" value={insulationNE} onChangeText={setInsulationNE} keyboardType="decimal-pad" />
            <Text style={styles.fieldLabel}>Polarity</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, polaritySatisfactory === true && styles.chipActive]} onPress={() => setPolaritySatisfactory(polaritySatisfactory === true ? undefined : true)}>
                <Text style={[styles.chipText, polaritySatisfactory === true && styles.chipTextActive]}>Satisfactory</Text>
              </Pressable>
              <Pressable style={[styles.chip, polaritySatisfactory === false && styles.chipActive]} onPress={() => setPolaritySatisfactory(polaritySatisfactory === false ? undefined : false)}>
                <Text style={[styles.chipText, polaritySatisfactory === false && styles.chipTextActive]}>Not satisfactory</Text>
              </Pressable>
            </View>
            <Field label="Earth fault loop impedance — Zs (Ω)" value={zsOhms} onChangeText={setZsOhms} keyboardType="decimal-pad" />
            <Field label="RCD rated residual operating current (mA)" value={rcdRatedMa} onChangeText={setRcdRatedMa} keyboardType="decimal-pad" />
            <Field label="RCD disconnection time (ms)" value={rcdDisconnectionTimeMs} onChangeText={setRcdDisconnectionTimeMs} keyboardType="decimal-pad" />
          </Section>

          <Section title="Comments">
            <Field label="Additional comments" value={comments} onChangeText={setComments} placeholder="Departures from BS 7671, limitations of the work, etc." multiline />
          </Section>

          <Section title="Part 4 — Declaration">
            <Field label="Name (person responsible for the work)" value={signedByName} onChangeText={setSignedByName} placeholder="Full name" />
            <Field label="For (company)" value={signedForCompany} onChangeText={setSignedForCompany} placeholder="Business name" />
            <Field label="Recommended next inspection (years)" value={nextInspectionYears} onChangeText={setNextInspectionYears} placeholder="e.g. 5" keyboardType="decimal-pad" />
          </Section>

          <Pressable style={[styles.saveBtn]} onPress={onSave} disabled={saving} hitSlop={8}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save details'}</Text>
          </Pressable>

          <Pressable style={styles.generateBtn} onPress={onGeneratePress} disabled={saving || generating} hitSlop={8}>
            <Text style={styles.generateBtnText}>{generating ? 'Generating…' : 'Generate certificate & sign'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={signOpen} animationType="slide" onRequestClose={() => setSignOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
          <View style={styles.sigHeader}>
            <Text style={styles.sigTitle}>Sign to complete</Text>
            <Text style={styles.sigHint}>Sign as the person responsible for this work.</Text>
          </View>
          <View style={styles.sigPad}>
            <SignatureScreen
              ref={sigRef}
              onOK={onSigned}
              webStyle={webStyle}
              autoClear={false}
              descriptionText=""
            />
          </View>
          <View style={styles.sigActions}>
            <Pressable style={[styles.sigBtn, styles.sigSecondary]} onPress={() => sigRef.current?.clearSignature()}>
              <Text style={styles.sigSecondaryText}>Clear</Text>
            </Pressable>
            <Pressable style={[styles.sigBtn, styles.sigSecondary]} onPress={() => setSignOpen(false)}>
              <Text style={[styles.sigSecondaryText, { color: colors.danger }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.sigBtn, styles.sigPrimary]} onPress={() => sigRef.current?.readSignature()}>
              <Text style={styles.sigPrimaryText}>Confirm &amp; generate</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {generating && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.busyText}>Generating certificate…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType,
}: {
  label: string; value: string; onChangeText: (s: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: 'decimal-pad';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.inputMultiline]}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  subtitle: { color: ACCENT, fontSize: 11, fontWeight: '700', marginTop: 1 },
  deleteLink: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5, marginBottom: space.sm },
  statusDraft: { backgroundColor: colors.surfacePressed },
  statusCompleted: { backgroundColor: '#06D6A01A' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextDraft: { color: colors.textMuted },
  statusTextCompleted: { color: '#06D6A0' },
  section: { backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline, padding: space.md, marginBottom: space.md },
  sectionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldWrap: { marginBottom: space.sm },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 14 },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: space.md, paddingVertical: space.sm },
  chipActive: { backgroundColor: `${ACCENT}22`, borderColor: ACCENT },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: ACCENT },
  saveBtn: { borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', borderWidth: 1, borderColor: colors.hairline, marginBottom: space.sm },
  saveBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  generateBtn: { borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', backgroundColor: ACCENT },
  generateBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,16,30,0.88)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  busyText: { color: '#fff', fontWeight: '700' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
  sigHeader: { padding: space.lg, gap: space.xs },
  sigTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  sigHint: { fontSize: 13, color: colors.textMuted },
  sigPad: { flex: 1, margin: space.lg, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.surface },
  sigActions: { flexDirection: 'row', gap: space.sm, padding: space.lg },
  sigBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.bar, alignItems: 'center' },
  sigSecondary: { backgroundColor: colors.surface },
  sigSecondaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  sigPrimary: { backgroundColor: ACCENT, flex: 1.4 },
  sigPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
