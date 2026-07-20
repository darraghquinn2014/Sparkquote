import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Unlocks rotation while `active` (the camera is open) so the native
 * capture picks up the phone's physical rotation instead of the app's
 * fixed portrait orientation — otherwise every photo is encoded portrait
 * regardless of how the phone was held. Relocks to portrait (the app's
 * orientation everywhere else) on close/unmount.
 */
export function useCameraOrientation(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [active]);
}
