export interface TurnManagerState {
  currentTurnId: string;
  silenceConsumed: boolean;
  responseGenerated: boolean;
  userSpeaking: boolean;
  aiSpeaking: boolean;
  turnStartTime: number;
  currentTurnActive: boolean;
}

export interface TurnManagerControls {
  startUserTurn(): string | null;
  endUserTurn(turnId: string): void;
  startAITurn(turnId: string): void;
  endAITurn(): void;
  markSilenceConsumed(): void;
  reset(): void;
  canRespondToSilence(): boolean;
  hasTranscript(): boolean;
  setTranscript(transcript: string): void;
}

export function createTurnManager(initialState?: Partial<TurnManagerState>): TurnManagerState & TurnManagerControls {
  const state: TurnManagerState = {
    currentTurnId: '',
    silenceConsumed: false,
    responseGenerated: false,
    userSpeaking: false,
    aiSpeaking: false,
    turnStartTime: 0,
    currentTurnActive: false,
    ...initialState,
  };

  return {
    get currentTurnId() {
      return state.currentTurnId;
    },
    get silenceConsumed() {
      return state.silenceConsumed;
    },
    get responseGenerated() {
      return state.responseGenerated;
    },
    get userSpeaking() {
      return state.userSpeaking;
    },
    get aiSpeaking() {
      return state.aiSpeaking;
    },
    get turnStartTime() {
      return state.turnStartTime;
    },
    get currentTurnActive() {
      return state.currentTurnActive;
    },
    startUserTurn() {
      if (state.currentTurnActive) {
        return null;
      }
      state.currentTurnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      state.silenceConsumed = false;
      state.responseGenerated = false;
      state.userSpeaking = true;
      state.currentTurnActive = true;
      state.turnStartTime = Date.now();
      return state.currentTurnId;
    },
    endUserTurn(_turnId: string) {
      state.userSpeaking = false;
      state.currentTurnActive = false;
    },
    startAITurn(_turnId: string) {
      state.aiSpeaking = true;
      state.responseGenerated = true;
      state.silenceConsumed = true;
      state.turnStartTime = Date.now();
    },
    endAITurn() {
      state.aiSpeaking = false;
    },
    markSilenceConsumed() {
      state.silenceConsumed = true;
    },
    reset() {
      state.currentTurnId = '';
      state.silenceConsumed = false;
      state.responseGenerated = false;
      state.userSpeaking = false;
      state.aiSpeaking = false;
      state.turnStartTime = 0;
      state.currentTurnActive = false;
    },
    canRespondToSilence() {
      if (state.aiSpeaking) return false;
      if (state.userSpeaking) return false;
      if (state.silenceConsumed) return false;
      if (state.responseGenerated) return false;
      return true;
    },
    hasTranscript() {
      return !!state.currentTurnId;
    },
    setTranscript(_transcript: string) {
      // transcript is now tied to turn lifecycle; this is a no-op
    },
  };
}
