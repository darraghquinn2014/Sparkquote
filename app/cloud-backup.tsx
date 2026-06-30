import React, { useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudBackupScreen } from '@/src/ui/sync/CloudBackupScreen';
import { exportBackup, pickAndRestoreBackup } from '@/src/data/backup-service';

export default function CloudBackupRoute() {
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportBackup();
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      setLastBackupDate(today);
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = () => {
    Alert.alert(
      'Restore backup?',
      'This will replace ALL data on this device with the contents of the backup file. Export first if you want to keep what is here.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = await pickAndRestoreBackup();
              if (result.restored) {
                Alert.alert('Restored', result.message);
              } else if (result.message !== 'Cancelled.') {
                Alert.alert('Restore failed', result.message);
              }
            } catch (e) {
              Alert.alert('Restore failed', String(e));
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07101E' }} edges={['top']}>
      <CloudBackupScreen
        exporting={exporting}
        restoring={restoring}
        lastBackupDate={lastBackupDate}
        onExport={handleExport}
        onRestore={handleRestore}
      />
    </SafeAreaView>
  );
}
