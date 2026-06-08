/**
 * Intent Router V2
 * Routes user transcripts to appropriate handlers WITHOUT calling Qwen for simple intents.
 * 
 * Classification order (NEVER CHANGE):
 * 1. CRISIS
 * 2. GREETING
 * 3. LOW_CONFIDENCE
 * 4. SHORT_REPLY
 * 5. POSITIVE_MOMENT
 * 6. CASUAL_CHAT
 * 7. DEEP_CONVERSATION
 * 
 * Debug logging: every transcript is logged with wordCount, intent, qwenCalled
 */

export enum IntentType {
  /** suicide, self-harm, immediate danger */
  CRISIS = 'CRISIS',
  /** hello, hi, hey, namaste, helo mannsukh */
  GREETING = 'GREETING',
  /** very short, gibberish, low STT confidence */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  /** haan, nahi, okay, kya bataun, bas aise hi, ≤5 words */
  SHORT_REPLY = 'SHORT_REPLY',
  /** promotion, trip, dance, masti, happy, success */
  POSITIVE_MOMENT = 'POSITIVE_MOMENT',
  /** kaise ho, kya kar rahe ho, what's up */
  CASUAL_CHAT = 'CASUAL_CHAT',
  /** meaningful context, >8 words, concerns */
  DEEP_CONVERSATION = 'DEEP_CONVERSATION',
}

export interface IntentResult {
  type: IntentType;
  confidence: number;
  qwenRequired: boolean;
  matchedPattern?: string;
}

// ============================================================
// HELPER: Word count and token analysis
// ============================================================
function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasEmotionalKeywords(text: string): boolean {
  const emotionalKeywords = [
    'depression', 'depressed', 'anxiety', 'anxious',
    'stress', 'stressed', 'tension', 'tensed',
    'sad', 'sadness', 'udaas', 'gam', 'dukh',
    'lonely', 'alone', 'akela', 'tanha',
    'angry', 'angry', 'gussa', 'naraz',
    'fear', 'scared', 'darr', 'dar',
    'pain', 'hurt', 'dard', 'chot',
    'cry', 'crying', 'rona', 'ro',
    'worried', 'worry', 'chinta', 'fikr',
    'pressure', 'preshaan', 'pareshan',
    'breakup', 'divorce', 'talaq',
    'suicide', 'kill', 'die', 'death',
    'boring', 'bore', 'interest', 'meaningless',
  ];
  const lower = text.toLowerCase();
  for (const kw of emotionalKeywords) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function containsPositiveKeyword(text: string): boolean {
  const positiveKeywords = [
    'happy', 'excited', 'excitement',
    'promotion', 'promoted',
    'trip', 'vacation', 'holiday', 'travel',
    'party', 'celebrate', 'celebration',
    'enjoy', 'enjoying',
    'masti', 'mast', 'maza', 'mazaa', 'fun',
    'dance', 'dancing', 'dance kiya', 'naach',
    'achievement', 'success',
    'good news', 'great', 'awesome',
    'mil gaya', 'mil gya', 'ho gaya', 'ho gya',
    'shaadi', 'wedding', 'engagement',
    'job', 'offer', 'selected',
    'jeet', 'win', 'won', 'first',
    'badhai', 'congratulations', 'congrats',
    'baccha', 'baby', 'bacha',
    'waah', 'wah', 'badiya', 'badhiya',
    'amazing', 'wonderful', 'fantastic',
    'love', 'pyaar', 'mohabbat',
  ];
  const lower = text.toLowerCase();
  for (const kw of positiveKeywords) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

const POSITIVE_NEGATION_PATTERNS = [
  /nahi\s+mili/i, /nhi\s+mili/i,
  /nahi\s+hua/i, /nhi\s+hua/i,
  /cancel/i, /nahi\s+ho\s+paya/i,
];

function isPositiveNegated(text: string): boolean {
  for (const neg of POSITIVE_NEGATION_PATTERNS) {
    if (neg.test(text)) return false;
  }
  return false;
}

// ============================================================
// 1. CRISIS DETECTION (highest priority)
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
      return { type: IntentType.CRISIS, confidence: 0.95, qwenRequired: false, matchedPattern: 'crisis_detected' };
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
  /^(kaise\s*ho|kya\s*haal|kaisa\s*hai)/i,
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
// 3. LOW CONFIDENCE DETECTION
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
  
  // Empty or near-empty transcript
  if (!clean || clean.length === 0) {
    return { type: IntentType.LOW_CONFIDENCE, confidence: 0, qwenRequired: false, matchedPattern: 'empty' };
  }
  
  // STT confidence check
  if (typeof sttConfidence === 'number' && sttConfidence < 0.65) {
    return { type: IntentType.LOW_CONFIDENCE, confidence: sttConfidence, qwenRequired: false, matchedPattern: 'low_stt_confidence' };
  }
  
  // Gibberish detection
  if (isGibberish(clean)) {
    return { type: IntentType.LOW_CONFIDENCE, confidence: 0.55, qwenRequired: false, matchedPattern: 'gibberish' };
  }
  
  // One or two character only (but not valid words)
  if (clean.length <= 2) {
    const validShort = ['hi', 'ha', 'hm', 'haa', 'na', 'no', 'ok', 'k', 'hmm', 'hey', 'he', 'oh', 'ah', 'huh', 'yo'];
    if (!validShort.includes(clean.toLowerCase())) {
      return { type: IntentType.LOW_CONFIDENCE, confidence: 0.5, qwenRequired: false, matchedPattern: 'too_short' };
    }
  }
  
  return null;
}

// ============================================================
// 4. SHORT REPLY DETECTION
// ============================================================
const SHORT_REPLY_PATTERNS = [
  /^(haan|haa|ha|hmm|hm|mm|mmm|hmmm|hmmmm)\b/i,
  /^(nahi|na|nhi|nope|no|nah)\b/i,
  /^(okay|ok|k|theek\s*[hh]?ai|thik\s*[h]?ai|acha|achha|accha|theek)\b/i,
  /^(yup|yeah|yah|yes|yep)\b/i,
  /^(huh|ah|aah|oh|ooh|oof|phew)\b/i,
  /^(matlab|matalab|kya|kaise)\b/i,
  /^(kya\s*bataun|kya\s*batau|kya\s*bataaun)$/i,
  /^(bas\s*aise\s*hi|bas\s*yun\s*hi|aisa\s*hi|aise\s*hi)$/i,
  /^(pata\s*nahi|pata\s*nhi|nahi\s*pata|nhi\s*pata)/i,
  /^(shayad|ho\s*sakta\s*hai|ho\s*sakte\s*hai)\b/i,
  /^(acha\s*acha|achha\s*achha|theek\s*theek)/i,
  /^(thik\s*hai|theek\s*hai|okay\s*hai)\s*$/i,
  /^वैसे\s*ही|ऐसे\s*ही|बस\s*ऐसे\s*ही/i,
  /^क्या\s*बताऊँ|क्या\s*बताऊ/i,
  /^पता\s*नहीं|पता\s*नहि/i,
  /^शायद|हो\s*सकता\s*है/i,
  /^हाँ|हैं|हा|नहीं|नहि|न|अच्छा|ठीक/i,
  /^मतलब/i,
];

// Words that are NOT emotional — used for the ≤5 word rule
function isShortNonEmotional(text: string): boolean {
  const wc = getWordCount(text);
  if (wc > 5) return false;
  if (hasEmotionalKeywords(text)) return false;
  return true;
}

function matchShortReply(text: string): IntentResult | null {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  
  // First: match known short reply patterns
  for (const pattern of SHORT_REPLY_PATTERNS) {
    if (pattern.test(clean) || pattern.test(lower)) {
      return { type: IntentType.SHORT_REPLY, confidence: 0.9, qwenRequired: false, matchedPattern: 'pattern_match' };
    }
  }
  
  // Second: any transcript with ≤5 words that is not emotional
  if (isShortNonEmotional(clean)) {
    return { type: IntentType.SHORT_REPLY, confidence: 0.75, qwenRequired: false, matchedPattern: 'short_non_emotional' };
  }
  
  return null;
}

// ============================================================
// 5. POSITIVE MOMENT DETECTION
// ============================================================
function matchPositiveMoment(text: string): IntentResult | null {
  const clean = text.trim();
  
  // Check negation first
  if (isPositiveNegated(clean)) return null;
  
  // Check for positive keywords
  if (containsPositiveKeyword(clean)) {
    return { type: IntentType.POSITIVE_MOMENT, confidence: 0.85, qwenRequired: false, matchedPattern: 'positive_keyword' };
  }
  
  return null;
}

// ============================================================
// 6. CASUAL CHAT DETECTION
// ============================================================
const CASUAL_CHAT_PATTERNS = [
  /^(kya\s*kar\s*(rahe|rahi)\s*ho|kya\s*hua|kya\s*chal\s*raha)/i,
  /^(kaise\s*ho\s*aap|kaise\s*ho\s*tum|aap\s*kaise\s*hain)/i,
  /^(aaj\s*kya\s*chal|aaj\s*kya\s*plan|aaj\s*kya\s*kam)/i,
  /^(what'?s\s*up|wassup\b|whats\s*gud|how'?s\s*it\s*going)/i,
  /^(main\s*(to|tho)\s*(thik|theek)\s*hoon)/i,
  /^(bas\s*(thik|theek|aise|aisa)\s*hi)/i,
  /^(sab\s*(thik|theek|badhiya|accha|achha))/i,
  /^(kahan\s*ho|kidhar\s*ho)\b/i,
  /^क्या\s*कर\s*रहे|क्या\s*हुआ|क्या\s*चल\s*रहा|कैसे\s*हो/i,
  /^कहाँ\s*हो|किधर\s*हो/i,
  /^आज\s*क्या\s*चल/i,
];

function matchCasualChat(text: string): IntentResult | null {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const wc = getWordCount(clean);
  if (wc > 8) return null;
  
  for (const pattern of CASUAL_CHAT_PATTERNS) {
    if (pattern.test(clean) || pattern.test(lower)) {
      return { type: IntentType.CASUAL_CHAT, confidence: 0.8, qwenRequired: false, matchedPattern: 'casual_chat' };
    }
  }
  return null;
}

// ============================================================
// 7. DEEP CONVERSATION DETECTION
// ============================================================
function matchDeepConversation(text: string): IntentResult | null {
  const clean = text.trim();
  const wc = getWordCount(clean);
  
  // Condition A: wordCount > 8
  if (wc <= 8) {
    return null; // NOT a deep conversation
  }
  
  // Condition B: contains meaningful context (emotional keywords or substantial content)
  if (!hasEmotionalKeywords(clean) && wc <= 12) {
    // Short-ish without emotional keywords might still be casual
    // Only route to deep if truly meaningful
    if (wc <= 10) {
      return null;
    }
  }
  
  return { type: IntentType.DEEP_CONVERSATION, confidence: 0.85, qwenRequired: true, matchedPattern: 'deep_conversation' };
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
  // Keep last 200 entries
  if (debugLogs.length > 200) debugLogs.shift();
  
  console.log(`[IntentRouter]
  Transcript: "${d.transcript}"
  WordCount: ${d.wordCount}
  MatchedRule: ${d.matchedRule}
  Intent: ${d.finalIntent}
  Qwen: ${d.qwenCalled}`);
}

// ============================================================
// INPUT/OUTPUT TYPES
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
 * Route a transcript to the most appropriate intent.
 * 
 * IMMUTABLE ORDER:
 * 1. CRISIS
 * 2. GREETING
 * 3. LOW_CONFIDENCE
 * 4. SHORT_REPLY
 * 5. POSITIVE_MOMENT
 * 6. CASUAL_CHAT
 * 7. DEEP_CONVERSATION
 */
export function routeIntent(input: RouterInput): RouterOutput {
  const { transcript, sttConfidence, stage } = input;
  const clean = transcript.trim();
  const wc = getWordCount(clean);
  
  const analytics = {
    matchedAt: '',
    inputLength: clean.length,
    wordCount: wc,
  };
  
  // Empty transcript
  if (!clean) {
    analytics.matchedAt = 'empty';
    const intent: IntentResult = { type: IntentType.LOW_CONFIDENCE, confidence: 0, qwenRequired: false, matchedPattern: 'empty' };
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: 'empty', finalIntent: 'LOW_CONFIDENCE', qwenCalled: false, stage });
    return { intent, analytics };
  }
  
  let result: IntentResult | null = null;
  let rule = '';
  
  // 1. CRISIS
  result = matchCrisis(clean);
  if (result) { rule = 'crisis'; analytics.matchedAt = 'crisis'; logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'CRISIS', qwenCalled: false, stage }); return { intent: result, analytics }; }
  
  // 2. GREETING
  result = matchGreeting(clean);
  if (result) { rule = 'greeting'; analytics.matchedAt = 'greeting'; logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'GREETING', qwenCalled: false, stage }); return { intent: result, analytics }; }
  
  // 3. LOW_CONFIDENCE
  result = matchLowConfidence(clean, sttConfidence);
  if (result) { rule = 'low_confidence'; analytics.matchedAt = `low_confidence:${result.matchedPattern}`; logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'LOW_CONFIDENCE', qwenCalled: false, stage }); return { intent: result, analytics }; }
  
  // 4. SHORT_REPLY
  result = matchShortReply(clean);
  if (result) { rule = 'short_reply'; analytics.matchedAt = 'short_reply'; logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'SHORT_REPLY', qwenCalled: false, stage }); return { intent: result, analytics }; }
  
  // 5. POSITIVE_MOMENT
  result = matchPositiveMoment(clean);
  if (result) { rule = 'positive_moment'; analytics.matchedAt = 'positive_moment'; logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'POSITIVE_MOMENT', qwenCalled: false, stage }); return { intent: result, analytics }; }
  
  // 6. CASUAL_CHAT
  result = matchCasualChat(clean);
  if (result) { rule = 'casual_chat'; analytics.matchedAt = 'casual_chat'; logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'CASUAL_CHAT', qwenCalled: false, stage }); return { intent: result, analytics }; }
  
  // 7. DEEP_CONVERSATION (only if both conditions met)
  result = matchDeepConversation(clean);
  if (result) {
    rule = 'deep_conversation';
    analytics.matchedAt = 'deep_conversation';
    logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'DEEP_CONVERSATION', qwenCalled: true, stage });
    return { intent: result, analytics };
  }
  
  // FALLBACK: If deep conversation conditions not met, route as SHORT_REPLY
  // This prevents sending non-meaningful content to Qwen
  rule = 'deep_conversation_failed_conditions';
  analytics.matchedAt = 'short_reply_fallback';
  logDebug({ transcript, wordCount: wc, confidence: sttConfidence, matchedRule: rule, finalIntent: 'SHORT_REPLY', qwenCalled: false, stage });
  return {
    intent: { type: IntentType.SHORT_REPLY, confidence: 0.6, qwenRequired: false, matchedPattern: 'deep_conversation_conditions_not_met' },
    analytics,
  };
}