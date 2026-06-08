/**
 * Language detection utility.
 * Returns explicit language codes for STT, prompt context, and TTS.
 */

export type SupportedLanguage = 'hindi' | 'english' | 'hinglish';

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const TAMIL_RE = /[\u0B80-\u0BFF]/;
const URDU_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;
const HINGLISH_WORDS = [
  'yaar', 'lagta', 'hai', 'mein', 'kya', 'aur', 'toh', 'hi', 'bhai',
  'nahi', 'raha', 'meri', 'mera', 'karne', 'kar', 'kuch', 'hoga', 'sab', 'aage',
  'pareshan', 'chinta', 'udaas', 'niraash', 'samajh', 'soch', 'feel', 'feeling',
  'overwhelmed', 'anxious', 'confused', 'stuck', 'lost', 'helpless',
  'bas', 'chalo', 'theek', 'achha', 'accha', 'wala', 'wali', 'wale',
  'kaisa', 'kaise', 'kyun', 'kyon', 'kahan', 'kab', 'kon', 'kaun',
  'dil', 'mann', 'dimag', 'soch', 'feel', 'zindagi', 'life', 'duniya',
  'log', 'bandey', 'dost', 'yaaron', 'family', 'parents', 'mummy', 'papa',
];

export function detectLanguage(text: string): SupportedLanguage {
  const trimmed = text.trim();
  if (!trimmed) return 'english';

  const hasDevanagari = DEVANAGARI_RE.test(trimmed);
  const hasTamil = TAMIL_RE.test(trimmed);
  const hasUrdu = URDU_RE.test(trimmed);
  const hasLatin = LATIN_RE.test(trimmed);

  // Devanagari-dominant
  const devanagariCount = (trimmed.match(/[\u0900-\u097F]/g) || []).length;
  const totalChars = trimmed.replace(/\s/g, '').length || 1;
  const devanagariRatio = devanagariCount / totalChars;

  // English-dominant
  const latinCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  const latinRatio = latinCount / totalChars;

  if (devanagariRatio >= 0.7) {
    const lower = trimmed.toLowerCase();
    const hinglishCount = HINGLISH_WORDS.filter(w => lower.includes(w)).length;
    if (hinglishCount >= 2 && latinCount > 0) {
      return 'hinglish';
    }
    return 'hindi';
  }

  if (latinRatio >= 0.9) {
    return 'english';
  }

  // Mixed
  if (hasLatin && (hasDevanagari || hasTamil || hasUrdu)) {
    return 'hinglish';
  }

  if (hasDevanagari || hasTamil || hasUrdu) {
    return 'hindi';
  }

  return 'english';
}

export function detectLanguageWithHint(text: string, hint?: SupportedLanguage): SupportedLanguage {
  const detected = detectLanguage(text);
  if (hint && (hint === 'hindi' || hint === 'hinglish' || hint === 'english')) {
    return hint;
  }
  return detected;
}
