/**
 * useVoiceSession - V4 Conversation State Machine Hook
 * States: idle -> connecting -> listening -> transcribing -> understanding -> speaking -> listening -> ended
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SessionState, DEFAULT_VOICE_CONFIG, ReflectionContext, Reflection, CrisisSignal, TranscriptBuffer, TranscriptSegment } from '@/types/voice';
import { createVAD, VoiceActivityDetector } from '@/features/voice/vad';
import { createTranscriptBuffer } from '@/features/voice/transcriptBuffer';
import { createTurnTakingEngine, TurnTakingEngine } from '@/features/voice/turnTaking';
import { createReflectionEngine, ReflectionEngine } from '@/features/reflection/reflectionEngine';
import { createCrisisDetector, CrisisDetector } from '@/features/safety/crisisDetection';
import { detectLanguageWithHint, SupportedLanguage } from '@/lib/language/detectLanguage';
import { createStreamingSTTClient, createStreamingTTSClient, StreamingSTTClient, StreamingTTSClient, DEFAULT_STT_CONFIG, DEFAULT_TTS_CONFIG } from '@/lib/shunya/streaming';
import { evaluateConfidence } from '@/features/reflection/confidenceGate';
import { detectGreeting } from '@/features/reflection/greetingDetector';
import { detectAdviceSeeking } from '@/features/reflection/adviceGuard';
import { evaluateTurnTaking } from '@/features/reflection/turnTakingGuard';
import { evaluateEarlyCommit } from '@/features/reflection/earlyCommit';
import { createTurnManager } from '@/features/session/TurnManager';
import { createConversationLock } from '@/features/session/conversationLock';
import { createConversationMemory, addUserTurn, addAITurn, getRecentUserTurns, getRecentAITurns } from '@/features/session/conversationMemory';
import { createLatencyMarkers, reportLatency } from '@/lib/debug/latencyProfiler';

const MIN_AUDIO_SIZE = 500;
const MIN_DURATION = 0.2;

interface UseVoiceSessionOptions {
  onStateChange?: (state: SessionState) => void;
  onReflection?: (reflection: Reflection) => void;
  onCrisis?: (crisis: { detected: boolean; message: string; resources: any[] }) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

interface UseVoiceSessionReturn {
  state: SessionState;
  audioLevel: number;
  isVADActive: boolean;
  startSession: () => Promise<void>;
  endSession: () => void;
  interruptAI: () => void;
  sendTextMessage: (text: string) => void;
}

export function useVoiceSession(options: UseVoiceSessionOptions = {}): UseVoiceSessionReturn {
  const { onStateChange, onReflection, onCrisis, onTranscript, onError } = options;

  // Core state - only update on actual state changes to minimize renders
  const [state, setState] = useState<SessionState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVADActive, setIsVADActive] = useState(false);

  // Refs to avoid stale closures and avoid unnecessary renders
  const stateRef = useRef<SessionState>('idle');
  useEffect(() => { stateRef.current = state; }, [state]);

  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const transcriptBufferRef = useRef<TranscriptBuffer | null>(null);
  const turnTakingRef = useRef<TurnTakingEngine | null>(null);
  const reflectionEngineRef = useRef<ReflectionEngine | null>(null);
  const crisisDetectorRef = useRef<CrisisDetector | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string>('');
  const isProcessingRef = useRef(false);

  const sttClientRef = useRef<StreamingSTTClient | null>(null);
  const ttsClientRef = useRef<StreamingTTSClient | null>(null);
  const sttConnectedRef = useRef<boolean>(false);
  const ttsConnectedRef = useRef<boolean>(false);
  const ttsPlayingRef = useRef<boolean>(false);

  // V4 turn/conversation management
  const turnManagerRef = useRef<ReturnType<typeof createTurnManager> | null>(null);
  const conversationLockRef = useRef<ReturnType<typeof createConversationLock> | null>(null);
  const lastTranscriptRef = useRef<string>('');
  const lastUserTurnsRef = useRef<string[]>([]);
  const lastAIReflectionsRef = useRef<string[]>([]);
  const pendingReflectionRef = useRef<{ text: string; language: string } | null>(null);
  const conversationMemoryRef = useRef<ReturnType<typeof createConversationMemory>>(createConversationMemory());
  const lastReflectionTimeRef = useRef<number>(0);
  const lastTurnIdRef = useRef<string | null>(null);
  const latencyMarkersRef = useRef<ReturnType<typeof createLatencyMarkers> | null>(null);

  // V4 render-storm fix: latest audio updates live in refs and are flushed via rAF
  const rafIdRef = useRef<number | null>(null);
  const pendingAudioUpdateRef = useRef<{ level: number; active: boolean } | null>(null);

  const flushAudioUpdate = useCallback(() => {
    if (pendingAudioUpdateRef.current) {
      const { level, active } = pendingAudioUpdateRef.current;
      setAudioLevel(level);
      setIsVADActive(active);
      pendingAudioUpdateRef.current = null;
    }
    rafIdRef.current = null;
  }, [setAudioLevel, setIsVADActive]);

  const throttledAudioUpdate = useCallback((level: number, active: boolean) => {
    pendingAudioUpdateRef.current = { level, active };
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => flushAudioUpdate());
    }
  }, [flushAudioUpdate]);

  const setSessionState = useCallback((newState: SessionState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  const speakWithTTS = useCallback(async (text: string, language: 'hindi' | 'hinglish' | 'english' = 'hinglish'): Promise<void> => {
    if (!text.trim()) return;

    const lock = conversationLockRef.current;
    const markers = latencyMarkersRef.current;
    lock?.lock();

    try {
      if (!ttsClientRef.current) {
        const langCode = language === 'hindi' || language === 'hinglish' ? 'hi' : 'en';
        ttsClientRef.current = createStreamingTTSClient(
          { ...DEFAULT_TTS_CONFIG, language: langCode },
          (event) => {
            if (event.type === 'chunk') {
              if (markers && markers.ttsFirstAudioTime === null) {
                markers.ttsFirstAudioTime = Date.now();
                markers.playbackStartTime = Date.now();
                console.log(`[Latency] TTS first audio: ${markers.ttsFirstAudioTime - (markers.llmEndTime || markers.ttsStartTime || Date.now())}ms`);
              }
            }
            if (event.type === 'complete') {
              console.log('[Session] TTS playback complete');
              ttsPlayingRef.current = false;
              turnTakingRef.current?.onAISpeechEnd();
              if (markers) {
                markers.ttsEndTime = Date.now();
                const report = reportLatency(markers);
                console.log('[Latency] Summary:', report);
                latencyMarkersRef.current = null;
              }
            } else if (event.type === 'error') {
              console.error('[Session] TTS error:', event.error);
              ttsPlayingRef.current = false;
              turnTakingRef.current?.onAISpeechEnd();
              if (markers) {
                markers.ttsEndTime = Date.now();
                reportLatency(markers);
                latencyMarkersRef.current = null;
              }
            }
          }
        );
      }

      if (!ttsConnectedRef.current) {
        await ttsClientRef.current.connect();
        ttsConnectedRef.current = true;
        console.log('[Session] TTS connected');
      }
      if (markers) {
        markers.ttsStartTime = Date.now();
      }
      ttsPlayingRef.current = true;
      await ttsClientRef.current.speak(text, true);
    } catch (error) {
      console.error('[Session] TTS error:', error);
      turnTakingRef.current?.onAISpeechEnd();
    } finally {
      lock?.unlock();
    }
  }, []);

  const checkAndGenerateReflection = useCallback(async (silenceMs: number) => {
    if (isProcessingRef.current) return;
    const reflectionEngine = reflectionEngineRef.current;
    const turnManager = turnManagerRef.current;
    const lock = conversationLockRef.current;
    if (!reflectionEngine || !turnManager || !lock) return;

    if (!turnManager.canRespondToSilence()) {
      return;
    }

    const memory = conversationMemoryRef.current;
    const currentTranscript = memory.currentTurnText || lastTranscriptRef.current;

    console.log('[Session] checkAndGenerateReflection - silenceMs:', silenceMs, 'currentTranscript:', currentTranscript?.substring(0, 50));

    if (!currentTranscript && silenceMs < 2400) {
      return;
    }

    isProcessingRef.current = true;
    turnManager.markSilenceConsumed();
    lock.setReflecting(true);
    setSessionState('understanding');

    try {
      const language = detectLanguageWithHint(currentTranscript) as 'hindi' | 'hinglish' | 'english';
      const reflectionContext: ReflectionContext = {
        recentTranscript: currentTranscript,
        userLanguage: language,
        emotionalSignals: [],
        silenceDurationMs: silenceMs,
        recentUserTurns: getRecentUserTurns(memory).slice(-3),
        recentAIReflections: getRecentAITurns(memory).slice(-3),
        turnId: lastTurnIdRef.current || undefined,
      };

      const result = await reflectionEngine.processContext(reflectionContext, silenceMs >= 2500);

      if (result?.crisis) {
        setSessionState('ended');
        onCrisis?.(result.crisis);
        return;
      }

      if (result?.reflection) {
        lastReflectionTimeRef.current = Date.now();
        addAITurn(memory, result.reflection.text);
        lastAIReflectionsRef.current = getRecentAITurns(memory);
        turnTakingRef.current?.onAISpeechStart(result.reflection.text);
        onReflection?.(result.reflection);
        const markers = latencyMarkersRef.current;
        if (markers) {
          markers.llmStartTime = markers.llmStartTime || Date.now();
          markers.llmEndTime = Date.now();
          markers.ttsStartTime = Date.now();
        }
        await speakWithTTS(result.reflection.text, result.reflection.language);
      } else {
        console.log('[Session] Silence trigger but no reflection, speaking fallback');
        const fallbackLang = language || 'hinglish';
        const fallbackText = {
          hindi: 'Lagta hai kuch baatein abhi bhi andar hain.',
          hinglish: 'Lag raha hai kuch baatein abhi bhi andar hain.',
          english: "Seems like there's more you want to say.",
        }[fallbackLang];
        await speakWithTTS(fallbackText, fallbackLang as any);
      }
    } catch (error) {
      console.error('[Session] Reflection error:', error);
      onError?.('Failed to generate reflection');
    } finally {
      isProcessingRef.current = false;
      lock.setReflecting(false);
    }
  }, [onCrisis, onReflection, onError, setSessionState, speakWithTTS]);

  // MicVAD -> WAV -> Shunya STT (transcript-first reflection)
  const handleTranscribe = useCallback(
    async (audio: Float32Array) => {
      const lock = conversationLockRef.current;
      const turnManager = turnManagerRef.current;
      const markers = latencyMarkersRef.current;
      if (!sttClientRef.current) return;
      if (!lock || !turnManager) return;
      if (lock.isBlocked()) {
        console.warn('[Session] Transcription blocked: conversation locked');
        return;
      }

      // TASK 6: prepare context/metadata ahead of STT completion
      const preparePromise = (async () => {
        const memory = conversationMemoryRef.current;
        const currentLanguage = memory.currentTurnText
          ? detectLanguageWithHint(memory.currentTurnText)
          : 'hinglish';
        const recentUserTurns = getRecentUserTurns(memory);
        const recentAITurns = getRecentAITurns(memory);
        const silenceThresholdMs = Number(process.env.NEXT_PUBLIC_SILENCE_THRESHOLD_MS || 1000);
        return { memory, currentLanguage, recentUserTurns, recentAITurns, silenceThresholdMs };
      })();

      lock.setSTTProcessing(true);
      setSessionState('transcribing');

      try {
        const result = await sttClientRef.current.transcribeWav(audio, 16000);
        if (!result || !result.text) {
          console.warn('[Session] STT returned empty transcript');
          return;
        }

        // TASK 1: STT timing
        if (markers) {
          markers.sttEndTime = Date.now();
          console.log(`[Latency] STT: ${markers.sttEndTime - markers.sttStartTime}ms`);
        }

        const transcript = result.text;
        const language = detectLanguageWithHint(transcript) as 'hindi' | 'hinglish' | 'english';

        // FIX 2: Confidence gate
        // Note: STT client currently does not return confidence from Shunya API.
        // Keeping this branch for when confidence becomes available.
        const sttConfidence = (result as any)?.confidence;
        if (typeof sttConfidence === 'number') {
          const confidenceResult = evaluateConfidence(transcript, sttConfidence);
          if (!confidenceResult.shouldProcess) {
            console.log('[Session] Confidence gate blocked transcript:', confidenceResult.reason);
            onTranscript?.(transcript, true);
            turnTakingRef.current?.onUserSpeechEnd(1000);
            await speakWithTTS(confidenceResult.clarification || 'Thoda aur batao.', language);
            return;
          }
        }

        // FIX 3: Greeting detector
        const greetingResult = detectGreeting(transcript);
        if (greetingResult.isGreeting) {
          console.log('[Session] Greeting detected, responding directly');
          onTranscript?.(transcript, true);
          turnTakingRef.current?.onUserSpeechEnd(1000);
          await speakWithTTS(greetingResult.response, language);
          return;
        }

        // FIX 4: Advice guard
        const adviceResult = detectAdviceSeeking(transcript);
        if (adviceResult.isAdviceSeeking) {
          console.log('[Session] Advice-seeking detected, responding with reflection instead');
          // Continue to reflection engine - it will generate a reflection not advice
        }

        onTranscript?.(transcript, true);
        lastTranscriptRef.current = transcript;
        turnTakingRef.current?.onUserSpeechPartial(transcript);

        // Removed the hard short-transcript bypass in `useVoiceSession.ts`.
        // Previously, transcripts shorter than `transcriptValidator.minContextChars` or with
        // fewer than 2 words were forced into a fixed TTS fallback here, so the LLM never saw them.
        // That caused the observed split behavior: short utterances got fallback strings, longer
        // ones got real reflections. Now all transcripts continue to the turn guard and reflection
        // engine uniformly.

        // TASK 2+3: Turn guard with 1s default + early commit
        const { memory, currentLanguage, recentUserTurns, recentAITurns, silenceThresholdMs } = await preparePromise;
        const silenceMs = 0;
        const lastReflectionTime = lastReflectionTimeRef.current;
        const guardResult = evaluateTurnTaking({
          transcript,
          silenceMs,
          isAISpeaking: ttsPlayingRef.current,
          lastReflectionTime,
          cooldownMs: 5000,
          silenceThresholdMs: Math.min(silenceThresholdMs, 1000),
          earlyCommit: {
            confidence: typeof (result as any)?.confidence === 'number' ? (result as any).confidence : undefined,
          },
          isDirectSpeech: true,
        });

        if (!guardResult.shouldReflect) {
          console.log('[Session] Turn guard blocked reflection:', guardResult.reason);
          turnTakingRef.current?.onUserSpeechEnd(1000);
          await speakWithTTS('Main yahan hoon. Sun raha hoon.', language);
          return;
        }

        // FIX 1: Conversation memory - add current turn
        addUserTurn(memory, transcript, language);
        lastUserTurnsRef.current = getRecentUserTurns(memory);

        setSessionState('understanding');

        // TASK 5: Small prompt context (max 3 turns each)
        const reflectionContext: ReflectionContext = {
          recentTranscript: transcript,
          userLanguage: currentLanguage,
          emotionalSignals: [],
          silenceDurationMs: silenceMs,
          recentUserTurns: recentUserTurns.slice(-3),
          recentAIReflections: recentAITurns.slice(-3),
          turnId: lastTurnIdRef.current || undefined,
        };

        // TASK 6: Parallelize LLM call
        const llmStart = Date.now();
        const reflectionPromise = reflectionEngineRef.current?.processContext(reflectionContext, true);
        if (markers) {
          markers.llmStartTime = llmStart;
        }

        const reflectionResult = await reflectionPromise;

        if (markers) {
          markers.llmEndTime = Date.now();
          console.log(`[Latency] LLM: ${markers.llmEndTime - markers.llmStartTime}ms`);
          if (reflectionResult?.reflection?.firstTokenMs) {
            console.log(`[Latency] LLM first token: ${reflectionResult.reflection.firstTokenMs}ms`);
          }
        }

        if (reflectionResult?.crisis) {
          setSessionState('ended');
          onCrisis?.(reflectionResult.crisis);
          return;
        }

        if (reflectionResult?.reflection) {
          console.log('[Session] Reflection generated:', reflectionResult.reflection.text.substring(0, 60));
          lastReflectionTimeRef.current = Date.now();
          addAITurn(memory, reflectionResult.reflection.text);
          lastAIReflectionsRef.current = getRecentAITurns(memory);
          pendingReflectionRef.current = { text: reflectionResult.reflection.text, language: reflectionResult.reflection.language };
          turnTakingRef.current?.onAISpeechStart(reflectionResult.reflection.text);
          onReflection?.(reflectionResult.reflection);

          if (markers) {
            markers.ttsStartTime = Date.now();
          }
          await speakWithTTS(reflectionResult.reflection.text, reflectionResult.reflection.language);
          if (markers) {
            markers.ttsEndTime = Date.now();
            const report = reportLatency(markers);
            console.log('[Latency] Summary:', report);
            latencyMarkersRef.current = null;
          }
        } else {
          console.log('[Session] No reflection generated, sending fallback');
          const fallbackText = 'Main yahan hoon. Sun raha hoon.';
          await speakWithTTS(fallbackText, language);
        }
      } catch (error) {
        console.error('[Session] Transcription/reflection error:', error);
        onError?.('Failed to process speech');
      } finally {
        lock.setSTTProcessing(false);
      }
    },
    [onTranscript, onCrisis, onReflection, onError, setSessionState, speakWithTTS]
  );

  const startSession = useCallback(async () => {
    if (stateRef.current !== 'idle') return;

    try {
      setSessionState('connecting');
      sessionIdRef.current = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;

      console.log('[Session] Connecting to Shunya STT (HTTP)...');
      sttClientRef.current = createStreamingSTTClient(DEFAULT_STT_CONFIG, (event) => {
        if (event.type === 'final' && event.text) {
          console.log('[Session] STT final:', event.text);
          console.log('[Session] Detected language:', event.language || 'auto');
          turnTakingRef.current?.onUserSpeechPartial(event.text);
          const turn = turnTakingRef.current?.getCurrentTurn();
          const durationMs = turn ? Date.now() - turn.timestamp : 1000;
          turnTakingRef.current?.onUserSpeechEnd(durationMs);
        } else if (event.type === 'error') {
          console.error('[Session] STT error:', event.error);
          onError?.(event.error || 'STT error');
          conversationLockRef.current?.setSTTProcessing(false);
        }
      });

      try {
        await sttClientRef.current.connect();
        sttConnectedRef.current = true;
        console.log('[Session] STT connected');
      } catch (sttErr) {
        console.error('[Session] Failed to connect STT:', sttErr);
        onError?.('Speech-to-text unavailable. You can use Cmd/Ctrl+Enter to type messages.');
      }

      vadRef.current = await createVAD(stream, {
        onSpeechStart: (level) => {
          const lock = conversationLockRef.current;
          if (lock?.isBlocked()) {
            console.log('[Session] VAD speech start ignored: conversation locked');
            return;
          }
          console.log('[Session] VAD speech start detected, level:', level);
          throttledAudioUpdate(level, true);
          turnTakingRef.current?.onUserSpeechStart();
          if (stateRef.current === 'idle' || stateRef.current === 'connecting') {
            setSessionState('listening');
          }
        },
        onSpeechEnd: async (durationMs, audio) => {
          const lock = conversationLockRef.current;
          if (lock?.isBlocked()) {
            console.log('[Session] VAD speech end ignored: conversation locked');
            return;
          }
          console.log('[Session] VAD speech end, duration:', durationMs, 'samples:', audio?.length ?? 0);
          throttledAudioUpdate(0, false);
          turnTakingRef.current?.onUserSpeechEnd(durationMs);

          // TASK 1: start latency measurement when new speech ends
          latencyMarkersRef.current = createLatencyMarkers(Date.now());
          if (audio && audio.length > 0 && sttClientRef.current) {
            console.log('[VAD] Speech samples count:', audio.length, 'sampleRate: 16000 (MicVAD default)');
            if (latencyMarkersRef.current) {
              latencyMarkersRef.current.sttStartTime = Date.now();
            }
            await handleTranscribe(audio);
          } else {
            console.warn('[Session] No audio from MicVAD to transcribe');
          }
        },
        onVADUpdate: (result) => {
          if (conversationLockRef.current?.isBlocked()) return;
          throttledAudioUpdate(result.audioLevel, result.isSpeech);
        },
        onError: (error) => {
          console.error('[Session] VAD error:', error);
          onError?.(error.message);
        },
        onUserInterrupt: () => {
          console.log('[Session] User interrupt detected while AI is speaking');
          interruptAI();
        },
      });

      console.log('[Session] Started successfully:', sessionIdRef.current);
    } catch (error) {
      console.error('[Session] Start error:', error);
      setSessionState('idle');
      onError?.(error instanceof Error ? error.message : 'Failed to start session');
    }
  }, [setSessionState, onError, handleTranscribe]);

  const endSession = useCallback(() => {
    vadRef.current?.stop();
    vadRef.current = null;

    if (sttConnectedRef.current && sttClientRef.current) {
      try { sttClientRef.current.disconnect(); } catch (e) { /* ignore */ }
    }
    sttClientRef.current = null;
    sttConnectedRef.current = false;

    if (ttsConnectedRef.current && ttsClientRef.current) {
      try { ttsClientRef.current.disconnect(); } catch (e) { /* ignore */ }
    }
    ttsClientRef.current = null;
    ttsConnectedRef.current = false;
    ttsPlayingRef.current = false;

    setIsVADActive(false);
    setAudioLevel(0);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    turnTakingRef.current?.reset();
    reflectionEngineRef.current?.reset();
    transcriptBufferRef.current?.clear();
    turnManagerRef.current?.reset();
    lastUserTurnsRef.current = [];
    lastAIReflectionsRef.current = [];

    setSessionState('ended');
    console.log('[Session] Ended:', sessionIdRef.current);
  }, [setSessionState]);

  const interruptAI = useCallback(() => {
    const lock = conversationLockRef.current;
    if (!lock?.canInterrupt()) return;

    if (stateRef.current === 'speaking') {
      if (ttsClientRef.current) {
        try { ttsClientRef.current.interrupt(); } catch (e) { /* ignore */ }
      }
      ttsPlayingRef.current = false;
      turnTakingRef.current?.onUserSpeechStart();
      setSessionState('listening');
    }
  }, [setSessionState]);

  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    turnTakingRef.current?.onUserSpeechStart();
    turnTakingRef.current?.onUserSpeechPartial(text);
    turnTakingRef.current?.onUserSpeechEnd(1000);
    checkAndGenerateReflection(3000);
  }, [checkAndGenerateReflection]);

  useEffect(() => {
    transcriptBufferRef.current = createTranscriptBuffer();
    crisisDetectorRef.current = createCrisisDetector();
    reflectionEngineRef.current = createReflectionEngine();
    conversationLockRef.current = createConversationLock();
    turnManagerRef.current = createTurnManager();

    turnTakingRef.current = createTurnTakingEngine({
      onUserTurnStart: (turn) => {
        console.log('[Session] User turn started:', turn.id);
      },
      onUserTurnEnd: (turn) => {
        console.log('[Session] User turn ended:', turn.id, turn.text);
        if (turn.text && transcriptBufferRef.current) {
          const segment: TranscriptSegment = {
            id: turn.id,
            text: turn.text,
            timestamp: Date.now(),
            isFinal: true,
            language: detectLanguageWithHint(turn.text),
          };
          transcriptBufferRef.current.addSegment(segment);
          lastTranscriptRef.current = turn.text;
          lastUserTurnsRef.current = [...lastUserTurnsRef.current.slice(-4), turn.text];
        }
        turnManagerRef.current?.endUserTurn(turn.id);
      },
      onAITurnStart: (turn) => {
        console.log('[Session] AI turn started:', turn.id);
        setSessionState('speaking');
        onStateChange?.('speaking');
        conversationLockRef.current?.lock();
      },
      onAITurnEnd: (turn) => {
        console.log('[Session] AI turn ended:', turn.id);
        conversationLockRef.current?.unlock();
        turnManagerRef.current?.endAITurn();
        if (pendingReflectionRef.current) {
          lastAIReflectionsRef.current = [...lastAIReflectionsRef.current.slice(-2), pendingReflectionRef.current.text];
          pendingReflectionRef.current = null;
        }
        setSessionState('listening');
        onStateChange?.('listening');
      },
      onInterruption: (turn) => {
        console.log('[Session] AI interrupted:', turn.id);
        conversationLockRef.current?.lock();
      },
      onSilenceThresholdReached: async (silenceMs) => {
        const lock = conversationLockRef.current;
        const turnManager = turnManagerRef.current;
        if (!lock || !turnManager) return;
        if (lock.isBlocked()) {
          console.log('[Session] Silence ignored: conversation locked');
          return;
        }
        if (!turnManager.canRespondToSilence()) {
          return;
        }
        console.log('[Session] Silence threshold reached:', silenceMs);
        turnManager.markSilenceConsumed();
        await checkAndGenerateReflection(silenceMs);
      },
    });

    return () => {
      vadRef.current?.stop();
      turnTakingRef.current?.reset();
      reflectionEngineRef.current?.reset();
      turnManagerRef.current?.reset();
      conversationLockRef.current = null;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [onStateChange, checkAndGenerateReflection, setSessionState]);

  return {
    state,
    audioLevel,
    isVADActive,
    startSession,
    endSession,
    interruptAI,
    sendTextMessage,
  };
}
