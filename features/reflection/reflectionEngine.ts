/**
 * Reflection Engine
 * Generates natural, conversational AI reflections based on user context
 * Routes LLM calls through server-side API to keep API key secure
 */

import { Reflection, ReflectionContext } from '@/types/voice';
import { ReflectionTrigger, createReflectionTrigger } from './reflectionTrigger';
import { CrisisDetector, createCrisisDetector } from '@/features/safety/crisisDetection';
import { detectLanguage } from '@/lib/language/detectLanguage';
import { stripReasoning, hasReasoningTags } from '@/lib/utils/stripReasoning';

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

  constructor(config?: Partial<ReflectionEngineConfig>) {
    this.config = { ...DEFAULT_REFLECTION_ENGINE_CONFIG, ...config };
    this.trigger = createReflectionTrigger();
    this.crisisDetector = createCrisisDetector();
  }

// Main entry point: check if reflection needed and generate if so
   // isDirectSpeech: when true, always triggers reflection (for direct speech response)
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

     // 2. Check if reflection should trigger
     const triggerResult = this.trigger.checkTrigger(context, isDirectSpeech);
     
     if (!triggerResult.shouldTrigger) {
       return {};
     }

    // 3. Generate reflection via Qwen
    const reflection = await this.generateReflection(context, triggerResult);
    
    if (reflection) {
      return { reflection };
    }

    return {};
  }

// Generate reflection via server-side API (keeps API key secure)
    private async generateReflection(
      context: ReflectionContext,
      triggerResult: { reason: string; confidence: number; detectedSignals: string[] }
    ): Promise<Reflection | null> {
      try {
        console.log('[ReflectionEngine] Calling /api/voice/stream for transcript:', context.recentTranscript.substring(0, 50));
        
        const body: Record<string, unknown> = {
          transcript: context.recentTranscript,
          language: context.userLanguage,
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
          return this.getFallbackReflection(context, triggerResult);
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
      // Remove any markdown, quotes, or formatting
      let cleaned = text
        .replace(/^["'`]+|["'`]+$/g, '') // Remove surrounding quotes
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove italic
        .trim();

      // Ensure it's not too long (roughly 60 words)
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
    // Pre-written fallbacks by language and trigger
    const fallbacks: Record<string, Record<string, string[]>> = {
      silence: {
        hinglish: [
          "Lag raha hai kuch baatein abhi bhi andar hain, jo bahar nahi aayi.",
          "Kuch soch rahe ho jo kehna mushkil lag raha hai.",
          "Silence bhi kuch kehti hai. Kya chal raha hai andar?",
        ],
        english: [
          "Seems like there's more you want to say but haven't found the words yet.",
          "Sometimes the quiet holds the most. What's on your mind?",
          "There's something underneath that silence. Want to share?",
        ],
        hindi: [
          "Lagta hai kuch baatein abhi bhi andar hain, jo bahar nahi aayin.",
          "Kuch soch rahe ho jo kehna mushkil lag raha hai.",
          "Chuppi bhi kuch kehti hai. Kya chal raha hai andar?",
        ],
      },
      speech_ended: {
        hinglish: [
          "Samjha? Maine kuch socha tumhare baare mein.",
          "Tumhari baat sunke kuch palla - batao kya tumhe yehi lagta hai?",
          "Interesting... Kya tum isme khud ko reflect kar pa rahe ho?",
        ],
        english: [
          "I heard you. What stands out to me is...",
          "Something in what you said made me think...",
          "I'm curious - what does this bring up for you?",
        ],
        hindi: [
          "Sun liya. Tumhare shabdon ne kuch kaha.",
          "Kuch samajh aaya jo andar chhupa hai.",
          "Tumhe kya lagta hai is baare mein?",
        ],
      },
      thought_complete: {
        hinglish: [
          "Samajh aata hai - yeh baat tumhare liye important hai.",
          "Yeh thought complete hua, lekin lagta hai iske peeche kuch aur bhi hai.",
          "Sawal sahi poocha hai khud se. Jawab dhundhna mushkil hai.",
        ],
        english: [
          "That feels like an important realization. What does it mean for you?",
          "You've named something real. How does that sit with you?",
          "Good question to ask yourself. The answer might take time.",
        ],
        hindi: [
          "Samajh aata hai - yeh baat tumhare liye important hai.",
          "Yeh thought complete hua, lekin lagta hai iske peeche kuch aur bhi hai.",
          "Sawal sahi poocha hai khud se. Jawab dhundhna mushkil hai.",
        ],
      },
      emotional_signal: {
        hinglish: [
          "Ye feelings heavy lag rahi hain. Tum is mein akela nahi ho.",
          "Dard samajh aata hai. Koi bhi isse guzre to aisa hi mehsoos karega.",
          "Ye sab feel karna normal hai. Khud ko blame mat karo.",
        ],
        english: [
          "These feelings are heavy. You're not alone in carrying them.",
          "That pain makes sense. Anyone would feel this way in your situation.",
          "It's okay to feel this way. Don't blame yourself for it.",
        ],
        hindi: [
          "Ye feelings heavy lag rahi hain. Tum is mein akela nahi ho.",
          "Dard samajh aata hai. Koi bhi isse guzre to aisa hi mehsoos karega.",
          "Ye sab feel karna normal hai. Khud ko blame mat karo.",
        ],
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
