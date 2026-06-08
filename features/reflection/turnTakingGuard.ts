/**
 * Turn-taking guard - enforces minimal reflection conditions.
 * Prevents eager responses to mere silence.
 */

export interface TurnTakingGuardResult {
  shouldReflect: boolean;
  reason: 'ok' | 'no_transcript' | 'incomplete_thought' | 'too_soon' | 'ai_speaking';
}

export function evaluateTurnTaking({
  transcript,
  silenceMs,
  isAISpeaking,
  lastReflectionTime,
  cooldownMs = 10000,
  silenceThresholdMs = 1000,
  earlyCommit,
  isDirectSpeech = false,
}: {
  transcript: string;
  silenceMs: number;
  isAISpeaking: boolean;
  lastReflectionTime: number;
  cooldownMs?: number;
  silenceThresholdMs?: number;
  earlyCommit?: { confidence?: number };
  isDirectSpeech?: boolean;
}): TurnTakingGuardResult {
  if (isAISpeaking) {
    return { shouldReflect: false, reason: 'ai_speaking' };
  }

  if (!transcript || transcript.trim().length === 0) {
    return { shouldReflect: false, reason: 'no_transcript' };
  }

  const now = Date.now();
  if (now - lastReflectionTime < cooldownMs) {
    return { shouldReflect: false, reason: 'too_soon' };
  }

  // Direct speech after VAD always reflects when cooldown passes
  if (isDirectSpeech) {
    return { shouldReflect: true, reason: 'ok' };
  }

  // Silence-triggered path: require threshold or high-confidence early commit
  if (silenceMs < silenceThresholdMs) {
    const trimmed = transcript.trim();
    if (
      earlyCommit &&
      typeof earlyCommit.confidence === 'number' &&
      earlyCommit.confidence >= 0.85 &&
      trimmed.length >= 8
    ) {
      return { shouldReflect: true, reason: 'ok' };
    }
    return { shouldReflect: false, reason: 'incomplete_thought' };
  }

  return { shouldReflect: true, reason: 'ok' };
}
