/**
 * Direct Responses for Intents that Skip Qwen
 * Stores pre-written, natural response sets for each IntentType.
 * These are used when the Intent Router determines Qwen is NOT needed.
 * 
 * Responses are organized by language [{hinglish, hindi, english}]
 * and rotated through to avoid sounding repetitive.
 */

export type ResponseLanguage = 'hinglish' | 'hindi' | 'english';

export interface ResponseSet {
  responses: Record<ResponseLanguage, string[]>;
}

// Track last used index per session to rotate responses
const lastUsedIndices = new Map<string, number>();

function getNextResponse(keys: string, responses: string[]): string {
  const lastIndex = lastUsedIndices.get(keys) ?? -1;
  const nextIndex = (lastIndex + 1) % responses.length;
  lastUsedIndices.set(keys, nextIndex);
  return responses[nextIndex];
}

// ============================================================
// GREETING
// ============================================================
const GREETING_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Hey! Aaj kya chal raha hai?",
      "Namaste! Kaise ho aaj?",
      "Hello! Kaise ho?",
      "Hey yaar! Tum kya kar rahe ho aaj?",
      "Hi! Masti mein ho ya kuch aur chal raha hai?",
      "Hello hello! Aaj ka din kaisa hai?",
    ],
    hindi: [
      "हेलो! आज क्या चल रहा है?",
      "नमस्ते! कैसे हो आज?",
      "हाय! कैसे हो?",
      "अरे वाह! क्या कर रहे हो?",
      "हाय हाय! क्या हाल है?",
    ],
    english: [
      "Hey! What's up?",
      "Hey there! How are you?",
      "Hi! How's it going?",
      "Hello! What are you up to?",
    ],
  },
};

// ============================================================
// SHORT REPLY
// ============================================================
const SHORT_REPLY_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Hmm, thoda aur bataoge?",
      "Acha, phir?",
      "Haan? Batao na.",
      "Acha acha. Kya soch rahe ho?",
      "Aur? Kya chal raha hai?",
    ],
    hindi: [
      "हम्म, थोड़ा और बताओगे?",
      "अच्छा, फिर?",
      "हाँ? बताओ न।",
      "हाँ हाँ, क्या सोच रहे हो?",
    ],
    english: [
      "Hmm, tell me more?",
      "Okay, what next?",
      "Yeah? Go on.",
      "Uh huh. What are you thinking?",
    ],
  },
};

// ============================================================
// CLARIFICATION
// ============================================================
const CLARIFICATION_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Kis baat ka matlab?",
      "Kaunsi baat clear nahi hui?",
      "Hmm? Kya poochhna chahte ho?",
      "Kya hua? Batao na.",
      "Sorry, kya kaha?",
    ],
    hindi: [
      "किस बात का मतलब?",
      "कौन सी बात साफ नहीं हुई?",
      "हम्म? क्या पूछना चाहते हो?",
      "क्या हुआ? बताओ न।",
    ],
    english: [
      "What do you mean?",
      "What's not clear?",
      "Hmm? What are you asking?",
      "What happened? Tell me.",
    ],
  },
};

// ============================================================
// LOW CONFIDENCE
// ============================================================
const LOW_CONFIDENCE_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Mujhe lagta hai main poori baat samajh nahi paaya. Ek baar phir se bataoge?",
      "Thoda aur clearly batao na, main sahi se sun nahi paaya.",
      "Sorry, kuch choot gaya. Dobara bataoge?",
      "Achha se sun nahi paya. Ek baar aur?",
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
// POSITIVE MOMENT
// ============================================================
const POSITIVE_MOMENT_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Arre waah! Sabse exciting part kya hai?",
      "Nice yaar! Phir kya hua?",
      "Badiya! Aur batao?",
      "Waah! Ye toh celebrate karna banta hai!",
      "That's awesome! Kya experience raha?",
    ],
    hindi: [
      "अरे वाह! सबसे एक्साइटिंग पार्ट क्या है?",
      "नाइस यार! फिर क्या हुआ?",
      "बढ़िया! और बताओ?",
      "वाह! ये तो सेलिब्रेट करना बनता है!",
    ],
    english: [
      "Wow! What's the most exciting part?",
      "That's great! What happened next?",
      "Awesome! Tell me more!",
      "Amazing! That's worth celebrating!",
    ],
  },
};

// ============================================================
// CASUAL CHAT
// ============================================================
const CASUAL_CHAT_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Bas tumhari baat sun raha hoon. Tum batao?",
      "Sab badhiya. Tumhari duniya mein kya chal raha hai?",
      "Haan haan, batao na. Kya soch rahe ho?",
      "Main toh ready hoon sunne ke liye. Tum start karo?",
      "Acha acha. Kya chal raha hai tere saath aaj kal?",
    ],
    hindi: [
      "बस तुम्हारी बात सुन रहा हूँ। तुम बताओ?",
      "सब बढ़िया। तुम्हारी दुनिया में क्या चल रहा है?",
      "हाँ हाँ, बताओ न। क्या सोच रहे हो?",
    ],
    english: [
      "Just listening. What's up with you?",
      "All good. What's happening in your world?",
      "Yeah, tell me. What's on your mind?",
    ],
  },
};

// ============================================================
// CRISIS
// ============================================================
const CRISIS_RESPONSES: ResponseSet = {
  responses: {
    hinglish: [
      "Main tumhari baat sun raha hoon aur yeh bahut important hai. Kya tum kisi close friend ya family member ko bata sakte ho? Tum akela nahi ho — mein yahan hoon.",
      "Yeh bahut heavy lag raha hai. Please kisi close insaan se baat karo. Tumhare liye helplines bhi hain — 9152987821 (iCall) ya 1800-599-0019 (Vandrevala). Main yahan hoon.",
      "Main tumhari baat seriously le raha hoon. Kisi close friend ya family member ko immediately batao. Yaad rakhna — yeh feeling permanent nahi hai. Help available hai.",
    ],
    hindi: [
      "मैं तुम्हारी बात सुन रहा हूँ और यह बहुत ज़रूरी है। क्या तुम किसी करीबी दोस्त या परिवार वाले को बता सकते हो? तुम अकेले नहीं हो — मैं यहाँ हूँ।",
      "यह बहुत हैवी लग रहा है। कृपया किसी करीबी इंसान से बात करो। तुम्हारे लिए हेल्पलाइन भी हैं — 9152987821 (iCall) या 1800-599-0019 (Vandrevala)। मैं यहाँ हूँ।",
    ],
    english: [
      "I hear you and this is really important. Can you talk to someone close right now? You're not alone — I'm here but a real person would be better. Please reach out.",
      "This sounds really heavy. Please talk to someone you trust right away. There are helplines available 24/7. You matter. This feeling won't last forever.",
    ],
  },
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get a direct response for a given intent type, rotating through 
 * available options to avoid repetition.
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
    case 'SHORT_REPLY':
      set = SHORT_REPLY_RESPONSES;
      break;
    case 'CLARIFICATION':
      set = CLARIFICATION_RESPONSES;
      break;
    case 'LOW_CONFIDENCE':
      set = LOW_CONFIDENCE_RESPONSES;
      break;
    case 'POSITIVE_MOMENT':
      set = POSITIVE_MOMENT_RESPONSES;
      break;
    case 'CASUAL_CHAT':
      set = CASUAL_CHAT_RESPONSES;
      break;
    case 'CRISIS':
      set = CRISIS_RESPONSES;
      break;
    default:
      return null;
  }
  
  const langResponses = set.responses[language] || set.responses.hinglish;
  const key = `${intentType}_${language}`;
  return getNextResponse(key, langResponses);
}

/**
 * Get a greeting response that includes "MannSukh" in it (for self-reference)
 */
export function getGreetingWithSelfReference(): string {
  const responses = [
    "Hey! MannSukh mein welcome hai! Kya chal raha hai?",
    "Namaste! Main MannSukh hoon. Aap kaise hain?",
    "Hey! Main MannSukh. Batao kya chal raha hai?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Get a transition/stage-aware response prefix
 */
export function getStageResponsePrefix(
  intentType: string,
  language: ResponseLanguage,
  stage: string
): string | null {
  // For EXPLORE stage, always use direct responses (no reflection)
  if (stage === 'EXPLORE') {
    return null; // Use default direct response
  }
  
  // For higher stages, still handle simple intents without Qwen
  return getDirectResponse(intentType, language);
}