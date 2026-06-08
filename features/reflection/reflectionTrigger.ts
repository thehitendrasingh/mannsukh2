/**
 * Reflection Trigger Engine
 * Determines when AI should generate a reflection based on conversation state
 */

import { ReflectionContext } from '@/types/voice';

// Emotional signal keywords for triggering reflections
const EMOTIONAL_KEYWORDS = {
  hindi: [
    'अकेला', 'अकेली', 'उदास', 'निराश', 'परेशान', 'चिंता', 'डर', 'घबराहट',
    'दुखी', 'हतास', 'थक गया', 'थक गयी', 'समझ नहीं आ रहा', 'क्या करूं',
    'कोई नहीं', 'सब छोड़ दिया', 'हार गया', 'हार गयी'
  ],
  hinglish: [
    'alone', 'lonely', 'udaas', 'niraash', 'pareshaan', 'chinta', 'dar', 'ghabrahat',
    'dukhi', 'hataash', 'thak gaya', 'thak gayi', 'samajh nahi aa raha', 'kya karun',
    'koi nahi', 'sab chhod diya', 'haar gaya', 'haar gyi',
    'overwhelmed', 'anxious', 'scared', 'confused', 'lost', 'stuck', 'helpless',
    'worthless', 'hopeless', 'giving up', 'can\'t take it', 'breaking down'
  ],
  english: [
    'alone', 'lonely', 'sad', 'depressed', 'worried', 'anxious', 'scared', 'afraid',
    'overwhelmed', 'confused', 'lost', 'stuck', 'helpless', 'worthless', 'hopeless',
    'giving up', 'can\'t take it', 'breaking down', 'don\'t know what to do',
    'nobody understands', 'nobody cares', 'tired of everything', 'want to disappear',
    'end it all', 'hurt myself', 'kill myself', 'suicide', 'self harm'
  ],
};

export interface TriggerResult {
  shouldTrigger: boolean;
  reason: 'silence' | 'thought_complete' | 'emotional_signal' | 'speech_ended' | 'none';
  confidence: number;
  detectedSignals: string[];
}

export interface ReflectionTriggerConfig {
  silenceThresholdMs: number;        // 2500ms default
  thoughtCompleteKeywords: string[]; // Words indicating thought completion
  emotionalKeywords: string[];
  minContextChars: number;           // Minimum transcript length for reflection
  cooldownMs: number;                // Minimum time between reflections
}

export const DEFAULT_REFLECTION_TRIGGER_CONFIG: ReflectionTriggerConfig = {
  silenceThresholdMs: 2500,
  thoughtCompleteKeywords: [
    'so', 'therefore', 'basically', 'in short', 'to sum up',
    'मतलब', 'सीधे शब्दों में', 'कुल मिलाकर',
    'yaar', 'bas', 'chalo', 'theek hai', 'chalta hai',
    'anyway', 'whatever', 'never mind', 'bhool jao'
  ],
  emotionalKeywords: [
    ...EMOTIONAL_KEYWORDS.hindi,
    ...EMOTIONAL_KEYWORDS.hinglish,
    ...EMOTIONAL_KEYWORDS.english,
  ],
  minContextChars: 50,
  cooldownMs: 10000, // 10 seconds between reflections
};

export class ReflectionTrigger {
  private config: ReflectionTriggerConfig;
  private lastReflectionTime = 0;
  private lastSilenceTriggerTime = 0;

  constructor(config?: Partial<ReflectionTriggerConfig>) {
    this.config = { ...DEFAULT_REFLECTION_TRIGGER_CONFIG, ...config };
  }

  // Check if reflection should be triggered
  // forceTrigger: when true, bypasses all trigger checks (used for direct speech response)
  checkTrigger(context: ReflectionContext, forceTrigger: boolean = false): TriggerResult {
    const now = Date.now();

    // Check cooldown (skip if forceTrigger)
    if (!forceTrigger && now - this.lastReflectionTime < this.config.cooldownMs) {
      return { shouldTrigger: false, reason: 'none', confidence: 0, detectedSignals: [] };
    }

    // Force trigger for direct speech response (e.g., after VAD speech ends)
    if (forceTrigger) {
      this.lastReflectionTime = now;
      return {
        shouldTrigger: true,
        reason: 'speech_ended',
        confidence: 0.9,
        detectedSignals: ['user_speech_completed'],
      };
    }

    // 1. Check silence trigger (user paused for threshold duration)
    if (context.silenceDurationMs >= this.config.silenceThresholdMs) {
      // Prevent rapid re-triggering on same silence
      if (now - this.lastSilenceTriggerTime > this.config.cooldownMs) {
        this.lastReflectionTime = now;
        this.lastSilenceTriggerTime = now;
        return {
          shouldTrigger: true,
          reason: 'silence',
          confidence: 0.8,
          detectedSignals: ['user_pause'],
        };
      }
    }

    // 2. Check thought completion trigger
    const thoughtComplete = this.checkThoughtCompletion(context.recentTranscript);
    if (thoughtComplete.detected) {
      this.lastReflectionTime = now;
      return {
        shouldTrigger: true,
        reason: 'thought_complete',
        confidence: thoughtComplete.confidence,
        detectedSignals: thoughtComplete.signals,
      };
    }

    // 3. Check emotional signal trigger
    const emotionalSignal = this.checkEmotionalSignal(context.recentTranscript);
    if (emotionalSignal.detected) {
      this.lastReflectionTime = now;
      return {
        shouldTrigger: true,
        reason: 'emotional_signal',
        confidence: emotionalSignal.confidence,
        detectedSignals: emotionalSignal.signals,
      };
    }

    return { shouldTrigger: false, reason: 'none', confidence: 0, detectedSignals: [] };
  }

  private checkThoughtCompletion(transcript: string): { detected: boolean; confidence: number; signals: string[] } {
    const lower = transcript.toLowerCase();
    const signals: string[] = [];

    for (const keyword of this.config.thoughtCompleteKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        signals.push(keyword);
      }
    }

    // Also check for sentence-ending patterns
    const endsWithPeriod = /[.!?]\s*$/.test(transcript.trim());
    const hasConjunction = /\b(but|however|although|though|par|lekin|magar)\b/i.test(transcript);

    if (signals.length > 0 || (endsWithPeriod && hasConjunction)) {
      return {
        detected: true,
        confidence: signals.length > 0 ? 0.7 : 0.5,
        signals,
      };
    }

    return { detected: false, confidence: 0, signals: [] };
  }

  private checkEmotionalSignal(transcript: string): { detected: boolean; confidence: number; signals: string[] } {
    const lower = transcript.toLowerCase();
    const signals: string[] = [];

    for (const keyword of this.config.emotionalKeywords) {
      if (lower.includes(keyword.toLowerCase())) {
        signals.push(keyword);
      }
    }

    if (signals.length > 0) {
      // Higher confidence for multiple signals or high-severity keywords
      const highSeverity = signals.some(s => 
        ['suicide', 'kill myself', 'self harm', 'आत्महत्या', 'मारना'].some(h => s.includes(h))
      );
      
      return {
        detected: true,
        confidence: highSeverity ? 0.95 : Math.min(0.8, 0.4 + signals.length * 0.1),
        signals,
      };
    }

    return { detected: false, confidence: 0, signals: [] };
  }

  // Reset trigger state (for new session)
  reset(): void {
    this.lastReflectionTime = 0;
    this.lastSilenceTriggerTime = 0;
  }

  // Update config
  updateConfig(config: Partial<ReflectionTriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Factory function
export function createReflectionTrigger(config?: Partial<ReflectionTriggerConfig>): ReflectionTrigger {
  return new ReflectionTrigger(config);
}