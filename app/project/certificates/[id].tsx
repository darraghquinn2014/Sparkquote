/**
 * Certificates list for a project — id param is the PROJECT id (mirrors the
 * snag list route). All three certificate types now exist (Minor Works, EIC,
 * EICR — the report's build order, in rising complexity), so "+ New
 * certificate" opens a type picker; each type routes to its own edit screen.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { certificatesForProject, createCertificate, deleteCertificate } from '@/src/data/certificate-repo';
import { loadProjects } from '@/src/data/project-repo';
import { ActionSheet } from '@/src/ui/ActionSheet';
import { colors, space, radius } from '@/src/ui/theme/tokens';
import type { Certificate, CertificateType } from '@/src/domain/types';

const ACCENT = '#6B4C6E'; // plum — matches the certification-niche colour used in the competitive report

const CERT_TYPE_LABEL: Record<Certificate['type'], string> = {
  minorWorks: 'Minor Works Certificate',
  eic: 'Electrical Installation Certificate (EIC)',
  eicr: 'Electrical Installation Condition Report (EICR)',
};

function routeForCertificate(cert: Certificate): string {
  if (cert.type === 'eic') return `/certificate/eic/${cert.id}`;
  if (cert.type === 'eicr') return `/certificate/eicr/${cert.id}`;
  return `/certificate/${cert.id}`;
}

function descriptionFor(cert: Certificate): string {
  if (cert.type === 'eic') return cert.fields.descriptionOfInstallation || 'No description yet';
  if (cert.type === 'eicr') return cert.fields.extentAndLimitations || 'No description yet';
  return cert.fields.descriptionOfWork || 'No description yet';
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CertificatesListScreen() {
  const router = useRouter();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [projects, certs] = await Promise.all([
      loadProjects(),
      certificatesForProject(projectId),
    ]);
    setProjectName(projects.find((p) => p.id === projectId)?.name ?? '');
    setItems(certs);
    setLoading(false);
  }, [projectId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onNewCertificate = (type: CertificateType) => async () => {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const cert = await createCertificate(projectId, type);
      router.push(routeForCertificate(cert) as any);
    } catch (e) {
      Alert.alert('Could not create certificate', String(e));
    } finally {
      setCreating(false);
    }
  };

  const typePickerItems = [
    { label: CERT_TYPE_LABEL.minorWorks, onPress: onNewCertificate('minorWorks') },
    { label: CERT_TYPE_LABEL.eic, onPress: onNewCertificate('eic') },
    { label: CERT_TYPE_LABEL.eicr, onPress: onNewCertificate('eicr') },
  ];

  const confirmDelete = (cert: Certificate) => {
    Alert.alert('Delete certificate?', `This ${CERT_TYPE_LABEL[cert.type]} will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteCertificate(cert.id); reload(); } },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.screen}><ActivityIndicator color={ACCENT} style={{ marginTop: space.xxl }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} numberOfLines={1}>{projectName || 'Project'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Certificates</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.newBtn} onPress={() => setTypePickerOpen(true)} disabled={creating} hitSlop={8}>
          <Text style={styles.newBtnText}>{creating ? 'Creating…' : '+ New certificate'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        ListEmptyComponent={<Text style={styles.empty}>No certificates yet. Create one after finishing a job that needs BS 7671 paperwork.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(routeForCertificate(item) as any)}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{CERT_TYPE_LABEL[item.type]}</Text>
              <Text style={styles.rowDesc} numberOfLines={1}>
                {descriptionFor(item)}
              </Text>
              <Text style={styles.rowDate}>Created {formatDate(item.createdAt)}</Text>
            </View>
            <View style={[styles.statusPill, item.status === 'completed' ? styles.statusCompleted : styles.statusDraft]}>
              <Text style={[styles.statusText, item.status === 'completed' ? styles.statusTextCompleted : styles.statusTextDraft]}>
                {item.status === 'completed' ? 'Completed' : 'Draft'}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <ActionSheet
        visible={typePickerOpen}
        title="New certificate"
        items={typePickerItems}
        onClose={() => setTypePickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  subtitle: { color: ACCENT, fontSize: 11, fontWeight: '700', marginTop: 1 },
  actionRow: { paddingHorizontal: space.lg, paddingBottom: space.md },
  newBtn: { backgroundColor: `${ACCENT}1A`, borderColor: `${ACCENT}55`, borderWidth: 1, borderRadius: radius.pill, paddingVertical: space.sm, alignItems: 'center' },
  newBtnText: { color: ACCENT, fontWeight: '700', fontSize: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl, fontSize: 14, lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    padding: space.md, marginBottom: space.sm,
  },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  rowDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  rowDate: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 5, marginLeft: space.sm },
  statusDraft: { backgroundColor: colors.surfacePressed },
  statusCompleted: { backgroundColor: '#06D6A01A' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextDraft: { color: colors.textMuted },
  statusTextCompleted: { color: '#06D6A0' },
});
