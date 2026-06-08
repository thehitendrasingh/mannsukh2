export type SilenceState = {
  lastSpeechEndTimestamp: number;
  lastSilenceTriggerTimestamp: number;
  silenceCount: number;
};

export function createSilenceManager(initialState?: Partial<SilenceState>): SilenceState & {
  markSpeechEnd(): void;
  canTrigger(silenceMs: number, minSilenceMs: number, cooldownMs: number): boolean;
  markTriggered(): void;
  reset(): void;
} {
  const state: SilenceState = {
    lastSpeechEndTimestamp: 0,
    lastSilenceTriggerTimestamp: 0,
    silenceCount: 0,
    ...initialState,
  };

  return {
    get lastSpeechEndTimestamp() {
      return state.lastSpeechEndTimestamp;
    },
    get lastSilenceTriggerTimestamp() {
      return state.lastSilenceTriggerTimestamp;
    },
    get silenceCount() {
      return state.silenceCount;
    },
    markSpeechEnd() {
      state.lastSpeechEndTimestamp = Date.now();
    },
    canTrigger(silenceMs: number, minSilenceMs: number, cooldownMs: number) {
      if (state.lastSpeechEndTimestamp === 0) return false;
      const elapsedSinceSpeechEnd = Date.now() - state.lastSpeechEndTimestamp;
      if (elapsedSinceSpeechEnd < minSilenceMs) return false;
      if (state.lastSilenceTriggerTimestamp > 0 && Date.now() - state.lastSilenceTriggerTimestamp < cooldownMs) return false;
      return true;
    },
    markTriggered() {
      state.lastSilenceTriggerTimestamp = Date.now();
      state.silenceCount += 1;
    },
    reset() {
      state.lastSpeechEndTimestamp = 0;
      state.lastSilenceTriggerTimestamp = 0;
      state.silenceCount = 0;
    },
  };
}
