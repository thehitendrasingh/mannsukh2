/**
 * Early commit: allow quicker turn completion when transcript is clearly complete.
 */

export interface EarlyCommitResult {
  shouldCommit: boolean;
  reason: 'high_confidence_complete' | 'wait';
}

export function evaluateEarlyCommit({
  transcript,
  confidence,
}: {
  transcript: string;
  confidence?: number;
}): EarlyCommitResult {
  const trimmed = transcript.trim();

  if (typeof confidence === 'number' && confidence >= 0.85 && trimmed.length >= 8) {
    return { shouldCommit: true, reason: 'high_confidence_complete' };
  }

  return { shouldCommit: false, reason: 'wait' };
}
