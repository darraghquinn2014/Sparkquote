import React from 'react';
import { HintBubble, HintFab } from './HintBubble';
import type { useHintWalkthrough } from './useHintWalkthrough';

interface ScreenHintsProps {
  hint: ReturnType<typeof useHintWalkthrough>;
  /** Pass useSafeAreaInsets().bottom on any screen with no tab bar below it
   * (pushed/stack screens) — their SafeAreaView box runs edge-to-edge, and
   * these are absolutely positioned so they don't inherit its safe-area
   * padding. Tab screens (content box already ends above the tab bar) should
   * leave this at the default 0. */
  bottomInset?: number;
}

/** Renders the active hint bubble (if any) plus the persistent "?" replay FAB
 * for a screen wired up via useHintWalkthrough. Drop this once near the end
 * of a screen's JSX, after everything else so it draws on top. */
export function ScreenHints({ hint, bottomInset = 0 }: ScreenHintsProps) {
  if (!hint.hintsEnabled) return null;
  return (
    <>
      {hint.active && hint.step && (
        <HintBubble
          text={hint.step.text}
          stepIndex={hint.stepIndex}
          total={hint.total}
          onNext={hint.next}
          onSkip={hint.skip}
          bottomInset={bottomInset}
        />
      )}
      {!hint.active && <HintFab onPress={hint.replay} bottomInset={bottomInset} />}
    </>
  );
}
