import React, { useState } from 'react';
import { MediaSettingsScreen } from '@/src/ui/media/MediaSettingsScreen';
import type { ImageQuality } from '@/src/media/media-types';

export default function MediaSettingsRoute() {
  const [quality, setQuality] = useState<ImageQuality>('medium');
  return (
    <MediaSettingsScreen
      quality={quality}
      onChangeQuality={setQuality}
      onClearCache={async () => 0}
    />
  );
}
