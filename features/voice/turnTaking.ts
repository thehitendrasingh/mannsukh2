/**
 * Turn Taking Engine
 * Manages conversation flow: user always has priority, AI never talks over user
 */

import { Speaker, Turn, TurnTakingState, TurnTakingConfig, DEFAULT_VOICE_CONFIG } from '@/types/voice';

function generateTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface TurnTakingCallbacks {
  onUserTurnStart: (turn: Turn) => void;
  onUserTurnEnd: (turn: Turn) => void;
  onAITurnStart: (turn: Turn) => void;
  onAITurnEnd: (turn: Turn) => void;
  onInterruption: (interruptedTurn: Turn) => void;
  onSilenceThresholdReached: (silenceDurationMs: number) => void;
}

export class TurnTakingEngine {
  private state: TurnTakingState = {
    currentSpeaker: null,
    userIsSpeaking: false,
    aiIsSpeaking: false,
    lastUserSpeechEnd: 0,
    silenceDurationMs: 0,
    interrupted: false,
  };

  private config: TurnTakingConfig;
  private callbacks: TurnTakingCallbacks;
  private silenceCheckInterval: NodeJS.Timeout | null = null;
  private currentTurn: Turn | null = null;
  private aiTurnStartTime = 0;

  constructor(callbacks: TurnTakingCallbacks, config?: Partial<TurnTakingConfig>) {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_VOICE_CONFIG.turnTaking, ...config };
  }

  // User starts speaking
  onUserSpeechStart(): void {
    const wasAISpeaking = this.state.aiIsSpeaking;
    
    this.state.userIsSpeaking = true;
    this.state.currentSpeaker = 'user';
    this.state.lastUserSpeechEnd = 0;
    this.state.silenceDurationMs = 0;

    // If AI was speaking, interrupt it
    if (wasAISpeaking && this.config.interruptEnabled) {
      this.state.interrupted = true;
      if (this.currentTurn) {
        this.callbacks.onInterruption(this.currentTurn);
        this.currentTurn.isComplete = true;
      }
      this.state.aiIsSpeaking = false;
    }

    // Start new user turn
    this.currentTurn = {
      id: generateTurnId(),
      speaker: 'user',
      text: '',
      timestamp: Date.now(),
      isComplete: false,
    };

    this.callbacks.onUserTurnStart(this.currentTurn);
    this.startSilenceMonitoring();
  }

  // User speech continues (partial transcript)
  onUserSpeechPartial(text: string): void {
    if (this.currentTurn && this.currentTurn.speaker === 'user') {
      this.currentTurn.text = text;
    }
  }

  // User stops speaking
  onUserSpeechEnd(durationMs: number): void {
    this.state.userIsSpeaking = false;
    this.state.lastUserSpeechEnd = Date.now();
    
    if (this.currentTurn && this.currentTurn.speaker === 'user') {
      this.currentTurn.isComplete = true;
      this.callbacks.onUserTurnEnd(this.currentTurn);
    }

    // Always allow silence monitoring to fire; short utterances are
    // filtered by the reflection trigger's minContextChars check.
    // Resetting lastUserSpeechEnd here previously broke the silence
    // monitor for the entire turn, preventing the AI from ever responding.
  }

  // AI starts speaking
  onAISpeechStart(text: string = ''): void {
    this.state.aiIsSpeaking = true;
    this.state.currentSpeaker = 'ai';
    this.aiTurnStartTime = Date.now();

    this.currentTurn = {
      id: generateTurnId(),
      speaker: 'ai',
      text,
      timestamp: Date.now(),
      isComplete: false,
    };

    this.callbacks.onAITurnStart(this.currentTurn);
    this.stopSilenceMonitoring();
  }

  // AI speech continues (streaming tokens)
  onAISpeechToken(token: string): void {
    if (this.currentTurn && this.currentTurn.speaker === 'ai') {
      this.currentTurn.text += token;
    }
  }

  // AI finishes speaking
  onAISpeechEnd(): void {
    this.state.aiIsSpeaking = false;
    this.state.currentSpeaker = null;

    if (this.currentTurn && this.currentTurn.speaker === 'ai') {
      this.currentTurn.isComplete = true;
      this.callbacks.onAITurnEnd(this.currentTurn);
    }
  }

  // Check if user interrupted AI
  checkInterruption(): boolean {
    if (this.state.aiIsSpeaking && this.state.userIsSpeaking && this.config.interruptEnabled) {
      this.state.interrupted = true;
      if (this.currentTurn) {
        this.callbacks.onInterruption(this.currentTurn);
      }
      this.state.aiIsSpeaking = false;
      return true;
    }
    return false;
  }

  // Get current silence duration
  getSilenceDuration(): number {
    if (this.state.lastUserSpeechEnd === 0) return 0;
    return Date.now() - this.state.lastUserSpeechEnd;
  }

  // Start monitoring silence for reflection triggers
  private startSilenceMonitoring(): void {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }

    this.silenceCheckInterval = setInterval(() => {
      const silenceMs = this.getSilenceDuration();
      this.state.silenceDurationMs = silenceMs;

      if (silenceMs >= this.config.silenceThresholdMs && silenceMs > 0) {
        this.callbacks.onSilenceThresholdReached(silenceMs);
        this.stopSilenceMonitoring();
      }
    }, 200); // Check every 200ms for 1s threshold
  }

  stopSilenceMonitoring(): void {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
  }

  // Get current state
  getState(): TurnTakingState {
    return { ...this.state };
  }

  // Reset for new session
  reset(): void {
    this.stopSilenceMonitoring();
    this.state = {
      currentSpeaker: null,
      userIsSpeaking: false,
      aiIsSpeaking: false,
      lastUserSpeechEnd: 0,
      silenceDurationMs: 0,
      interrupted: false,
    };
    this.currentTurn = null;
  }

  // Check if AI should yield to user
  shouldYieldToUser(): boolean {
    return this.state.userIsSpeaking && this.state.aiIsSpeaking && this.config.interruptEnabled;
  }

  // Get current turn
  getCurrentTurn(): Turn | null {
    return this.currentTurn;
  }
}

// Factory function
export function createTurnTakingEngine(
  callbacks: TurnTakingCallbacks,
  config?: Partial<TurnTakingConfig>
): TurnTakingEngine {
  return new TurnTakingEngine(callbacks, config);
}