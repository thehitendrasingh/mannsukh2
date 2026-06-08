/**
 * Confidence gate for ASR results.
 * Blocks low-confidence transcripts from reaching the LLM.
 */

export interface ConfidenceGateResult {
  shouldProcess: boolean;
  reason: 'ok' | 'low_confidence' | 'too_short' | 'likely_noise';
  clarification?: string;
}

const MIN_CONFIDENCE = 0.7;
const MIN_CHARS = 4;

// Common noise patterns / filler likely to be ASR artifacts
const NOISE_PATTERNS = [
  /^(hm+|uh+|ah+|um+)$/i,
  /^\.{2,}$/,
  /^[,.\s]+$/,
];

export function evaluateConfidence(transcript: string, confidence?: number): ConfidenceGateResult {
  const trimmed = transcript.trim();

  if (NOISE_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return {
      shouldProcess: false,
      reason: 'likely_noise',
      clarification: 'Mujhe lagta hai main aapki baat poori tarah samajh nahi paaya. Ek baar phir se bataoge?',
    };
  }

  if (trimmed.length < MIN_CHARS) {
    return {
      shouldProcess: false,
      reason: 'too_short',
      clarification: 'Thoda aur batao, main sun raha hoon.',
    };
  }

  if (typeof confidence === 'number' && confidence < MIN_CONFIDENCE) {
    return {
      shouldProcess: false,
      reason: 'low_confidence',
      clarification: 'Mujhe lagta hai main aapki baat poori tarah samajh nahi paaya. Ek baar phir se bataoge?',
    };
  }

  return { shouldProcess: true, reason: 'ok' };
}
