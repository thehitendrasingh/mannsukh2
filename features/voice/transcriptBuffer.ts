/**
 * Transcript Buffer - Rolling 3-minute / 2000-character window
 * Maintains conversation context without permanent storage
 */

import { TranscriptSegment, TranscriptBuffer as TranscriptBufferType } from '@/types/voice';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createTranscriptBuffer(): TranscriptBufferType {
  const segments: TranscriptSegment[] = [];
  let totalChars = 0;

  const buffer: TranscriptBufferType = {
    segments: [],
    totalChars: 0,
    addSegment: (segment: TranscriptSegment) => {
      segments.push(segment);
      totalChars += segment.text.length;
      buffer.segments = segments;
      buffer.totalChars = totalChars;
      // Cleanup old segments
      buffer.cleanup();
    },
    getContext: (maxChars = 2000, maxAgeMs = 180000) => {
      const now = Date.now();
      const relevantSegments = segments.filter(
        s => now - s.timestamp <= maxAgeMs
      );
      
      let context = '';
      let charCount = 0;
      
      // Add from most recent backwards
      for (let i = relevantSegments.length - 1; i >= 0; i--) {
        const segment = relevantSegments[i];
        if (charCount + segment.text.length > maxChars) break;
        context = segment.text + ' ' + context;
        charCount += segment.text.length;
      }
      
      return context.trim();
    },
    clear: () => {
      segments.length = 0;
      totalChars = 0;
      buffer.segments = segments;
      buffer.totalChars = totalChars;
    },
    cleanup: () => {
      const now = Date.now();
      const maxAgeMs = 180000; // 3 minutes
      const maxChars = 2000;
      
      // Remove old segments
      let removedChars = 0;
      const keepIndex = segments.findIndex(s => now - s.timestamp <= maxAgeMs);
      
      if (keepIndex > 0) {
        for (let i = 0; i < keepIndex; i++) {
          removedChars += segments[i].text.length;
        }
        segments.splice(0, keepIndex);
        totalChars = Math.max(0, totalChars - removedChars);
      }
      
      // If still over char limit, remove oldest
      while (totalChars > maxChars && segments.length > 0) {
        const removed = segments.shift();
        if (removed) {
          totalChars -= removed.text.length;
        }
      }
      
      buffer.segments = segments;
      buffer.totalChars = totalChars;
    },
  };

  return buffer;
}

// Helper to create a transcript segment
export function createTranscriptSegment(
  text: string,
  isFinal: boolean,
  language?: 'hindi' | 'hinglish' | 'english'
): TranscriptSegment {
  return {
    id: generateId(),
    text,
    timestamp: Date.now(),
    isFinal,
    language,
  };
}