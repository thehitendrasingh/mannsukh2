/**
 * MannSukh V5 - Real-Time Voice Types
 * Core type definitions for streaming voice conversation
 */

// ============================================
// Session State Machine
// ============================================

export type SessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'transcribing'
  | 'understanding'
  | 'speaking'
  | 'ended';

// ============================================
// Voice Activity Detection
// ============================================

export interface VADResult {
  isSpeech: boolean;
  confidence: number;
  audioLevel: number; // 0-1
}

export interface VADConfig {
  positiveSpeechThreshold?: number;    // default 0.5
  negativeSpeechThreshold?: number;    // default 0.35
  minSpeechMs?: number;      // default 400
  preSpeechPadMs?: number;   // default 80
  redemptionMs?: number;     // default 160
}

// ============================================
// Transcript Buffer (Rolling 3 min / 2000 chars)
// ============================================

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  language?: 'hindi' | 'hinglish' | 'english';
}

export interface TranscriptBuffer {
  segments: TranscriptSegment[];
  totalChars: number;
  addSegment: (segment: TranscriptSegment) => void;
  getContext: (maxChars?: number, maxAgeMs?: number) => string;
  clear: () => void;
  cleanup: () => void;
}

// ============================================
// Turn Taking
// ============================================

export type Speaker = 'user' | 'ai';

export interface Turn {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: number;
  isComplete: boolean;
  audioChunks?: ArrayBuffer[]; // For AI turns - streaming audio
}

export interface TurnTakingState {
  currentSpeaker: Speaker | null;
  userIsSpeaking: boolean;
  aiIsSpeaking: boolean;
  lastUserSpeechEnd: number;
  silenceDurationMs: number;
  interrupted: boolean;
}

export interface TurnTakingConfig {
  silenceThresholdMs: number;      // 2000-3000ms
  minUserSpeechDurationMs: number; // 500ms
  interruptEnabled: boolean;
}

// ============================================
// Streaming Messages (SSE / WebSocket)
// ============================================

export type StreamMessageType =
  | 'vad_start'
  | 'vad_end'
  | 'stt_partial'
  | 'stt_final'
  | 'turn_start'
  | 'turn_complete'
  | 'llm_token'
  | 'llm_complete'
  | 'tts_chunk'
  | 'tts_complete'
  | 'reflection_trigger'
  | 'reflection_complete'
  | 'crisis_detected'
  | 'error'
  | 'session_end';

export interface StreamMessage {
  type: StreamMessageType;
  payload: unknown;
  timestamp: number;
  sessionId: string;
}

// Specific payload types
export interface VADStartPayload { audioLevel: number }
export interface VADEndPayload { durationMs: number }
export interface STTPartialPayload { text: string; language?: 'hindi' | 'hinglish' | 'english' }
export interface STTFinalPayload { text: string; language?: 'hindi' | 'hinglish' | 'english'; confidence: number }
export interface TurnStartPayload { speaker: Speaker; turnId: string }
export interface TurnCompletePayload { turnId: string; text: string }
export interface LLMTokenPayload { token: string; turnId: string }
export interface LLMCompletePayload { turnId: string; fullText: string }
export interface TTSChunkPayload { audioBase64: string; turnId: string; isFinal: boolean }
export interface TTSCompletePayload { turnId: string; durationMs: number }
export interface ReflectionTriggerPayload { reason: 'silence' | 'thought_complete' | 'emotional_signal'; context: string }
export interface ReflectionCompletePayload { reflection: string; turnId: string }
export interface CrisisDetectedPayload { keywords: string[]; severity: 'high' | 'medium' }
export interface ErrorPayload { code: string; message: string; recoverable: boolean }
export interface SessionEndPayload { reason: 'user' | 'error' | 'crisis' }

// ============================================
// Reflection Engine
// ============================================

export interface ReflectionContext {
  recentTranscript: string;
  userLanguage: 'hindi' | 'hinglish' | 'english';
  emotionalSignals: string[];
  silenceDurationMs: number;
  recentUserTurns?: string[];
  recentAIReflections?: string[];
}

export interface Reflection {
  id: string;
  text: string;
  language: 'hindi' | 'hinglish' | 'english';
  triggerReason: 'silence' | 'thought_complete' | 'emotional_signal' | 'speech_ended';
  timestamp: number;
  firstTokenMs?: number;
}

// ============================================
// Crisis Detection
// ============================================

export interface CrisisSignal {
  detected: boolean;
  keywords: string[];
  severity: 'high' | 'medium' | 'none';
  immediateAction: boolean;
}

// ============================================
// Session Configuration
// ============================================

export interface VoiceSessionConfig {
  vad: VADConfig;
  turnTaking: TurnTakingConfig;
  transcriptBuffer: {
    maxAgeMs: number;      // 180000 (3 minutes)
    maxChars: number;      // 2000
  };
  latencyTargets: {
    sttFirstTokenMs: number;      // 300
    llmFirstTokenMs: number;      // 1000
    ttsFirstAudioMs: number;      // 500
    totalMs: number;              // 3000
  };
}

// Default config
export const DEFAULT_VOICE_CONFIG: VoiceSessionConfig = {
  vad: {
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    minSpeechMs: 400,
    preSpeechPadMs: 80,
    redemptionMs: 160,
  },
  turnTaking: {
    silenceThresholdMs: Number(process.env.NEXT_PUBLIC_SILENCE_THRESHOLD_MS || 1000),
    minUserSpeechDurationMs: 200,
    interruptEnabled: true,
  },
  transcriptBuffer: {
    maxAgeMs: 180000,
    maxChars: 2000,
  },
  latencyTargets: {
    sttFirstTokenMs: 300,
    llmFirstTokenMs: 1000,
    ttsFirstAudioMs: 500,
    totalMs: 3000,
  },
};