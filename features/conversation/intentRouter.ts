/**
 * Intent Router V3 — AI First, Router Only For Edge Cases
 * 
 * The router intercepts ONLY:
 * 1. CRISIS (safety)
 * 2. GREETING (hello, namaste)
 * 3. CLARIFICATION (matlab, kya?)
 * 4. LOW_CONFIDENCE (gibberish, empty, sttConfidence < 0.6)
 * 
 * EVERYTHING ELSE → CONVERSATION → Qwen.
 * 
 * Qwen should handle ~90% of messages.
 * Router should handle ~10%.
 */

export enum IntentType {
  /** suicide, self-harm, immediate danger */
  CRISIS = 'CRISIS',
  /** hello, hi, hey, namaste, helo mannsukh */
  GREETING = 'GREETING',
  /** matlab, kya, what, samjha nahi */
  CLARIFICATION = 'CLARIFICATION',
  /** gibberish, empty, low STT confidence */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  /** Everything else → Qwen */
  CONVERSATION = 'CONVERSATION',
}

export interface IntentResult {
  type: IntentType;
  confidence: number;
  qwenRequired: boolean;
  matchedPattern?: string;
}

// ============================================================
// 1. CRISIS DETECTION
// ============================================================
const CRISIS_PATTERNS = [
  /suicide|kill myself|end my life|want to die/i,
  /self.?harm|hurt myself|cut myself/i,
  /don't want to live/i,
  /kill me|death/i,
  /mar jaana|mar jana|marna chahta|marna chahti/i,
  /khudkushi|aakhatma/i,
];

function matchCrisis(text: string): IntentResult | null {
  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      return { type: IntentType.CRISIS, confidence: 0.95, qwenRequired: false, matchedPattern: 'crisis' };
    }
  }
  return null;
}

// ============================================================
// 2. GREETING DETECTION
// ============================================================
const GREETING_PATTERNS = [
  /^(hi|hii|hiii|hello|helo|heloo|hey|heyy|heyyy)\b/i,
  /^(namaste|namaskar|namaskaram|pranam|pranaam)\b/i,
  /^(good\s*morning|good\s*afternoon|good\s*evening|good\s*night)/i,
  /^(sup|what'?s\s*up|wassup|yo|heyya)\b/i,
  /^(hello|helo|hii?|hey)\s+(mannsukh|mansukh|manusukh)/i,
  /^mannsukh\b/i,
  /^नमस्ते|नमस्कार|प्रणाम|हेलो|हाय|हैलो/i,
  /^हाय\s+मनसूख|हेलो\s+मनसूख|हैलो\s+मनसूख/i,
  /^मनसूख\b/i,
];

function matchGreeting(text: string): IntentResult | null {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(clean) || pattern.test(lower)) {
      return { type: IntentType.GREETING, confidence: 0.95, qwenRequired: false, matchedPattern: 'greeting' };
    }
  }
  return null;
}

// ============================================================
// 3. CLARIFICATION DETECTION
// ============================================================
const CLARIFICATION_PATTERNS = [
  /^(matlab|matalab|kya|kaise)\s*$/i,
  /^(what|wot)\s*$/i,
  /^(samajh\s*nah|samajh\s*mein\s*nah|nahi\s*samajh)/i,
  /^(clear\s*nah|nhi\s*samajh|clear\s*nahi)/i,
  /^(phir\s*se|ek\s*baar\s*phir|dobaara|repeat)/i,
  /^(sahi\s*se\s*sun|sahi\s*se\s*bol)/i,
  /^मतलब|क्या|समझ\s*नहीं|समझा\s*नहीं/i,
  /^किस\s*बात\s*का|कौन\s*सी/i,
  /^फिर\s*से|एक\s*बार\s*फिर/i,
];

function matchClarification(text: string): IntentResult | null {
  const clean = text.trim().toLowerCase();
  const wc = clean.split(/\s+/).filter(Boolean).length;
  if (wc > 4) return null; // Longer than 4 words is unlikely to be just clarification
  
  for (const pattern of CLARIFICATION_PATTERNS) {
    if (pattern.test(clean) || pattern.test(text.trim())) {
      return { type: IntentType.CLARIFICATION, confidence: 0.85, qwenRequired: false, matchedPattern: 'clarification' };
    }
  }
  return null;
}

// ============================================================
// 4. LOW CONFIDENCE DETECTION
// ============================================================
function isGibberish(text: string): boolean {
  const hasRepeats = /([a-zA-Z\u0900-\u097F])\1{3,}/.test(text);
  if (hasRepeats) return true;
  const vowels = /[aeiouAEIOU\u0905-\u090B\u090F-\u0911\u093E-\u0941]/;
  const vowelCount = (text.match(vowels) || []).length;
  if (text.length > 5 && vowelCount === 0) return true;
  return false;
}

function matchLowConfidence(text: string, sttConfidence?: number): IntentResult | null {
  const clean = text.trim();
  
  if (!clean || clean.length === 0) {
    return { type: IntentType.LOW_CONFIDENCE, confidence: 0, qwenRequired: false, matchedPattern: 'empty' };
  }
  
  if (typeof sttConfidence === 'number' && sttConfidence < 0.6) {
    return { type: IntentType.LOW_CONFIDENCE, confidence: sttConfidence, qwenRequired: false, matchedPattern: 'low_stt_confidence' };
  }
  
  if (isGibberish(clean)) {
    return { type: IntentType.LOW_CONFIDENCE, confidence: 0.55, qwenRequired: false, matchedPattern: 'gibberish' };
  }
  
  return null;
}

// ============================================================
// DEBUG LOGGING
// ============================================================
export interface DebugLog {
  transcript: string;
  wordCount: number;
  confidence?: number;
  matchedRule: string;
  finalIntent: string;
  qwenCalled: boolean;
  stage?: string;
}

const debugLogs: DebugLog[] = [];

export function getDebugLogs(): DebugLog[] {
  return debugLogs;
}

function logDebug(d: DebugLog): void {
  debugLogs.push(d);
  if (debugLogs.length > 200) debugLogs.shift();
  
  console.log(`[Router]
  Transcript: "${d.transcript}"
  WordCount: ${d.wordCount}
  Intent: ${d.finalIntent}
  QwenCalled: ${d.qwenCalled}`);
}

// ============================================================
// INPUT/OUTPUT
// ============================================================
export interface RouterInput {
  transcript: string;
  sttConfidence?: number;
  stage?: string;
}

export interface RouterOutput {
  intent: IntentResult;
  analytics: {
    matchedAt: string;
    inputLength: number;
    wordCount: number;
  };
}

// ============================================================
// MAIN ROUTER
// ============================================================
/**
 * Route transcript to intent.
 * 
 * Only intercepts edge cases. Everything else → CONVERSATION → Qwen.
 * 
 * Order:
 * 1. CRISIS
 * 2. GREETING
 * 3. CLARIFICATION
 * 4. LOW_CONFIDENCE
 * 5. CONVERSATION (default — calls Qwen)
 */
export function routeIntent(input: RouterInput): RouterOutput {
  const { transcript, sttConfidence, stage } = input;
  const clean = transcript.trim();
  const wc = clean.split(/\s+/).filter(Boolean).length;
  
  const analytics = {
    matchedAt: '',
    inputLength: clean.length,
    wordCount: wc,
  };
  
  // Empty → LOW_CONFIDENCE
  if (!clean) {
    analytics.matchedAt = 'empty';
    const intent: IntentResult = { type: IntentType.LOW_CONFIDENCE, confidence: 0, qwenRequired: false, matchedPattern: 'empty' };
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'empty', finalIntent: 'LOW_CONFIDENCE', qwenCalled: false, stage });
    return { intent, analytics };
  }
  
  // 1. CRISIS
  let result = matchCrisis(clean);
  if (result) {
    analytics.matchedAt = 'crisis';
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'crisis', finalIntent: 'CRISIS', qwenCalled: false, stage });
    return { intent: result, analytics };
  }
  
  // 2. GREETING
  result = matchGreeting(clean);
  if (result) {
    analytics.matchedAt = 'greeting';
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'greeting', finalIntent: 'GREETING', qwenCalled: false, stage });
    return { intent: result, analytics };
  }
  
  // 3. CLARIFICATION
  result = matchClarification(clean);
  if (result) {
    analytics.matchedAt = 'clarification';
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'clarification', finalIntent: 'CLARIFICATION', qwenCalled: false, stage });
    return { intent: result, analytics };
  }
  
  // 4. LOW_CONFIDENCE
  result = matchLowConfidence(clean, sttConfidence);
  if (result) {
    analytics.matchedAt = `low_confidence:${result.matchedPattern}`;
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'low_confidence', finalIntent: 'LOW_CONFIDENCE', qwenCalled: false, stage });
    return { intent: result, analytics };
  }
  
  // 5. CONVERSATION (default — ~90% of messages go here)
  analytics.matchedAt = 'conversation';
  logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'conversation_default', finalIntent: 'CONVERSATION', qwenCalled: true, stage });
  return {
    intent: { type: IntentType.CONVERSATION, confidence: 1.0, qwenRequired: true, matchedPattern: 'default_conversation' },
    analytics,
  };
}