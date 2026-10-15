import React from 'react';
import { HintBubble, HintFab, HintHeaderButton } from './HintBubble';
import type { useHintWalkthrough } from './useHintWalkthrough';

interface ScreenHintsProps {
  hint: ReturnType<typeof useHintWalkthrough>;
  /** Pass useSafeAreaInsets().bottom on any screen with no tab bar below it
   * (pushed/stack screens) — their SafeAreaView box runs edge-to-edge, and
   * these are absolutely positioned so they don't inherit its safe-area
   * padding. Tab screens (content box already ends above the tab bar) should
   * leave this at the default 0. */
  bottomInset?: number;
  /** false = the screen puts a HintHeaderSlot in its header instead of the
   * floating "?" (which can cover content at the bottom of the screen). */
  showFab?: boolean;
}

/** Renders the active hint bubble (if any) plus the persistent "?" replay FAB
 * for a screen wired up via useHintWalkthrough. Drop this once near the end
 * of a screen's JSX, after everything else so it draws on top. */
/** The "?" replay button for a screen header. Stays visible while a hint is
 * showing so the header doesn't shift; hidden when hints are off. Pair with
 * <ScreenHints showFab={false} />. */
export function HintHeaderSlot({ hint }: { hint: ReturnType<typeof useHintWalkthrough> }) {
  if (!hint.hintsEnabled) return null;
  return <HintHeaderButton onPress={hint.replay} />;
}

export function ScreenHints({ hint, bottomInset = 0, showFab = true }: ScreenHintsProps) {
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
      {showFab && !hint.active && <HintFab onPress={hint.replay} bottomInset={bottomInset} />}
    </>
  );
}
