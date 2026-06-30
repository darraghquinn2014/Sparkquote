import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Settings</Text>
      <Pressable style={styles.row} onPress={() => router.push('/business-profile' as any)}>
        <Text style={styles.rowText}>Business profile</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/media-settings')}>
        <Text style={styles.rowText}>Photos & storage</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/cloud-backup')}>
        <Text style={styles.rowText}>Cloud backup</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/profit-report' as any)}>
        <Text style={styles.rowText}>Profit report</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/suppliers')}>
        <Text style={styles.rowText}>Manage price lists</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/import')}>
        <Text style={styles.rowText}>Import wholesale prices</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/review')}>
        <Text style={styles.rowText}>Demo: Review & sign PDF</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07101E', padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#E8F1FF', marginBottom: 16 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0C1928', borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: '#1A3060',
  },
  rowText: { fontSize: 16, color: '#E8F1FF', fontWeight: '600' },
  chevron: { fontSize: 22, color: '#1B8FFF' },
});
