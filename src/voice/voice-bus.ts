/**
 * Tiny event bus so the global voice control (mounted once at the app root)
 * can trigger an action that only exists as local state inside whichever
 * screen is currently mounted — e.g. "preview PDF quote", which loads the
 * business profile and renders HTML entirely inside app/estimate.tsx and
 * app/project/quote/[id].tsx. Voice emits the action name (with a payload,
 * for actions that need one); the screen that owns the real implementation
 * registers a handler for it via useVoiceAction, so nothing is duplicated.
 */
import { useEffect, useRef } from 'react';

export interface VoiceActionPayloads {
  previewPdf: void;
  generateReport: void;
  /** A snag was just created by voice — offer to attach a photo to it, the
   * same way the manual "+ Add" flow does, without rebuilding the camera UI. */
  snagPhotoPrompt: { snagId: string };
}

export type VoiceActionName = keyof VoiceActionPayloads;

type AnyListener = (payload: unknown) => void;
const listeners = new Map<VoiceActionName, Set<AnyListener>>();

/** Returns true if some mounted screen handled it, false if nobody was listening. */
export function emitVoiceAction<K extends VoiceActionName>(
  action: K,
  ...payload: VoiceActionPayloads[K] extends void ? [] : [VoiceActionPayloads[K]]
): boolean {
  const set = listeners.get(action);
  if (!set || set.size === 0) return false;
  set.forEach((fn) => fn(payload[0]));
  return true;
}

/** Registers `handler` to run whenever `action` is emitted while this screen is mounted. */
export function useVoiceAction<K extends VoiceActionName>(
  action: K,
  handler: (payload: VoiceActionPayloads[K]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const fn: AnyListener = (payload) => handlerRef.current(payload as VoiceActionPayloads[K]);
    if (!listeners.has(action)) listeners.set(action, new Set());
    listeners.get(action)!.add(fn);
    return () => { listeners.get(action)?.delete(fn); };
  }, [action]);
}
