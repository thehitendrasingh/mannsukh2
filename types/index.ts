export type SessionState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'analyzing'
  | 'clarity_ready'
  | 'feedback'
  | 'complete'
  | 'crisis';

export interface ClarityData {
  whatIHeard: string;
  whatMightBeUnderneath: string;
  onePerspective: string;
  language: 'english' | 'hindi' | 'hinglish';
  confidence: number;
}

export interface ClaritySessionResponse {
  sessionId: string;
  crisis: boolean;
  whatIHeard: string;
  whatMightBeUnderneath: string;
  onePerspective: string;
  language: 'english' | 'hindi' | 'hinglish';
  confidence: number;
}
