/**
 * Conversation memory for context-aware reflections.
 * Stores only the last N turns to prevent stale context contamination.
 */

export interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: number;
  language?: string;
}

export interface ConversationMemory {
  recentUserTurns: ConversationTurn[];
  recentAITurns: ConversationTurn[];
  currentTurnText: string;
}

export interface ConversationMemoryConfig {
  maxTurns: number; // number of turns to keep per side
}

export const DEFAULT_MEMORY_CONFIG: ConversationMemoryConfig = {
  maxTurns: 3,
};

export function createConversationMemory(config: ConversationMemoryConfig = DEFAULT_MEMORY_CONFIG): ConversationMemory {
  return {
    recentUserTurns: [],
    recentAITurns: [],
    currentTurnText: '',
  };
}

export function addUserTurn(memory: ConversationMemory, text: string, language?: string): void {
  memory.currentTurnText = text;

  memory.recentUserTurns.push({
    speaker: 'user',
    text,
    timestamp: Date.now(),
    language,
  });

  if (memory.recentUserTurns.length > 3) {
    memory.recentUserTurns = memory.recentUserTurns.slice(-3);
  }
}

export function addAITurn(memory: ConversationMemory, text: string): void {
  memory.recentAITurns.push({
    speaker: 'ai',
    text,
    timestamp: Date.now(),
  });

  if (memory.recentAITurns.length > 3) {
    memory.recentAITurns = memory.recentAITurns.slice(-3);
  }
}

export function resetConversationMemory(memory: ConversationMemory): void {
  memory.recentUserTurns = [];
  memory.recentAITurns = [];
  memory.currentTurnText = '';
}

export function getRecentUserTurns(memory: ConversationMemory): string[] {
  return memory.recentUserTurns.map(t => t.text);
}

export function getRecentAITurns(memory: ConversationMemory): string[] {
  return memory.recentAITurns.map(t => t.text);
}
