/**
 * Language hint utilities for STT engine.
 * Returns explicit language hints to improve transcription accuracy.
 */

export type SupportedLanguage = 'hindi' | 'hinglish' | 'english';

/**
 * Map our internal language to STT language hint.
 * - hindi/ hinglish → 'hi' (Hindi voice)
 * - english → 'en'
 */
export function getSTTLanguageHint(lang: SupportedLanguage): string {
  switch (lang) {
    case 'hindi':
    case 'hinglish':
      return 'hi';
    case 'english':
      return 'en';
    default:
      return 'hi';
  }
}
