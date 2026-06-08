export type TranscriptValidationResult =
  | { valid: true }
  | { valid: false; reason: 'too_short' | 'too_few_words'; fallback: string };

const MIN_CHARS = 10;
const MIN_WORDS = 2;
const FALLBACKS: Record<'hindi' | 'hinglish' | 'english', string> = {
  hindi: 'Main sun raha hoon. Aur batao.',
  hinglish: 'Main sun raha hoon. Thoda aur batao.',
  english: "I'm listening. Tell me more.",
};

export function validateTranscript(transcript: string, language: 'hindi' | 'hinglish' | 'english' = 'hinglish'): TranscriptValidationResult {
  const trimmed = transcript.trim();
  if (trimmed.length < MIN_CHARS) {
    return {
      valid: false,
      reason: 'too_short',
      fallback: FALLBACKS[language],
    };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORDS) {
    return {
      valid: false,
      reason: 'too_few_words',
      fallback: FALLBACKS[language],
    };
  }

  return { valid: true };
}
