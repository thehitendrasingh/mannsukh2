/**
 * Reflection Engine V2
 * Generates natural, conversational AI reflections based on user context.
 * V2: Routes through IntentRouter first — only calls Qwen for DEEP_CONVERSATION.
 * Simple intents return direct pre-written responses (no LLM call).
 */

import { Reflection, ReflectionContext } from '@/types/voice';
import { ReflectionTrigger, createReflectionTrigger } from './reflectionTrigger';
import { CrisisDetector, createCrisisDetector } from '@/features/safety/crisisDetection';
import { detectLanguage } from '@/lib/language/detectLanguage';
import { stripReasoning, hasReasoningTags } from '@/lib/utils/stripReasoning';
import { 
  routeIntent, 
  IntentType, 
  RouterOutput,
  IntentResult 
} from '@/features/conversation/intentRouter';
import {
  ConversationStage,
  ConversationState,
  createConversationState,
  advanceTurn,
  getStageConfig,
} from '@/features/conversation/conversationStage';
import { getDirectResponse, ResponseLanguage } from '@/features/conversation/responses';

export interface ReflectionEngineConfig {
  maxReflectionWords: number;
  enableStreaming: boolean;
}

export const DEFAULT_REFLECTION_ENGINE_CONFIG: ReflectionEngineConfig = {
  maxReflectionWords: 60,
  enableStreaming: true,
};

export class ReflectionEngine {
  private trigger: ReflectionTrigger;
  private crisisDetector: CrisisDetector;
  private config: ReflectionEngineConfig;
  private lastUserLanguage: 'hindi' | 'hinglish' | 'english' = 'hinglish';
  private conversationState: ConversationState = createConversationState();

  constructor(config?: Partial<ReflectionEngineConfig>) {
    this.config = { ...DEFAULT_REFLECTION_ENGINE_CONFIG, ...config };
    this.trigger = createReflectionTrigger();
    this.crisisDetector = createCrisisDetector();
  }

  // Main entry point: route transcript through Intent Router
  async processContext(context: ReflectionContext, isDirectSpeech: boolean = false): Promise<{
    reflection?: Reflection;
    crisis?: { detected: boolean; message: string; resources: any[] };
  }> {
    // Update language detection
    this.lastUserLanguage = detectLanguage(context.recentTranscript) || this.lastUserLanguage;
    context.userLanguage = this.lastUserLanguage;

    // 1. Crisis check (highest priority)
    const crisisSignal = this.crisisDetector.detect(context.recentTranscript);
    if (crisisSignal.detected && crisisSignal.severity === 'high') {
      const crisisMessage = CrisisDetector.getCrisisMessage(this.lastUserLanguage);
      const resources = CrisisDetector.getCrisisResources();
      return {
        crisis: {
          detected: true,
          message: crisisMessage,
          resources,
        },
      };
    }

    // 2. Route through Intent Router
    const routeResult: RouterOutput = routeIntent({
      transcript: context.recentTranscript,
    });
    
    const stageConfig = getStageConfig(this.conversationState);
    
    console.log(`[ReflectionEngine] Intent: ${routeResult.intent.type} | Stage: ${this.conversationState.currentStage} | Qwen: ${routeResult.intent.qwenRequired ? 'YES' : 'SKIPPED'}`);

    // 3. If Qwen is NOT required, return direct response
    if (!routeResult.intent.qwenRequired) {
      // Build the response key as string (matching IntentType enum values)
      const directResponse = getDirectResponse(
        routeResult.intent.type as string,
        this.mapLanguage(this.lastUserLanguage)
      );
      
      if (directResponse) {
        // Advance turn for stage tracking
        this.conversationState = advanceTurn(this.conversationState);
        
        return {
          reflection: {
            id: `refl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: directResponse,
            language: this.lastUserLanguage,
            triggerReason: 'speech_ended',
            timestamp: Date.now(),
            firstTokenMs: 0,
          },
        };
      }
    }

    // 4. Check if reflection should trigger (for Qwen path only)
    const triggerResult = this.trigger.checkTrigger(context, isDirectSpeech);
    
    if (!triggerResult.shouldTrigger && !routeResult.intent.qwenRequired) {
      return {};
    }

    // 5. Generate reflection via Qwen (only for DEEP_CONVERSATION)
    const reflection = await this.generateReflection(context, triggerResult, stageConfig);
    
    if (reflection) {
      this.conversationState = advanceTurn(this.conversationState);
      return { reflection };
    }

    return {};
  }

  private mapLanguage(lang: 'hindi' | 'hinglish' | 'english'): ResponseLanguage {
    return lang;
  }

  // Generate reflection via server-side API
  private async generateReflection(
    context: ReflectionContext,
    triggerResult: { reason: string; confidence: number; detectedSignals: string[] },
    stageConfig: {
      behaviors: {
        allowReflection: boolean;
        allowAnalysis: boolean;
        maxWords: number;
        style: string;
      };
    }
  ): Promise<Reflection | null> {
    try {
      console.log('[ReflectionEngine] Calling /api/voice/stream for transcript:', context.recentTranscript.substring(0, 50));
      
      const body: Record<string, unknown> = {
        transcript: context.recentTranscript,
        language: context.userLanguage,
        stage: this.conversationState.currentStage,
        stageStyle: stageConfig.behaviors.style,
        maxWords: stageConfig.behaviors.maxWords,
      };
      
      // Pass turnId for per-turn latency tracking
      if (context.turnId) {
        body.turnId = context.turnId;
      }
      
      const response = await fetch('/api/voice/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[ReflectionEngine] API error:', response.status, errorData);
        // Fall back to stage-appropriate direct response
        return {
          id: `refl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: stageConfig.behaviors.style === 'curious' 
            ? "Main yahan hoon. Sun raha hoon."
            : "Kuch samajh nahi aaya. Phir se kaho?",
          language: this.lastUserLanguage,
          triggerReason: triggerResult.reason as 'silence' | 'thought_complete' | 'emotional_signal' | 'speech_ended',
          timestamp: Date.now(),
          firstTokenMs: undefined,
        };
      }

      const data = await response.json();
      const content = data.reflection?.trim() || '';
      const firstTokenMs = typeof data.firstTokenMs === 'number' ? data.firstTokenMs : undefined;

      if (!content) {
        return this.getFallbackReflection(context, triggerResult);
      }

      // Clean and validate response
      const cleanedReflection = this.cleanReflection(content);

      return {
        id: `refl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: cleanedReflection,
        language: this.lastUserLanguage,
        triggerReason: triggerResult.reason as 'silence' | 'thought_complete' | 'emotional_signal' | 'speech_ended',
        timestamp: Date.now(),
        firstTokenMs,
      };
    } catch (error) {
      console.error('[ReflectionEngine] Generation error:', error);
      return this.getFallbackReflection(context, triggerResult);
    }
  }

  private cleanReflection(text: string): string {
    let cleaned = text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .trim();

    const words = cleaned.split(/\s+/);
    if (words.length > 70) {
      cleaned = words.slice(0, 70).join(' ') + '...';
    }

    return cleaned;
  }

  private getFallbackReflection(
    context: ReflectionContext,
    triggerResult: { reason: string; detectedSignals: string[] }
  ): Reflection {
    const fallbacks: Record<string, Record<string, string[]>> = {
      silence: {
        hinglish: [
          "Lag raha hai kuch baatein abhi bhi andar hain.",
          "Kuch soch rahe ho?",
          "Chuppi bhi kuch kehti hai.",
        ],
        english: [
          "Seems like there's more you want to say.",
          "What's on your mind?",
          "Sometimes the quiet holds the most.",
        ],
        hindi: [
          "लगता है कुछ बातें अब भी अंदर हैं।",
          "कुछ सोच रहे हो?",
          "चुप्पी भी कुछ कहती है।",
        ],
      },
      speech_ended: {
        hinglish: ["Main yahan hoon. Sun raha hoon."],
        english: ["I'm here. I'm listening."],
        hindi: ["मैं यहाँ हूँ। सुन रहा हूँ।"],
      },
      thought_complete: {
        hinglish: ["Samajh aata hai."],
        english: ["I understand."],
        hindi: ["समझ आता है।"],
      },
      emotional_signal: {
        hinglish: ["Main yahan hoon. Batao."],
        english: ["I'm here. Tell me."],
        hindi: ["मैं यहाँ हूँ। बताओ।"],
      },
    };

    const langFallbacks = fallbacks[triggerResult.reason]?.[this.lastUserLanguage] 
      || fallbacks[triggerResult.reason]?.hinglish 
      || ['Main yahan hoon. Sun raha hoon.'];
    
    const randomIndex = Math.floor(Math.random() * langFallbacks.length);
    
    return {
      id: `refl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: langFallbacks[randomIndex],
      language: this.lastUserLanguage,
      triggerReason: triggerResult.reason as 'silence' | 'thought_complete' | 'emotional_signal' | 'speech_ended',
      timestamp: Date.now(),
      firstTokenMs: undefined,
    };
  }

  // Reset for new session
  reset(): void {
    this.trigger.reset();
    this.lastUserLanguage = 'hinglish';
    this.conversationState = createConversationState();
  }

  // Update config
  updateConfig(config: Partial<ReflectionEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Factory function
export function createReflectionEngine(config?: Partial<ReflectionEngineConfig>): ReflectionEngine {
  return new ReflectionEngine(config);
}