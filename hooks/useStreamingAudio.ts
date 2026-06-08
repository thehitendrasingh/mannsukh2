/**
 * useStreamingAudio - Real-time audio playback with interrupt support
 * Handles streaming TTS audio chunks with immediate interruption capability
 */

'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

interface UseStreamingAudioOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onPlaybackError?: (error: Error) => void;
}

interface UseStreamingAudioReturn {
  isPlaying: boolean;
  playChunk: (base64Audio: string, isFinal?: boolean) => Promise<void>;
  interrupt: () => void;
  clearQueue: () => void;
}

export function useStreamingAudio(options: UseStreamingAudioOptions = {}): UseStreamingAudioReturn {
  const { onPlaybackStart, onPlaybackEnd, onPlaybackError } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isInterruptedRef = useRef(false);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialize audio context
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    
    // Create gain node for volume control
    gainNodeRef.current = audioContextRef.current.createGain();
    gainNodeRef.current.connect(audioContextRef.current.destination);
    gainNodeRef.current.gain.value = 1.0;

    return () => {
      // Cleanup
      interrupt();
      audioContextRef.current?.close().catch(console.error);
    };
  }, []);

  // Play audio queue
  const playQueue = useCallback(async () => {
    const audioContext = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    
    if (!audioContext || !gainNode || audioQueueRef.current.length === 0) {
      setIsPlaying(false);
      onPlaybackEnd?.();
      return;
    }

    if (isInterruptedRef.current) {
      audioQueueRef.current = [];
      setIsPlaying(false);
      onPlaybackEnd?.();
      return;
    }

    setIsPlaying(true);
    onPlaybackStart?.();

    const buffer = audioQueueRef.current.shift()!;
    
    try {
      // Resume audio context if suspended (browser policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      sourceRef.current = source;

      // Handle completion
      await new Promise<void>((resolve) => {
        source.onended = () => {
          sourceRef.current = null;
          resolve();
        };
        source.start(0);
      });

      // Continue with next chunk
      if (!isInterruptedRef.current) {
        await playQueue();
      }
    } catch (error) {
      console.error('[StreamingAudio] Playback error:', error);
      onPlaybackError?.(error as Error);
      setIsPlaying(false);
    }
  }, [onPlaybackStart, onPlaybackEnd, onPlaybackError]);

  // Add audio chunk to queue and play
  const playChunk = useCallback(async (base64Audio: string, isFinal = false): Promise<void> => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    try {
      // Decode base64
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      audioQueueRef.current.push(audioBuffer);

      // Start playing if not already
      if (!isPlaying && !isInterruptedRef.current) {
        await playQueue();
      }
    } catch (error) {
      console.error('[StreamingAudio] Decode error:', error);
      onPlaybackError?.(error as Error);
    }
  }, [isPlaying, playQueue, onPlaybackError]);

  // Interrupt current playback (user started speaking)
  const interrupt = useCallback(() => {
    isInterruptedRef.current = true;
    
    // Stop current source
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      sourceRef.current = null;
    }

    // Clear queue
    audioQueueRef.current = [];
    setIsPlaying(false);
    isInterruptedRef.current = false; // Reset for next playback
    
    onPlaybackEnd?.();
  }, [onPlaybackEnd]);

  // Clear queue without interrupting (for cleanup)
  const clearQueue = useCallback(() => {
    audioQueueRef.current = [];
  }, []);

  return {
    isPlaying,
    playChunk,
    interrupt,
    clearQueue,
  };
}