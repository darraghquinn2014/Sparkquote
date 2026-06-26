import React from 'react';
import { CloudBackupScreen } from '@/src/ui/sync/CloudBackupScreen';

export default function CloudBackupRoute() {
  return (
    <CloudBackupScreen
      providerName={null}
      isOnline={true}
      stats={{ pending: 0, inflight: 0, done: 0, failed: 0, stuck: 0 }}
      syncing={false}
      onConnect={() => {}}
      onDisconnect={() => {}}
      onSyncNow={() => {}}
    />
  );
}
