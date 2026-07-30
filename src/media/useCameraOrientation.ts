import { useCallback, useEffect } from 'react';
import { useNavigation } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Unlocks rotation while `active` (the camera is open) so the native
 * capture picks up the phone's physical rotation instead of the app's
 * fixed portrait orientation — otherwise every photo is encoded portrait
 * regardless of how the phone was held.
 *
 * Also drives the current expo-router screen's own native-stack `orientation`
 * option directly, in addition to expo-screen-orientation's lock/unlock. On
 * iOS, react-native-screens owns each screen's supportedInterfaceOrientations
 * at the native level and does NOT consult expo-screen-orientation's lock
 * state unless a screen has explicitly set its own `orientation` — with none
 * set (the default everywhere in this app before this hook runs), react-
 * native-screens defaults to allowing all orientations regardless of what
 * lockAsync does.
 *
 * Returns `relockPortrait`, an async function callers MUST await and finish
 * BEFORE hiding the camera modal (setting the modal's `visible`/`open` state
 * to false) — not after, and not fire-and-forget in an effect cleanup. The
 * modal's dismissal is a real view-controller transition on iOS, and iOS
 * only re-lays-out the presenting screen to match the current orientation
 * lock AT THE MOMENT that transition happens; relocking concurrently with
 * (or after) the dismissal loses the race; the screen's mask is still
 * "landscape allowed" when the transition fires, and nothing re-triggers
 * layout once the lock catches up afterward — which is exactly what caused
 * the screen to stay visually landscape even though
 * `getOrientationLockAsync`/`getOrientationAsync` both correctly reported
 * portrait moments later.
 */
export function useCameraOrientation(active: boolean): () => Promise<void> {
  const navigation = useNavigation();

  useEffect(() => {
    if (!active) return;
    ScreenOrientation.unlockAsync();
    navigation.setOptions({ orientation: 'all' } as never);
  }, [active, navigation]);

  return useCallback(async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch {
      // best-effort — still flip the screen option below either way
    }
    navigation.setOptions({ orientation: 'portrait' } as never);
  }, [navigation]);
}
