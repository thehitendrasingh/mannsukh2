/**
 * Intent Router V1
 * Routes user transcripts to appropriate handlers WITHOUT calling Qwen for simple intents.
 * Saves latency, tokens, and prevents hallucinated emotions.
 * 
 * Pipeline: STT → IntentRouter → (Direct Response | Qwen)
 */

export enum IntentType {
  /** hello, hi, hey, namaste, good morning */
  GREETING = 'GREETING',
  /** haan, nahi, okay, theek hai, hmm */
  SHORT_REPLY = 'SHORT_REPLY',
  /** matlab, samjha nahi, kya, what */
  CLARIFICATION = 'CLARIFICATION',
  /** very short or gibberish audio transcript */
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  /** promotion, trip, vacation, achievement, success */
  POSITIVE_MOMENT = 'POSITIVE_MOMENT',
  /** kya kar rahe ho, kaise ho, aaj kya chal raha */
  CASUAL_CHAT = 'CASUAL_CHAT',
  /** meaningful context, multiple sentences, concerns */
  DEEP_CONVERSATION = 'DEEP_CONVERSATION',
  /** suicide, self-harm, immediate danger */
  CRISIS = 'CRISIS',
}

export interface IntentResult {
  type: IntentType;
  confidence: number; // 0.0 to 1.0
  qwenRequired: boolean;
  matchedPattern?: string;
}

// ============================================================
// GREETING PATTERNS
// ============================================================
const GREETING_PATTERNS = [
  /^(hi|hii|hiii|hello|hey|heyy|heyyy)\b/i,
  /^(namaste|namaskar|namaskaram|pranam)\b/i,
  /^(good\s*morning|good\s*afternoon|good\s*evening)/i,
  /^(sup|what'?s\s*up|wassup|yo)\b/i,
  /^(hello|hey|hi)\s+(mannsukh|mansukh|manusukh)/i,
  /^mannsukh\b/i,
  /^(kaise\s*ho|kya\s*haal|kaisa\s*hai)/i,
];

function matchGreeting(text: string): IntentResult | null {
  const clean = text.trim().toLowerCase();
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        type: IntentType.GREETING,
        confidence: 0.95,
        qwenRequired: false,
        matchedPattern: pattern.source,
      };
    }
  }
  return null;
}

// ============================================================
// SHORT REPLY PATTERNS
// ============================================================
const SHORT_REPLY_PATTERNS = [
  /^(haan|haa|ha|hmm|hm|mm|mmm|hmmm)\b/i,
  /^(nahi|na|nhi|nope|no)\b/i,
  /^(okay|ok|k|theek\s*[hh]?ai|thik\s*[h]?ai|acha|achha|accha)\b/i,
  /^(hmm|hmmm|hmmmm?)\s*$/i,
  /^(yup|yeah|yah|yes)\b/i,
  /^(huh|ah|aah|oh|ooh)\b/i,
];

function matchShortReply(text: string): IntentResult | null {
  const clean = text.trim().toLowerCase();
  
  // Must be very short (1-3 words) for SHORT_REPLY
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount > 3) return null;
  
  for (const pattern of SHORT_REPLY_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        type: IntentType.SHORT_REPLY,
        confidence: 0.9,
        qwenRequired: false,
        matchedPattern: pattern.source,
      };
    }
  }
  return null;
}

// ============================================================
// CLARIFICATION PATTERNS
// ============================================================
const CLARIFICATION_PATTERNS = [
  /^(matlab|matalab|what\b|kya|ka\?*)$/i,
  /^(samajh\s*nah|samajh\s*mein\s*nah|nahi\s*samajh)/i,
  /^(clear\s*nah|nhi\s*samajh|clear\s*nahi)/i,
  /^(mujhe\s*kuch\s*samajh|kuch\s*pata\s*nahi)/i,
  /^(what\s*did\s*you\s*say|say\s*again|repeat\b)/i,
  /^(phir\s*se|ek\s*baar\s*phir|dobaara)/i,
];

function matchClarification(text: string): IntentResult | null {
  const clean = text.trim().toLowerCase();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount > 6) return null; // clarifications are short
  
  for (const pattern of CLARIFICATION_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        type: IntentType.CLARIFICATION,
        confidence: 0.85,
        qwenRequired: false,
        matchedPattern: pattern.source,
      };
    }
  }
  return null;
}

// ============================================================
// LOW CONFIDENCE PATTERNS
// ============================================================
function isGibberish(text: string): boolean {
  // Check for repeated characters (gibberish)
  const hasRepeats = /([a-zA-Z\u0900-\u097F])\1{3,}/.test(text);
  if (hasRepeats) return true;
  
  // Check for no meaningful vowels
  const vowels = /[aeiouAEIOU\u0905-\u090B\u090F-\u0911\u093E-\u0941]/;
  const vowelCount = (text.match(vowels) || []).length;
  if (text.length > 5 && vowelCount === 0) return true;
  
  return false;
}

function matchLowConfidence(
  text: string,
  sttConfidence?: number
): IntentResult | null {
  const clean = text.trim();
  
  // Very short transcript
  if (clean.length < 5 && clean.length > 0) {
    // But don't catch single-char greetings like "hi"
    if (clean.length === 2 || clean.length === 3) {
      const singleWord = clean.toLowerCase();
      if (['hi', 'ha', 'hm', 'haa', 'na', 'no', 'ok', 'k', 'hmm', 'hey', 'he'].includes(singleWord)) {
        return null; // Let SHORT_REPLY or GREETING handle it
      }
    }
    return {
      type: IntentType.LOW_CONFIDENCE,
      confidence: 0.6,
      qwenRequired: false,
      matchedPattern: 'too_short',
    };
  }
  
  // STT confidence (if available)
  if (typeof sttConfidence === 'number' && sttConfidence < 0.6) {
    return {
      type: IntentType.LOW_CONFIDENCE,
      confidence: 0.5,
      qwenRequired: false,
      matchedPattern: 'low_stt_confidence',
    };
  }
  
  // Gibberish detection
  if (isGibberish(clean)) {
    return {
      type: IntentType.LOW_CONFIDENCE,
      confidence: 0.55,
      qwenRequired: false,
      matchedPattern: 'gibberish',
    };
  }
  
  return null;
}

// ============================================================
// POSITIVE MOMENT PATTERNS
// ============================================================
const POSITIVE_KEYWORDS = [
  'promotion', 'promoted', 'promotion mil',
  'trip', 'vacation', 'holiday', 'travel',
  'achievement', 'achieved', 'success',
  'party', 'celebrate', 'celebration',
  'happy', 'excited', 'excitement',
  'masti', 'enjoy', 'enjoying',
  'mil gaya', 'mil gya', 'ho gaya', 'ho gya',
  'shaadi', 'wedding', 'engagement',
  'job', 'offer', 'selected', 'chun liya',
  'jeet', 'win', 'won', 'first',
  'badhai', 'congratulations', 'congrats',
  'baccha', 'baby', 'bacha',
];

const POSITIVE_NEGATION_PATTERNS = [
  /nahi\s+mili/i,
  /nhi\s+mili/i,
  /nahi\s+hua/i,
  /nhi\s+hua/i,
  /cancel/i,
  /nahi\s+ho\s+paya/i,
];

function matchPositiveMoment(text: string): IntentResult | null {
  const clean = text.toLowerCase();
  
  // Check for negation first (e.g. "promotion nahi mili" is NOT positive)
  for (const neg of POSITIVE_NEGATION_PATTERNS) {
    if (neg.test(clean)) return null;
  }
  
  // Must have at least one positive keyword
  let matchedKeyword: string | null = null;
  for (const kw of POSITIVE_KEYWORDS) {
    if (clean.includes(kw)) {
      matchedKeyword = kw;
      break;
    }
  }
  
  if (matchedKeyword) {
    return {
      type: IntentType.POSITIVE_MOMENT,
      confidence: 0.85,
      qwenRequired: false,
      matchedPattern: matchedKeyword,
    };
  }
  
  return null;
}

// ============================================================
// CASUAL CHAT PATTERNS
// ============================================================
const CASUAL_CHAT_PATTERNS = [
  /^(kya\s*kar\s*(rahe|rahi)\s*ho|kya\s*hua|kya\s*chal\s*raha)/i,
  /^(kaise\s*ho\s*aap|kaise\s*ho\s*tum|aap\s*kaise\s*hain)/i,
  /^(aaj\s*kya\s*chal|aaj\s*kya\s*plan|aaj\s*kya\s*kam)/i,
  /^(what'?s\s*up|wassup\b|whats\s*gud|how'?s\s*it\s*going)/i,
  /^(main\s*(to|tho)\s*(thik|theek)\s*hoon)/i,
  /^(bas\s*(thik|theek|aise|aisa)\s*hi)/i,
  /^(sab\s*(thik|theek|badhiya|accha|achha))/i,
];

function matchCasualChat(text: string): IntentResult | null {
  const clean = text.trim().toLowerCase();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount > 8) return null; // longer than casual chat
  
  for (const pattern of CASUAL_CHAT_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        type: IntentType.CASUAL_CHAT,
        confidence: 0.8,
        qwenRequired: false,
        matchedPattern: pattern.source,
      };
    }
  }
  return null;
}

// ============================================================
// DEEP CONVERSATION DETECTION (fallback = Qwen call)
// ============================================================
function matchDeepConversation(text: string): IntentResult {
  // If nothing else matched, it's a deep conversation that needs Qwen
  return {
    type: IntentType.DEEP_CONVERSATION,
    confidence: 0.7,
    qwenRequired: true,
    matchedPattern: 'fallthrough_default',
  };
}

// ============================================================
// CRISIS DETECTION
// ============================================================
const CRISIS_PATTERNS = [
  /suicide|kill myself|end my life|want to die/i,
  /self.?harm|hurt myself|cut myself/i,
  /don't want to live/i,
  /kill me|death/i,
];

function matchCrisis(text: string): IntentResult | null {
  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        type: IntentType.CRISIS,
        confidence: 0.95,
        qwenRequired: false,
        matchedPattern: pattern.source,
      };
    }
  }
  return null;
}

// ============================================================
// MAIN INTENT ROUTER
// ============================================================
export interface RouterInput {
  transcript: string;
  sttConfidence?: number;
  transcriptLength?: number;
}

export interface RouterOutput {
  intent: IntentResult;
  analytics: {
    matchedAt: string;
    inputLength: number;
  };
}

/**
 * Route a transcript to the most appropriate intent.
 * 
 * Priority order (first match wins):
 * 1. CRISIS (safety first)
 * 2. GREETING
 * 3. SHORT_REPLY
 * 4. CLARIFICATION
 * 5. LOW_CONFIDENCE
 * 6. POSITIVE_MOMENT
 * 7. CASUAL_CHAT
 * 8. DEEP_CONVERSATION (always falls through to Qwen)
 */
export function routeIntent(input: RouterInput): RouterOutput {
  const { transcript, sttConfidence } = input;
  const clean = transcript.trim();
  
  if (!clean) {
    return {
      intent: {
        type: IntentType.LOW_CONFIDENCE,
        confidence: 0,
        qwenRequired: false,
        matchedPattern: 'empty_transcript',
      },
      analytics: {
        matchedAt: 'empty_check',
        inputLength: 0,
      },
    };
  }
  
  const analytics = {
    matchedAt: '',
    inputLength: clean.length,
  };
  
  // 1. CRISIS (highest priority)
  let result = matchCrisis(clean);
  if (result) {
    analytics.matchedAt = `crisis:${result.matchedPattern}`;
    console.log(`[IntentRouter] CRISIS detected: "${result.matchedPattern}"`);
    return { intent: result, analytics };
  }
  
  // 2. LOW CONFIDENCE (must check early so we don't send garbage to Qwen)
  result = matchLowConfidence(clean, sttConfidence);
  if (result) {
    analytics.matchedAt = `low_confidence:${result.matchedPattern}`;
    console.log(`[IntentRouter] LOW_CONFIDENCE: "${result.matchedPattern}"`);
    return { intent: result, analytics };
  }
  
  // 3. GREETING
  result = matchGreeting(clean);
  if (result) {
    analytics.matchedAt = `greeting:${result.matchedPattern}`;
    console.log(`[IntentRouter] GREETING: "${clean.substring(0, 30)}"`);
    return { intent: result, analytics };
  }
  
  // 4. SHORT_REPLY
  result = matchShortReply(clean);
  if (result) {
    analytics.matchedAt = `short_reply:${result.matchedPattern}`;
    console.log(`[IntentRouter] SHORT_REPLY: "${clean.substring(0, 30)}"`);
    return { intent: result, analytics };
  }
  
  // 5. CLARIFICATION
  result = matchClarification(clean);
  if (result) {
    analytics.matchedAt = `clarification:${result.matchedPattern}`;
    console.log(`[IntentRouter] CLARIFICATION: "${clean.substring(0, 30)}"`);
    return { intent: result, analytics };
  }
  
  // 6. POSITIVE_MOMENT
  result = matchPositiveMoment(clean);
  if (result) {
    analytics.matchedAt = `positive_moment:${result.matchedPattern}`;
    console.log(`[IntentRouter] POSITIVE_MOMENT: "${result.matchedPattern}"`);
    return { intent: result, analytics };
  }
  
  // 7. CASUAL_CHAT
  result = matchCasualChat(clean);
  if (result) {
    analytics.matchedAt = `casual_chat:${result.matchedPattern}`;
    console.log(`[IntentRouter] CASUAL_CHAT`);
    return { intent: result, analytics };
  }
  
  // 8. DEEP_CONVERSATION (fallthrough - calls Qwen)
  result = matchDeepConversation(clean);
  analytics.matchedAt = 'deep_conversation';
  console.log(`[IntentRouter] DEEP_CONVERSATION — calling Qwen`);
  return { intent: result, analytics };
}