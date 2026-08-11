import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/src/state/settingsStore';
import type { HintStep } from './types';

/** Drives a screen's hint bubble: auto-plays once per `groupId` (unless the
 * user has switched hints off globally), and can be replayed anytime via the
 * screen's "?" FAB regardless of "seen" state. */
export function useHintWalkthrough(groupId: string, steps: HintStep[]) {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hintsEnabled = useSettingsStore((s) => s.hintsEnabled);
  const seenHintGroups = useSettingsStore((s) => s.seenHintGroups);
  const markHintGroupSeen = useSettingsStore((s) => s.markHintGroupSeen);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (hintsEnabled && !seenHintGroups.includes(groupId) && steps.length > 0) {
      setStepIndex(0);
      setActive(true);
    }
    // Only re-evaluate auto-play when hydration completes or the group changes —
    // not on every seenHintGroups/hintsEnabled tick, so an in-progress walkthrough
    // isn't yanked away mid-step when markHintGroupSeen fires at the end of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, groupId]);

  const next = () => {
    if (stepIndex + 1 >= steps.length) {
      setActive(false);
      markHintGroupSeen(groupId);
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const skip = () => {
    setActive(false);
    markHintGroupSeen(groupId);
  };

  const replay = () => {
    if (!hintsEnabled || steps.length === 0) return;
    setStepIndex(0);
    setActive(true);
  };

  return {
    active: active && steps.length > 0,
    step: steps[stepIndex],
    stepIndex,
    total: steps.length,
    next,
    skip,
    replay,
    hintsEnabled,
  };
}
