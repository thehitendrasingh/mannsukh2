'use client';

import { useState, useRef, useEffect } from 'react';

interface UseAudioRecorderResult {
  isRecording: boolean;
  volumeLevel: number; // 0 to 100
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported';
  audioBlob: Blob | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearRecording: () => void;
  error: string | null;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Check if MediaRecorder is supported
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        setPermissionStatus('unsupported');
      } else {
        // Query permissions if API supported
        navigator.permissions
          .query({ name: 'microphone' as PermissionName })
          .then((status) => {
            setPermissionStatus(status.state as any);
            status.onchange = () => {
              setPermissionStatus(status.state as any);
            };
          })
          .catch(() => {
            // Permissions query might throw in some browsers (e.g. Firefox), default to prompt
            setPermissionStatus('prompt');
          });
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecordingResources();
    };
  }, []);

  const stopRecordingResources = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  };

  const startRecording = async () => {
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];

    if (permissionStatus === 'unsupported') {
      setError('Recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermissionStatus('granted');

      // 1. Setup Web Audio API for volume levels
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start volume level polling
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Map average (0-255) to 0-100 scale, filtering low noise
        const level = Math.min(100, Math.max(0, Math.round((average / 120) * 100)));
        setVolumeLevel(level);

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // 2. Setup MediaRecorder
      // Try to use a standard high-quality mimeType
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        options = { mimeType: 'audio/ogg;codecs=opus' };
      }

      console.log('[AudioRecorder] MediaRecorder options:', options);
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        console.log('[AudioRecorder] ondataavailable:', event.data?.size, 'bytes, type:', event.data?.type);
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('[AudioRecorder] onstop fired, chunks:', chunksRef.current.length);
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('[AudioRecorder] Created blob:', blob.size, 'bytes, type:', blob.type);
        setAudioBlob(blob);
        setIsRecording(false);
        setVolumeLevel(0);
      };
      
      recorder.onerror = (event) => {
        console.error('[AudioRecorder] MediaRecorder error:', event.error);
      };

      // Start recording
      recorder.start(250); // Slice chunks every 250ms
      setIsRecording(true);

    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionStatus('denied');
        setError('Microphone permission denied. Please allow mic access to talk.');
      } else {
        setError(err.message || 'Could not access microphone.');
      }
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    
    // Stop recording animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Trigger recorder stop
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop streams
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch((err) => console.error(err));
    }
  };

  const clearRecording = () => {
    stopRecordingResources();
    setAudioBlob(null);
    setIsRecording(false);
    setVolumeLevel(0);
    setError(null);
  };

  return {
    isRecording,
    volumeLevel,
    permissionStatus,
    audioBlob,
    startRecording,
    stopRecording,
    clearRecording,
    error
  };
}
