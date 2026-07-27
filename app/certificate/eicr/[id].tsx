/**
 * EICR (Electrical Installation Condition Report) — edit form + generate/sign/share.
 *
 * Third and last of the three certificate types (Minor Works -> EIC -> EICR).
 * Reuses the same circuit-card repeatable pattern as the EIC screen for the
 * Schedule of Test Results (identical shape — an EICR tests the same
 * installation characteristics an EIC would certify). The observations list
 * (C1/C2/C3/FI) is new and is the single highest-stakes part of this whole
 * feature — see the caveat on EicrFields in src/domain/types.ts.
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
import { renderEicrCertificateHtml } from '@/src/pdf/render-eicr-certificate';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import type { EicrCertificate, EicCircuit, EicrObservation, EicrReportReason, ObservationCode, SystemEarthing } from '@/src/domain/types';

const ACCENT = '#6B4C6E'; // plum — matches the certificates list screen

const EARTHING_OPTIONS: SystemEarthing[] = ['TN-S', 'TN-C-S', 'TT', 'Other'];
const REASON_OPTIONS: { value: EicrReportReason; label: string }[] = [
  { value: 'periodic', label: 'Periodic/routine' },
  { value: 'changeOfOccupancy', label: 'Change of occupancy' },
  { value: 'preSaleOrPurchase', label: 'Pre-sale/purchase' },
  { value: 'other', label: 'Other' },
];
const CODE_OPTIONS: ObservationCode[] = ['C1', 'C2', 'C3', 'FI'];
const CODE_COLOR: Record<ObservationCode, string> = {
  C1: '#C62828', C2: '#E65100', C3: '#F9A825', FI: '#1565C0',
};
const CODE_MEANING: Record<ObservationCode, string> = {
  C1: 'Danger present', C2: 'Potentially dangerous', C3: 'Improvement recommended', FI: 'Further investigation required',
};

function numOrUndef(s: string): number | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Circuit fields edited as strings (TextInput binding); converted to
// EicCircuit's number|undefined fields via numOrUndef at save/generate time —
// same approach as the EIC screen's circuit schedule.
interface CircuitDraft {
  id: string;
  circuitNumber: string;
  description: string;
  wiringType: string;
  csaLineMm2: string;
  csaCpcMm2: string;
  protectiveDeviceType: string;
  protectiveDeviceRatingA: string;
  maxPermittedZsOhms: string;
  continuityOhms: string;
  insulationResistanceMOhms: string;
  polaritySatisfactory: boolean | undefined;
  measuredZsOhms: string;
  rcdRatedMa: string;
  rcdDisconnectionTimeMs: string;
}

function blankCircuitDraft(): CircuitDraft {
  return {
    id: genId(), circuitNumber: '', description: '', wiringType: '',
    csaLineMm2: '', csaCpcMm2: '', protectiveDeviceType: '', protectiveDeviceRatingA: '',
    maxPermittedZsOhms: '', continuityOhms: '', insulationResistanceMOhms: '',
    polaritySatisfactory: undefined, measuredZsOhms: '', rcdRatedMa: '', rcdDisconnectionTimeMs: '',
  };
}

function circuitDraftFrom(c: EicCircuit): CircuitDraft {
  return {
    id: c.id,
    circuitNumber: c.circuitNumber ?? '',
    description: c.description ?? '',
    wiringType: c.wiringType ?? '',
    csaLineMm2: c.csaLineMm2 != null ? String(c.csaLineMm2) : '',
    csaCpcMm2: c.csaCpcMm2 != null ? String(c.csaCpcMm2) : '',
    protectiveDeviceType: c.protectiveDeviceType ?? '',
    protectiveDeviceRatingA: c.protectiveDeviceRatingA != null ? String(c.protectiveDeviceRatingA) : '',
    maxPermittedZsOhms: c.maxPermittedZsOhms != null ? String(c.maxPermittedZsOhms) : '',
    continuityOhms: c.continuityOhms != null ? String(c.continuityOhms) : '',
    insulationResistanceMOhms: c.insulationResistanceMOhms != null ? String(c.insulationResistanceMOhms) : '',
    polaritySatisfactory: c.polaritySatisfactory,
    measuredZsOhms: c.measuredZsOhms != null ? String(c.measuredZsOhms) : '',
    rcdRatedMa: c.rcdRatedMa != null ? String(c.rcdRatedMa) : '',
    rcdDisconnectionTimeMs: c.rcdDisconnectionTimeMs != null ? String(c.rcdDisconnectionTimeMs) : '',
  };
}

function circuitFromDraft(d: CircuitDraft): EicCircuit {
  return {
    id: d.id,
    circuitNumber: d.circuitNumber.trim() || undefined,
    description: d.description.trim(),
    wiringType: d.wiringType.trim() || undefined,
    csaLineMm2: numOrUndef(d.csaLineMm2),
    csaCpcMm2: numOrUndef(d.csaCpcMm2),
    protectiveDeviceType: d.protectiveDeviceType.trim() || undefined,
    protectiveDeviceRatingA: numOrUndef(d.protectiveDeviceRatingA),
    maxPermittedZsOhms: numOrUndef(d.maxPermittedZsOhms),
    continuityOhms: numOrUndef(d.continuityOhms),
    insulationResistanceMOhms: numOrUndef(d.insulationResistanceMOhms),
    polaritySatisfactory: d.polaritySatisfactory,
    measuredZsOhms: numOrUndef(d.measuredZsOhms),
    rcdRatedMa: numOrUndef(d.rcdRatedMa),
    rcdDisconnectionTimeMs: numOrUndef(d.rcdDisconnectionTimeMs),
  };
}

function blankObservation(): EicrObservation {
  return { id: genId(), itemNumber: '', description: '', code: 'C3' };
}

export default function EicrEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cert, setCert] = useState<EicrCertificate | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const sigRef = React.useRef<SignatureViewRef>(null);

  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [installationAddress, setInstallationAddress] = useState('');
  const [reasonForReport, setReasonForReport] = useState<EicrReportReason | undefined>(undefined);
  const [estimatedAgeYears, setEstimatedAgeYears] = useState('');
  const [evidenceOfAlterations, setEvidenceOfAlterations] = useState<boolean | undefined>(undefined);
  const [dateOfLastInspection, setDateOfLastInspection] = useState('');
  const [extentAndLimitations, setExtentAndLimitations] = useState('');

  const [systemEarthing, setSystemEarthing] = useState<SystemEarthing | undefined>(undefined);
  const [liveConductors, setLiveConductors] = useState('');
  const [nominalVoltageV, setNominalVoltageV] = useState('');
  const [nominalFrequencyHz, setNominalFrequencyHz] = useState('');
  const [prospectiveFaultCurrentKa, setProspectiveFaultCurrentKa] = useState('');
  const [externalLoopImpedanceZeOhms, setExternalLoopImpedanceZeOhms] = useState('');
  const [supplyProtectiveDeviceType, setSupplyProtectiveDeviceType] = useState('');
  const [supplyProtectiveDeviceRatingA, setSupplyProtectiveDeviceRatingA] = useState('');

  const [meansOfEarthing, setMeansOfEarthing] = useState('');
  const [maximumDemandA, setMaximumDemandA] = useState('');
  const [mainSwitchType, setMainSwitchType] = useState('');
  const [mainSwitchRatingA, setMainSwitchRatingA] = useState('');
  const [earthingConductorCsaMm2, setEarthingConductorCsaMm2] = useState('');
  const [mainBondingConductorsCsaMm2, setMainBondingConductorsCsaMm2] = useState('');

  const [circuits, setCircuits] = useState<CircuitDraft[]>([]);
  const [observations, setObservations] = useState<EicrObservation[]>([]);

  const [generalCondition, setGeneralCondition] = useState('');
  const [overallAssessment, setOverallAssessment] = useState<'satisfactory' | 'unsatisfactory' | undefined>(undefined);
  const [comments, setComments] = useState('');
  const [signedByName, setSignedByName] = useState('');
  const [signedForCompany, setSignedForCompany] = useState('');
  const [nextInspectionYears, setNextInspectionYears] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [loaded, projects, profile] = await Promise.all([getCertificate(id), loadProjects(), loadBusinessProfile()]);
      if (!loaded || loaded.type !== 'eicr') { setLoading(false); return; }
      setCert(loaded);
      const project = projects.find((p) => p.id === loaded.projectId);
      setProjectName(project?.name ?? '');
      setProjectAddress(project?.address);
      const f = loaded.fields;

      setClientName(f.clientName ?? project?.clientName ?? '');
      setClientAddress(f.clientAddress ?? project?.address ?? '');
      setInstallationAddress(f.installationAddress ?? '');
      setReasonForReport(f.reasonForReport);
      setEstimatedAgeYears(f.estimatedAgeYears != null ? String(f.estimatedAgeYears) : '');
      setEvidenceOfAlterations(f.evidenceOfAlterations);
      setDateOfLastInspection(f.dateOfLastInspection ?? '');
      setExtentAndLimitations(f.extentAndLimitations ?? '');

      setSystemEarthing(f.supply.systemEarthing);
      setLiveConductors(f.supply.numberAndTypeOfLiveConductors ?? '');
      setNominalVoltageV(f.supply.nominalVoltageV != null ? String(f.supply.nominalVoltageV) : '');
      setNominalFrequencyHz(f.supply.nominalFrequencyHz != null ? String(f.supply.nominalFrequencyHz) : '');
      setProspectiveFaultCurrentKa(f.supply.prospectiveFaultCurrentKa != null ? String(f.supply.prospectiveFaultCurrentKa) : '');
      setExternalLoopImpedanceZeOhms(f.supply.externalLoopImpedanceZeOhms != null ? String(f.supply.externalLoopImpedanceZeOhms) : '');
      setSupplyProtectiveDeviceType(f.supply.supplyProtectiveDeviceType ?? '');
      setSupplyProtectiveDeviceRatingA(f.supply.supplyProtectiveDeviceRatingA != null ? String(f.supply.supplyProtectiveDeviceRatingA) : '');

      setMeansOfEarthing(f.origin.meansOfEarthing ?? '');
      setMaximumDemandA(f.origin.maximumDemandA != null ? String(f.origin.maximumDemandA) : '');
      setMainSwitchType(f.origin.mainSwitchType ?? '');
      setMainSwitchRatingA(f.origin.mainSwitchRatingA != null ? String(f.origin.mainSwitchRatingA) : '');
      setEarthingConductorCsaMm2(f.origin.earthingConductorCsaMm2 != null ? String(f.origin.earthingConductorCsaMm2) : '');
      setMainBondingConductorsCsaMm2(f.origin.mainBondingConductorsCsaMm2 != null ? String(f.origin.mainBondingConductorsCsaMm2) : '');

      setCircuits(f.circuits.map(circuitDraftFrom));
      setObservations(f.observations);

      setGeneralCondition(f.generalCondition ?? '');
      setOverallAssessment(f.overallAssessment);
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
    installationAddress: installationAddress.trim() || undefined,
    reasonForReport,
    estimatedAgeYears: numOrUndef(estimatedAgeYears),
    evidenceOfAlterations,
    dateOfLastInspection: dateOfLastInspection.trim() || undefined,
    extentAndLimitations: extentAndLimitations.trim() || undefined,
    supply: {
      systemEarthing,
      numberAndTypeOfLiveConductors: liveConductors.trim() || undefined,
      nominalVoltageV: numOrUndef(nominalVoltageV),
      nominalFrequencyHz: numOrUndef(nominalFrequencyHz),
      prospectiveFaultCurrentKa: numOrUndef(prospectiveFaultCurrentKa),
      externalLoopImpedanceZeOhms: numOrUndef(externalLoopImpedanceZeOhms),
      supplyProtectiveDeviceType: supplyProtectiveDeviceType.trim() || undefined,
      supplyProtectiveDeviceRatingA: numOrUndef(supplyProtectiveDeviceRatingA),
    },
    origin: {
      meansOfEarthing: meansOfEarthing.trim() || undefined,
      maximumDemandA: numOrUndef(maximumDemandA),
      mainSwitchType: mainSwitchType.trim() || undefined,
      mainSwitchRatingA: numOrUndef(mainSwitchRatingA),
      earthingConductorCsaMm2: numOrUndef(earthingConductorCsaMm2),
      mainBondingConductorsCsaMm2: numOrUndef(mainBondingConductorsCsaMm2),
    },
    circuits: circuits.map(circuitFromDraft),
    observations,
    generalCondition: generalCondition.trim() || undefined,
    overallAssessment,
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
      Alert.alert('Saved', 'Report details saved.');
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  const onGeneratePress = async () => {
    if (!overallAssessment) {
      Alert.alert('Overall assessment needed', 'Mark the installation Satisfactory or Unsatisfactory before generating the report.');
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
      if (!fresh || fresh.type !== 'eicr') throw new Error('Certificate not found');
      const html = renderEicrCertificateHtml(
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
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share report' });
      } else {
        Alert.alert('Report created', uri);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setGenerating(false);
    }
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert('Delete report?', 'This will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteCertificate(id); router.back(); } },
    ]);
  };

  const addCircuit = () => setCircuits((cs) => [...cs, blankCircuitDraft()]);
  const removeCircuit = (circuitId: string) => setCircuits((cs) => cs.filter((c) => c.id !== circuitId));
  const patchCircuit = (circuitId: string, patch: Partial<CircuitDraft>) =>
    setCircuits((cs) => cs.map((c) => (c.id === circuitId ? { ...c, ...patch } : c)));

  const addObservation = () => setObservations((os) => [...os, blankObservation()]);
  const removeObservation = (obsId: string) => setObservations((os) => os.filter((o) => o.id !== obsId));
  const patchObservation = (obsId: string, patch: Partial<EicrObservation>) =>
    setObservations((os) => os.map((o) => (o.id === obsId ? { ...o, ...patch } : o)));

  const hasC1OrC2 = observations.some((o) => o.code === 'C1' || o.code === 'C2');
  const assessmentMismatch = hasC1OrC2 && overallAssessment === 'satisfactory';

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={ACCENT} style={{ marginTop: space.xxl }} /></SafeAreaView>;
  }
  if (!cert) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable></View>
        <Text style={styles.empty}>Report not found.</Text>
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
          <Text style={styles.subtitle} numberOfLines={1}>Electrical Installation Condition Report</Text>
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

          <Section title="Client & installation">
            <Field label="Client name" value={clientName} onChangeText={setClientName} placeholder="e.g. Jane Smith" />
            <Field label="Client address" value={clientAddress} onChangeText={setClientAddress} placeholder={projectAddress || 'Site address'} />
            <Field label="Installation address (if different)" value={installationAddress} onChangeText={setInstallationAddress} />
            <Text style={styles.fieldLabel}>Reason for this report</Text>
            <View style={styles.chipRow}>
              {REASON_OPTIONS.map((opt) => (
                <Pressable key={opt.value} style={[styles.chip, reasonForReport === opt.value && styles.chipActive]} onPress={() => setReasonForReport(reasonForReport === opt.value ? undefined : opt.value)}>
                  <Text style={[styles.chipText, reasonForReport === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row2}>
              <Field label="Estimated age (years)" value={estimatedAgeYears} onChangeText={setEstimatedAgeYears} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Date of last inspection" value={dateOfLastInspection} onChangeText={setDateOfLastInspection} placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
            </View>
            <Text style={styles.fieldLabel}>Evidence of alterations</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, evidenceOfAlterations === true && styles.chipActive]} onPress={() => setEvidenceOfAlterations(evidenceOfAlterations === true ? undefined : true)}>
                <Text style={[styles.chipText, evidenceOfAlterations === true && styles.chipTextActive]}>Yes</Text>
              </Pressable>
              <Pressable style={[styles.chip, evidenceOfAlterations === false && styles.chipActive]} onPress={() => setEvidenceOfAlterations(evidenceOfAlterations === false ? undefined : false)}>
                <Text style={[styles.chipText, evidenceOfAlterations === false && styles.chipTextActive]}>No</Text>
              </Pressable>
            </View>
            <Field label="Extent and limitations of inspection" value={extentAndLimitations} onChangeText={setExtentAndLimitations} placeholder="What was inspected/tested, and any agreed or operational limitations" multiline />
          </Section>

          <Section title="Supply characteristics">
            <Text style={styles.fieldLabel}>System earthing arrangement</Text>
            <View style={styles.chipRow}>
              {EARTHING_OPTIONS.map((opt) => (
                <Pressable key={opt} style={[styles.chip, systemEarthing === opt && styles.chipActive]} onPress={() => setSystemEarthing(systemEarthing === opt ? undefined : opt)}>
                  <Text style={[styles.chipText, systemEarthing === opt && styles.chipTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Live conductors" value={liveConductors} onChangeText={setLiveConductors} placeholder="e.g. 1-phase, 2-wire" />
            <View style={styles.row2}>
              <Field label="Nominal voltage (V)" value={nominalVoltageV} onChangeText={setNominalVoltageV} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Frequency (Hz)" value={nominalFrequencyHz} onChangeText={setNominalFrequencyHz} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <Field label="Prospective fault current (kA)" value={prospectiveFaultCurrentKa} onChangeText={setProspectiveFaultCurrentKa} keyboardType="decimal-pad" />
            <Field label="External loop impedance — Ze (Ω)" value={externalLoopImpedanceZeOhms} onChangeText={setExternalLoopImpedanceZeOhms} keyboardType="decimal-pad" />
            <Field label="Supply protective device" value={supplyProtectiveDeviceType} onChangeText={setSupplyProtectiveDeviceType} placeholder="e.g. BS 1361 fuse" />
            <Field label="Supply protective device rating (A)" value={supplyProtectiveDeviceRatingA} onChangeText={setSupplyProtectiveDeviceRatingA} keyboardType="decimal-pad" />
          </Section>

          <Section title="Origin of installation">
            <Field label="Means of earthing" value={meansOfEarthing} onChangeText={setMeansOfEarthing} />
            <Field label="Maximum demand (A)" value={maximumDemandA} onChangeText={setMaximumDemandA} keyboardType="decimal-pad" />
            <Field label="Main switch" value={mainSwitchType} onChangeText={setMainSwitchType} placeholder="e.g. 100A DP switch" />
            <Field label="Main switch rating (A)" value={mainSwitchRatingA} onChangeText={setMainSwitchRatingA} keyboardType="decimal-pad" />
            <Field label="Earthing conductor CSA (mm²)" value={earthingConductorCsaMm2} onChangeText={setEarthingConductorCsaMm2} keyboardType="decimal-pad" />
            <Field label="Main bonding conductors CSA (mm²)" value={mainBondingConductorsCsaMm2} onChangeText={setMainBondingConductorsCsaMm2} keyboardType="decimal-pad" />
          </Section>

          <View style={styles.circuitsHeader}>
            <Text style={styles.sectionTitle}>Schedule of test results</Text>
            <Pressable onPress={addCircuit} hitSlop={8}><Text style={styles.addLink}>+ Add circuit</Text></Pressable>
          </View>
          {circuits.length === 0 && <Text style={styles.noItems}>No circuits yet. Add one per circuit tested.</Text>}
          {circuits.map((c, i) => (
            <View key={c.id} style={styles.itemCard}>
              <View style={styles.itemCardHeader}>
                <Text style={styles.itemCardTitle}>Circuit {c.circuitNumber || i + 1}</Text>
                <Pressable onPress={() => removeCircuit(c.id)} hitSlop={8}><Text style={styles.removeLink}>Remove</Text></Pressable>
              </View>
              <View style={styles.row2}>
                <Field label="Circuit no." value={c.circuitNumber} onChangeText={(v) => patchCircuit(c.id, { circuitNumber: v })} placeholder={String(i + 1)} style={{ flex: 1 }} />
                <Field label="Description" value={c.description} onChangeText={(v) => patchCircuit(c.id, { description: v })} placeholder="e.g. Kitchen sockets" style={{ flex: 2 }} />
              </View>
              <Field label="Wiring type" value={c.wiringType} onChangeText={(v) => patchCircuit(c.id, { wiringType: v })} placeholder="e.g. PVC/PVC T&E" />
              <View style={styles.row2}>
                <Field label="CSA Line (mm²)" value={c.csaLineMm2} onChangeText={(v) => patchCircuit(c.id, { csaLineMm2: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Field label="CSA CPC (mm²)" value={c.csaCpcMm2} onChangeText={(v) => patchCircuit(c.id, { csaCpcMm2: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
              <View style={styles.row2}>
                <Field label="Protective device" value={c.protectiveDeviceType} onChangeText={(v) => patchCircuit(c.id, { protectiveDeviceType: v })} placeholder="e.g. Type B" style={{ flex: 2 }} />
                <Field label="Rating (A)" value={c.protectiveDeviceRatingA} onChangeText={(v) => patchCircuit(c.id, { protectiveDeviceRatingA: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
              <Field label="Max permitted Zs (Ω)" value={c.maxPermittedZsOhms} onChangeText={(v) => patchCircuit(c.id, { maxPermittedZsOhms: v })} keyboardType="decimal-pad" />
              <View style={styles.row2}>
                <Field label="Continuity R1+R2/R2 (Ω)" value={c.continuityOhms} onChangeText={(v) => patchCircuit(c.id, { continuityOhms: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Field label="Insulation resistance (MΩ)" value={c.insulationResistanceMOhms} onChangeText={(v) => patchCircuit(c.id, { insulationResistanceMOhms: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
              <Text style={styles.fieldLabel}>Polarity</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, c.polaritySatisfactory === true && styles.chipActive]} onPress={() => patchCircuit(c.id, { polaritySatisfactory: c.polaritySatisfactory === true ? undefined : true })}>
                  <Text style={[styles.chipText, c.polaritySatisfactory === true && styles.chipTextActive]}>Satisfactory</Text>
                </Pressable>
                <Pressable style={[styles.chip, c.polaritySatisfactory === false && styles.chipActive]} onPress={() => patchCircuit(c.id, { polaritySatisfactory: c.polaritySatisfactory === false ? undefined : false })}>
                  <Text style={[styles.chipText, c.polaritySatisfactory === false && styles.chipTextActive]}>Not satisfactory</Text>
                </Pressable>
              </View>
              <Field label="Measured Zs (Ω)" value={c.measuredZsOhms} onChangeText={(v) => patchCircuit(c.id, { measuredZsOhms: v })} keyboardType="decimal-pad" />
              <View style={styles.row2}>
                <Field label="RCD Iδn (mA)" value={c.rcdRatedMa} onChangeText={(v) => patchCircuit(c.id, { rcdRatedMa: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Field label="RCD disconnection (ms)" value={c.rcdDisconnectionTimeMs} onChangeText={(v) => patchCircuit(c.id, { rcdDisconnectionTimeMs: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
            </View>
          ))}

          <View style={styles.circuitsHeader}>
            <Text style={styles.sectionTitle}>Observations</Text>
            <Pressable onPress={addObservation} hitSlop={8}><Text style={styles.addLink}>+ Add observation</Text></Pressable>
          </View>
          {observations.length === 0 && <Text style={styles.noItems}>No observations recorded.</Text>}
          {observations.map((o, i) => (
            <View key={o.id} style={styles.itemCard}>
              <View style={styles.itemCardHeader}>
                <Text style={styles.itemCardTitle}>Observation {o.itemNumber || i + 1}</Text>
                <Pressable onPress={() => removeObservation(o.id)} hitSlop={8}><Text style={styles.removeLink}>Remove</Text></Pressable>
              </View>
              <View style={styles.row2}>
                <Field label="Item no." value={o.itemNumber ?? ''} onChangeText={(v) => patchObservation(o.id, { itemNumber: v })} placeholder={String(i + 1)} style={{ flex: 1 }} />
                <Field label="Observation" value={o.description} onChangeText={(v) => patchObservation(o.id, { description: v })} placeholder="e.g. No RCD protection on socket circuits" style={{ flex: 3 }} />
              </View>
              <Text style={styles.fieldLabel}>Classification code</Text>
              <View style={styles.chipRow}>
                {CODE_OPTIONS.map((code) => (
                  <Pressable
                    key={code}
                    style={[styles.codeChip, o.code === code && { backgroundColor: `${CODE_COLOR[code]}22`, borderColor: CODE_COLOR[code] }]}
                    onPress={() => patchObservation(o.id, { code })}
                  >
                    <Text style={[styles.codeChipText, o.code === code && { color: CODE_COLOR[code] }]}>{code}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.codeMeaning}>{CODE_MEANING[o.code]}</Text>
            </View>
          ))}

          <Section title="General condition & assessment">
            <Field label="General condition" value={generalCondition} onChangeText={setGeneralCondition} placeholder="Free-text summary of the installation's overall condition" multiline />
            <Text style={styles.fieldLabel}>Overall assessment</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, overallAssessment === 'satisfactory' && { backgroundColor: '#2E7D3222', borderColor: '#2E7D32' }]} onPress={() => setOverallAssessment(overallAssessment === 'satisfactory' ? undefined : 'satisfactory')}>
                <Text style={[styles.chipText, overallAssessment === 'satisfactory' && { color: '#2E7D32' }]}>Satisfactory</Text>
              </Pressable>
              <Pressable style={[styles.chip, overallAssessment === 'unsatisfactory' && { backgroundColor: '#C6282822', borderColor: '#C62828' }]} onPress={() => setOverallAssessment(overallAssessment === 'unsatisfactory' ? undefined : 'unsatisfactory')}>
                <Text style={[styles.chipText, overallAssessment === 'unsatisfactory' && { color: '#C62828' }]}>Unsatisfactory</Text>
              </Pressable>
            </View>
            {assessmentMismatch && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  You have a C1 or C2 observation but marked the installation Satisfactory — an installation with any C1/C2 is normally Unsatisfactory. Double-check before generating.
                </Text>
              </View>
            )}
          </Section>

          <Section title="Comments">
            <Field label="Additional comments" value={comments} onChangeText={setComments} placeholder="Departures from BS 7671, limitations of the inspection, etc." multiline />
          </Section>

          <Section title="Declaration">
            <Field label="Name (inspected and tested by)" value={signedByName} onChangeText={setSignedByName} placeholder="Full name" />
            <Field label="For (company)" value={signedForCompany} onChangeText={setSignedForCompany} placeholder="Business name" />
            <Field label="Recommended next inspection (years)" value={nextInspectionYears} onChangeText={setNextInspectionYears} placeholder="e.g. 5" keyboardType="decimal-pad" />
          </Section>

          <Pressable style={styles.saveBtn} onPress={onSave} disabled={saving} hitSlop={8}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save details'}</Text>
          </Pressable>

          <Pressable style={styles.generateBtn} onPress={onGeneratePress} disabled={saving || generating} hitSlop={8}>
            <Text style={styles.generateBtnText}>{generating ? 'Generating…' : 'Generate report & sign'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={signOpen} animationType="slide" onRequestClose={() => setSignOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
          <View style={styles.sigHeader}>
            <Text style={styles.sigTitle}>Sign to complete</Text>
            <Text style={styles.sigHint}>Sign as the person who inspected and tested this installation.</Text>
          </View>
          <View style={styles.sigPad}>
            <SignatureScreen ref={sigRef} onOK={onSigned} webStyle={webStyle} autoClear={false} descriptionText="" />
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
          <Text style={styles.busyText}>Generating report…</Text>
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
  label, value, onChangeText, placeholder, multiline, keyboardType, style,
}: {
  label: string; value: string; onChangeText: (s: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: 'decimal-pad'; style?: object;
}) {
  return (
    <View style={[styles.fieldWrap, style]}>
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
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  subtitle: { color: ACCENT, fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  deleteLink: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5, marginBottom: space.sm },
  statusDraft: { backgroundColor: colors.surfacePressed },
  statusCompleted: { backgroundColor: '#06D6A01A' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextDraft: { color: colors.textMuted },
  statusTextCompleted: { color: '#06D6A0' },
  section: { backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline, padding: space.md, marginBottom: space.md },
  sectionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row2: { flexDirection: 'row', gap: space.sm },
  fieldWrap: { marginBottom: space.sm },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: colors.ground, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.sm, color: colors.textPrimary, fontSize: 14 },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: space.md, paddingVertical: space.sm },
  chipActive: { backgroundColor: `${ACCENT}22`, borderColor: ACCENT },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: ACCENT },
  codeChip: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.hairline, paddingHorizontal: space.lg, paddingVertical: space.sm },
  codeChipText: { color: colors.textSecondary, fontWeight: '800', fontSize: 14 },
  codeMeaning: { color: colors.textMuted, fontSize: 11.5, fontStyle: 'italic' },
  circuitsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm, marginTop: space.xs },
  addLink: { color: ACCENT, fontWeight: '700', fontSize: 13 },
  noItems: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginBottom: space.md },
  itemCard: { backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline, padding: space.md, marginBottom: space.md },
  itemCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  itemCardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  removeLink: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  warningBox: { backgroundColor: '#C6282822', borderRadius: radius.tile, padding: space.md, marginTop: space.xs },
  warningText: { color: '#C62828', fontSize: 12.5, lineHeight: 18 },
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
