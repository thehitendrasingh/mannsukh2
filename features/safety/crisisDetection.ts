/**
 * Crisis Detection Engine
 * Detects self-harm, suicide, and violence intent in real-time
 */

import { CrisisSignal } from '@/types/voice';

// High-severity crisis keywords (immediate action required)
const HIGH_SEVERITY_KEYWORDS = {
  hindi: [
    'आत्महत्या', 'खुदकुशी', 'मार डालूंगा', 'मार डालूंगी', 'जान दे दूंगा', 'जान दे दूंगी',
    'जीना नहीं चाहता', 'जीना नहीं चाहती', 'मरना चाहता', 'मरना चाहती', 
    'काट लूंगा', 'काट लूंगी', 'फांसी लगा लूंगा', 'फांसी लगा लूंगी',
    'जहर खा लूंगा', 'जहर खा लूंगी', 'बिल्डिंग से कूद जाऊंगा', 'बिल्डिंग से कूद जाऊंगी'
  ],
  hinglish: [
    'suicide', 'kill myself', 'end my life', 'want to die', 'better off dead',
    'self harm', 'cutting myself', 'hang myself', 'overdose', 'jump off',
    'marna chahta', 'marna chahti', 'jaan de dunga', 'jaan de dungi',
    'zindagi khatam', 'life khatam', 'mar jaunga', 'mar jaungi',
    'kat lena', 'faasi laga lunga', 'faasi laga lungi', 'zeher kha lunga', 'zeher kha lungi'
  ],
  english: [
    'suicide', 'kill myself', 'end my life', 'want to die', 'better off dead',
    'don\'t want to live', 'don\'t want to be alive', 'wish I was dead',
    'self harm', 'cutting myself', 'cut myself', 'hang myself',
    'overdose', 'pills', 'jump off', 'jump from', 'bridge', 'building',
    'gun', 'shoot myself', 'knife', 'cut wrist', 'cut throat'
  ],
};

// Medium-severity keywords (monitor closely)
const MEDIUM_SEVERITY_KEYWORDS = {
  hindi: [
    'उदास', 'निराश', 'हताश', 'बेकार', 'कुछ नहीं बचा', 'खत्म',
    'कोई फायदा नहीं', 'मुझसे नहीं होगा', 'हार मान ली'
  ],
  hinglish: [
    'hopeless', 'worthless', 'giving up', 'can\'t go on', 'too tired',
    'nothing matters', 'empty inside', 'numb', 'broken', 'defeated',
    'udaas', 'niraash', 'hataash', 'bekaar', 'kuch nahi bacha', 'khatam'
  ],
  english: [
    'hopeless', 'worthless', 'giving up', 'can\'t go on', 'too tired',
    'nothing matters', 'empty inside', 'numb', 'broken', 'defeated',
    'no point', 'why bother', 'what\'s the use', 'tired of living'
  ],
};

export interface CrisisDetectionConfig {
  highSeverityKeywords: string[];
  mediumSeverityKeywords: string[];
  enableRealTimeDetection: boolean;
}

export const DEFAULT_CRISIS_CONFIG: CrisisDetectionConfig = {
  highSeverityKeywords: [
    ...HIGH_SEVERITY_KEYWORDS.hindi,
    ...HIGH_SEVERITY_KEYWORDS.hinglish,
    ...HIGH_SEVERITY_KEYWORDS.english,
  ],
  mediumSeverityKeywords: [
    ...MEDIUM_SEVERITY_KEYWORDS.hindi,
    ...MEDIUM_SEVERITY_KEYWORDS.hinglish,
    ...MEDIUM_SEVERITY_KEYWORDS.english,
  ],
  enableRealTimeDetection: true,
};

export class CrisisDetector {
  private config: CrisisDetectionConfig;

  constructor(config?: Partial<CrisisDetectionConfig>) {
    this.config = { ...DEFAULT_CRISIS_CONFIG, ...config };
  }

  // Detect crisis signals in text
  detect(text: string): CrisisSignal {
    const lower = text.toLowerCase();
    
    // Check high severity first
    const highSeverityMatches = this.config.highSeverityKeywords.filter(
      keyword => lower.includes(keyword.toLowerCase())
    );

    if (highSeverityMatches.length > 0) {
      return {
        detected: true,
        keywords: highSeverityMatches,
        severity: 'high',
        immediateAction: true,
      };
    }

    // Check medium severity
    const mediumSeverityMatches = this.config.mediumSeverityKeywords.filter(
      keyword => lower.includes(keyword.toLowerCase())
    );

    if (mediumSeverityMatches.length > 0) {
      return {
        detected: true,
        keywords: mediumSeverityMatches,
        severity: 'medium',
        immediateAction: false,
      };
    }

    return {
      detected: false,
      keywords: [],
      severity: 'none',
      immediateAction: false,
    };
  }

  // Check partial transcript (for real-time detection during STT streaming)
  detectPartial(text: string): CrisisSignal {
    if (!this.config.enableRealTimeDetection) {
      return { detected: false, keywords: [], severity: 'none', immediateAction: false };
    }
    return this.detect(text);
  }

  // Get crisis resources for Indian users
  static getCrisisResources(): Array<{ name: string; phone: string; description: string }> {
    return [
      {
        name: 'Tele-MANAS (Govt of India)',
        phone: '14416',
        description: 'Toll-free, 24/7 mental health support',
      },
      {
        name: 'Kiran Mental Health Helpline',
        phone: '1800-599-0019',
        description: 'Toll-free, 24/7 support',
      },
      {
        name: 'Vandrevala Foundation',
        phone: '+91 9999 666 555',
        description: 'Call or WhatsApp, 24/7 support',
      },
      {
        name: 'AASRA Helpline',
        phone: '+91 98204 66726',
        description: '24/7 mental wellness support',
      },
      {
        name: 'iCall (TISS)',
        phone: '+91 91529 87821',
        description: 'Email: icall@tiss.edu, Mon-Sat 8am-10pm',
      },
    ];
  }

  // Generate crisis response message
  static getCrisisMessage(language: 'hindi' | 'hinglish' | 'english'): string {
    const messages = {
      hindi: `आप अकेले नहीं हैं। अभी मदद उपलब्ध है। कृपया किसी से बात करें - वे सुनेंगे और मदद करेंगे।`,
      hinglish: 'Aap alone nahi hain. Abhi help available hai. Please kisi se baat karein - woh sunenge aur help karenge.',
      english: 'You are not alone. Help is available right now. Please reach out to someone - they will listen and help.',
    };
    return messages[language];
  }

  updateConfig(config: Partial<CrisisDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Factory function
export function createCrisisDetector(config?: Partial<CrisisDetectionConfig>): CrisisDetector {
  return new CrisisDetector(config);
}