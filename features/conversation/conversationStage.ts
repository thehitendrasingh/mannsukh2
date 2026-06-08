/**
 * Conversation Stage Manager V1
 * Tracks conversation progress through EXPLORE → UNDERSTAND → REFLECT stages.
 * Stages control how the AI behaves at different points in the conversation.
 */

export enum ConversationStage {
  /** Turns 1-4: Ask questions, be curious, no reflection */
  EXPLORE = 'EXPLORE',
  /** Turns 5-8: Show understanding, light summaries, minimal reflection */
  UNDERSTAND = 'UNDERSTAND',
  /** Turns 9+: Reflection allowed but still short and conversational */
  REFLECT = 'REFLECT',
}

export interface StageConfig {
  turnRange: [number, number];
  behaviors: {
    allowReflection: boolean;
    allowAnalysis: boolean;
    maxWords: number;
    style: 'curious' | 'understanding' | 'reflective';
  };
}

export const STAGE_CONFIGS: Record<ConversationStage, StageConfig> = {
  [ConversationStage.EXPLORE]: {
    turnRange: [1, 4],
    behaviors: {
      allowReflection: false,
      allowAnalysis: false,
      maxWords: 15,
      style: 'curious',
    },
  },
  [ConversationStage.UNDERSTAND]: {
    turnRange: [5, 8],
    behaviors: {
      allowReflection: true,
      allowAnalysis: false,
      maxWords: 18,
      style: 'understanding',
    },
  },
  [ConversationStage.REFLECT]: {
    turnRange: [9, Infinity],
    behaviors: {
      allowReflection: true,
      allowAnalysis: true,
      maxWords: 22,
      style: 'reflective',
    },
  },
};

export interface ConversationState {
  turnCount: number;
  currentStage: ConversationStage;
  stageHistory: ConversationStage[];
}

/**
 * Create initial conversation state
 */
export function createConversationState(): ConversationState {
  return {
    turnCount: 0,
    currentStage: ConversationStage.EXPLORE,
    stageHistory: [ConversationStage.EXPLORE],
  };
}

/**
 * Increment turn and optionally advance stage
 */
export function advanceTurn(state: ConversationState): ConversationState {
  const newTurnCount = state.turnCount + 1;
  let newStage = state.currentStage;
  
  if (newTurnCount <= 4) {
    newStage = ConversationStage.EXPLORE;
  } else if (newTurnCount <= 8) {
    newStage = ConversationStage.UNDERSTAND;
  } else {
    newStage = ConversationStage.REFLECT;
  }
  
  const newState: ConversationState = {
    turnCount: newTurnCount,
    currentStage: newStage,
    stageHistory: [...state.stageHistory, newStage],
  };
  
  if (newStage !== state.currentStage) {
    console.log(`[ConversationStage] Advanced: ${state.currentStage} → ${newStage} (turn ${newTurnCount})`);
  }
  
  return newState;
}

/**
 * Get the current stage config for a given state
 */
export function getStageConfig(state: ConversationState): StageConfig {
  return STAGE_CONFIGS[state.currentStage];
}

/**
 * Reset conversation state for a new session
 */
export function resetConversationState(): ConversationState {
  return createConversationState();
}