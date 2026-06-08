export interface ConversationLock {
  isAISpeaking: boolean;
  isSTTProcessing: boolean;
  isReflecting: boolean;
  lastInterruptAt: number;
}

export interface ConversationLockControls {
  lock: () => void;
  unlock: () => void;
  setSTTProcessing: (processing: boolean) => void;
  setReflecting: (reflecting: boolean) => void;
  isBlocked: () => boolean;
  canInterrupt: () => boolean;
}

export function createConversationLock(): ConversationLock & ConversationLockControls {
  const lock: ConversationLock = {
    isAISpeaking: false,
    isSTTProcessing: false,
    isReflecting: false,
    lastInterruptAt: 0,
  };

  return {
    get isAISpeaking() {
      return lock.isAISpeaking;
    },
    set isAISpeaking(value: boolean) {
      lock.isAISpeaking = value;
    },
    get isSTTProcessing() {
      return lock.isSTTProcessing;
    },
    get isReflecting() {
      return lock.isReflecting;
    },
    get lastInterruptAt() {
      return lock.lastInterruptAt;
    },
    lock() {
      lock.isAISpeaking = true;
    },
    unlock() {
      setTimeout(() => {
        lock.isAISpeaking = false;
      }, 500);
    },
    setSTTProcessing(processing: boolean) {
      lock.isSTTProcessing = processing;
    },
    setReflecting(reflecting: boolean) {
      lock.isReflecting = reflecting;
    },
    isBlocked() {
      return lock.isAISpeaking || lock.isSTTProcessing || lock.isReflecting;
    },
    canInterrupt() {
      return lock.isAISpeaking && Date.now() - lock.lastInterruptAt > 1000;
    },
  };
}
