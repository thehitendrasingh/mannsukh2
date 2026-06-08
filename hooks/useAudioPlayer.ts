'use client';

import { useState, useRef, useEffect } from 'react';

interface UseAudioPlayerResult {
  isPlaying: boolean;
  isLoading: boolean;
  speak: (text: string, language: string) => Promise<void>;
  stop: () => void;
  error: string | null;
}

export function useAudioPlayer(): UseAudioPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nativeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const stopPlayback = () => {
    // Stop custom audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Stop browser native speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    setIsPlaying(false);
    setIsLoading(false);
  };

  const playShunyaTTS = async (text: string, language: string): Promise<boolean> => {
    console.log('[AudioPlayer] playShunyaTTS called, text length:', text.length, 'language:', language);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, language }),
      });

      console.log('[AudioPlayer] TTS API response status:', response.status);
      if (!response.ok) {
        throw new Error('TTS service failed or key not configured');
      }

      const audioBlob = await response.blob();
      console.log('[AudioPlayer] Audio blob received:', audioBlob.size, 'bytes, type:', audioBlob.type);
      if (audioBlob.size === 0) {
        throw new Error('Received empty audio file');
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        console.log('[AudioPlayer] Audio playback started');
        setIsLoading(false);
        setIsPlaying(true);
      };

      audio.onended = () => {
        console.log('[AudioPlayer] Audio playback ended');
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = (e) => {
        console.error('[AudioPlayer] Audio playback error:', e);
        setError('Failed to play synthesized audio');
        setIsPlaying(false);
        setIsLoading(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
      return true;

    } catch (err: any) {
      console.warn('[AudioPlayer] Shunya TTS unavailable, falling back to native:', err.message);
      setIsLoading(false);
      return false; // Indicate need for fallback
    }
  };

  const playNativeTTS = (text: string, language: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setError('Text-to-speech is not supported in this browser.');
      return;
    }

    setIsLoading(true);
    window.speechSynthesis.cancel();

    // Setup speech synthesis
    const utterance = new SpeechSynthesisUtterance(text);
    nativeUtteranceRef.current = utterance;

    // Auto-detect best voice (Hindi / English India)
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;

    if (language === 'english') {
      // Look for Indian English (en-IN) or standard English
      selectedVoice = voices.find(v => v.lang.includes('en-IN')) || 
                      voices.find(v => v.lang.startsWith('en')) || 
                      voices[0];
    } else {
      // Hindi (hi-IN) or Hinglish fallback
      selectedVoice = voices.find(v => v.lang.startsWith('hi')) || 
                      voices.find(v => v.lang.includes('en-IN')) || 
                      voices[0];
      
      // Slow down slightly for Hindi/Hinglish readability on standard English voices
      if (selectedVoice && !selectedVoice.lang.startsWith('hi')) {
        utterance.rate = 0.85; 
      }
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        setError('Browser speech synthesis failed.');
      }
      setIsPlaying(false);
      setIsLoading(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const speak = async (text: string, language: string) => {
    stopPlayback();
    
    // 1. Try to synthesize via backend Shunya API
    const success = await playShunyaTTS(text, language);
    
    // 2. Fall back to browser native speech synthesis if Shunya API fails/is-unconfigured
    if (!success) {
      playNativeTTS(text, language);
    }
  };

  const stop = () => {
    stopPlayback();
  };

  return {
    isPlaying,
    isLoading,
    speak,
    stop,
    error,
  };
}
