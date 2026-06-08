/**
 * Direct Responses for Intents that Skip Qwen
 * 
 * V3: Only GREETING, CLARIFICATION, LOW_CONFIDENCE, CRISIS use pre-written responses.
 * Everything else → CONVERSATION → Qwen.
 * 
 * Responses are rotated through to avoid sounding repetitive.
 */

export type ResponseLanguage = 'hinglish' | 'hindi' | 'english';

export interface ResponseSet {
  responses: Record<ResponseLanguage, string[]>;
}

// Track last used index to rotate responses
const lastUsedIndices = new Map<string, number>();

function getNextResponse(keys: string, responses: string[]): string {
  const lastIndex = lastUsedIndices.get(keys) ?? -1;
  const nextIndex = (lastIndex + 1) % responses.length;
  lastUsedIndices.set(keys, nextIndex);
  return responses[nextIndex];
}

// ============================================================
// GREETING (no Qwen)
// ============================================================
const GREETING_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Hey! Aaj kya chal raha hai?",
      "Namaste! Kaise ho aaj?",
      "Hello! Kaise ho? Kya kar rahe ho?",
      "Hey yaar! Kaise ho?",
      "Hello hello! Aaj ka din kaisa hai?",
    ],
    hindi: [
      "हेलो! आज क्या चल रहा है?",
      "नमस्ते! कैसे हो आज?",
      "हाय! क्या कर रहे हो?",
      "नमस्ते! क्या हाल है?",
    ],
    english: [
      "Hey! What's up?",
      "Hey there! How are you?",
      "Hi! How's it going?",
    ],
  },
};

// ============================================================
// CLARIFICATION (no Qwen)
// ============================================================
const CLARIFICATION_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Kis baat ka matlab?",
      "Kaunsi baat clear nahi hui?",
      "Kya hua? Batao na.",
      "Hmm? Kya poochhna chahte ho?",
    ],
    hindi: [
      "किस बात का मतलब?",
      "कौन सी बात साफ नहीं हुई?",
      "क्या हुआ? बताओ न।",
      "हम्म? क्या पूछना चाहते हो?",
    ],
    english: [
      "What do you mean?",
      "What's not clear?",
      "What happened? Tell me.",
    ],
  },
};

// ============================================================
// LOW CONFIDENCE (no Qwen)
// ============================================================
const LOW_CONFIDENCE_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Mujhe lagta hai main poori baat samajh nahi paaya. Ek baar phir se bataoge?",
      "Thoda aur clearly batao na, main sahi se sun nahi paaya.",
      "Sorry, kuch choot gaya. Dobara bataoge?",
    ],
    hindi: [
      "मुझे लगता है मैं पूरी बात समझ नहीं पाया। एक बार फिर से बताओगे?",
      "थोड़ा और साफ़ बताओ न, मैं सही से सुन नहीं पाया।",
      "सॉरी, कुछ छूट गया। दोबारा बताओगे?",
    ],
    english: [
      "I don't think I caught all of that. Can you say it again?",
      "Could you say that again? I missed a bit.",
      "Sorry, I didn't quite get that. One more time?",
    ],
  },
};

// ============================================================
// CRISIS (highest priority)
// ============================================================
const CRISIS_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Main tumhari baat sun raha hoon aur yeh bahut important hai. Kya tum kisi close friend ya family member ko bata sakte ho? Tum akela nahi ho — mein yahan hoon.",
      "Yeh bahut heavy lag raha hai. Please kisi close insaan se baat karo. Tumhare liye helplines bhi hain — 9152987821 (iCall) ya 1800-599-0019 (Vandrevala). Main yahan hoon.",
    ],
    hindi: [
      "मैं तुम्हारी बात सुन रहा हूँ और यह बहुत ज़रूरी है। क्या तुम किसी करीबी दोस्त या परिवार वाले को बता सकते हो? तुम अकेले नहीं हो — मैं यहाँ हूँ।",
      "यह बहुत हैवी लग रहा है। कृपया किसी करीबी इंसान से बात करो। तुम्हारे लिए हेल्पलाइन भी हैं — 9152987821 (iCall) या 1800-599-0019 (Vandrevala)। मैं यहाँ हूँ।",
    ],
    english: [
      "I hear you and this is really important. Can you talk to someone close right now? You're not alone — I'm here but a real person would be better. Please reach out.",
      "This sounds really heavy. Please talk to someone you trust right away. There are helplines available 24/7.",
    ],
  },
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get a direct response for an intent type.
 * Returns null if the intent doesn't have pre-written responses (e.g. CONVERSATION).
 * CONVERSATION should always go to Qwen.
 */
export function getDirectResponse(
  intentType: string,
  language: ResponseLanguage = 'hinglish'
): string | null {
  let set: ResponseSet;
  
  switch (intentType) {
    case 'GREETING':
      set = GREETING_RESPONSES;
      break;
    case 'CLARIFICATION':
      set = CLARIFICATION_RESPONSES;
      break;
    case 'LOW_CONFIDENCE':
      set = LOW_CONFIDENCE_RESPONSES;
      break;
    case 'CRISIS':
      set = CRISIS_RESPONSES;
      break;
    default:
      // CONVERSATION or anything else → needs Qwen, no direct response
      return null;
  }
  
  const langResponses = set.responses[language] || set.responses.hinglish;
  const key = `${intentType}_${language}`;
  return getNextResponse(key, langResponses);
}