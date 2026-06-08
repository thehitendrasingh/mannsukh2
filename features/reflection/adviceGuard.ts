/**
 * Advice guard - prevents MannSukh from becoming a coach/assistant.
 */

export interface AdviceResult {
  isAdviceSeeking: boolean;
  category?: 'instruction' | 'recommendation' | 'task' | 'general';
}

const ADVICE_PATTERNS = [
  /\b(suggest|recommend|what should i|what can i|how do i|how to|steps to|tips for|ideas for|help me with|can you tell me|tell me what|what do i do|best way to|ways to|list of)\b/i,
  /\b(meal|food|diet|exercise|workout|routine|schedule|plan|habits|productivity|focus|sleep|study)\b/i,
  /\b(should i eat|should i drink|should i sleep|should i workout|should i study)\b/i,
];

export function detectAdviceSeeking(transcript: string): AdviceResult {
  const normalized = transcript.toLowerCase();

  for (const pattern of ADVICE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isAdviceSeeking: true,
        category: 'instruction',
      };
    }
  }

  return { isAdviceSeeking: false };
}
