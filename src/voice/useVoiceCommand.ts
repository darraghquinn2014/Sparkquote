/**
 * Push-to-talk speech recognition hook. Press to start listening; a final
 * result auto-stops recognition. Requires a development build (not Expo Go).
 */
import { useCallback, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type VoiceCommandError = 'permission-denied' | 'no-speech' | 'other';

interface UseVoiceCommandResult {
  listening: boolean;
  transcript: string;
  interimTranscript: string;
  error: VoiceCommandError | null;
  start: (contextualStrings?: string[]) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useVoiceCommand(): UseVoiceCommandResult {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<VoiceCommandError | null>(null);
  const gotFinalRef = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    if (!gotFinalRef.current) setError((prev) => prev ?? 'no-speech');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const result = event.results[0];
    if (!result) return;
    if (event.isFinal) {
      gotFinalRef.current = true;
      setTranscript(result.transcript);
      setInterimTranscript('');
      ExpoSpeechRecognitionModule.stop();
    } else {
      setInterimTranscript(result.transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    if (event.error === 'not-allowed') setError('permission-denied');
    else if (event.error === 'no-speech' || event.error === 'speech-timeout') setError('no-speech');
    else setError('other');
  });

  const reset = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
    gotFinalRef.current = false;
  }, []);

  const start = useCallback(async (contextualStrings?: string[]) => {
    reset();
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('permission-denied');
      return;
    }
    gotFinalRef.current = false;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-GB',
      interimResults: true,
      continuous: false,
      ...(contextualStrings?.length ? { contextualStrings } : {}),
    });
  }, [reset]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { listening, transcript, interimTranscript, error, start, stop, reset };
}
