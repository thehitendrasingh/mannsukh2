/**
 * Shunya Labs HTTP-based Streaming Clients
 * Browser-side clients that proxy through our own Next.js API routes
 * (server-side routes handle the actual Shunya API auth)
 *
 * Why HTTP instead of WebSocket:
 * - Browser WebSockets can't include Authorization headers (must use query string)
 * - Backend proxy keeps API key secure
 * - Simpler reliability — no need to maintain persistent WebSocket
 *
 * Trade-off: We do "batch" STT (record full audio, send once on speech end)
 *            rather than streaming chunks. This adds ~250ms latency but is more reliable.
 *            For streaming, the WebSocket would need to be handled server-side too.
 */

export interface StreamingSTTConfig {
  model: string;
  language?: string;
}

export interface StreamingTTSConfig {
  model: string;
  voice: string;
  language: string;
  responseFormat: 'mp3' | 'wav' | 'pcm';
  sampleRate?: number;
}

export interface STTStreamEvent {
  type: 'partial' | 'final' | 'error' | 'end';
  text?: string;
  confidence?: number;
  language?: string;
  error?: string;
}

export interface TTSStreamEvent {
  type: 'chunk' | 'complete' | 'error';
  audioBase64?: string;
  isFinal?: boolean;
  error?: string;
}

/**
 * Speech-to-Text Client (HTTP-based)
 * Records audio, then on demand POSTs the blob to /api/voice/transcribe
 */
export class StreamingSTTClient {
  private config: StreamingSTTConfig;
  private onEvent: (event: STTStreamEvent) => void;
  private isConnected = false;

  constructor(config: StreamingSTTConfig, onEvent: (event: STTStreamEvent) => void) {
    this.config = config;
    this.onEvent = onEvent;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.isConnected = true;
    console.log('[StreamingSTT] Connected (HTTP mode)');
  }

  /**
   * Send PCM audio from MicVAD for transcription.
   * Encodes the Float32Array as WAV and uploads it to the server.
   */
  async transcribeWav(audio: Float32Array, sampleRate: number = 16000): Promise<{ text: string; language?: string } | null> {
    try {
      const { float32ToWav } = await import('@/lib/audio/wavEncoder');
      const wavBlob = float32ToWav(audio, sampleRate);

      const duration = audio.length / sampleRate;
      console.log(
        `[STT] Uploading WAV: type=${wavBlob.type} size=${wavBlob.size} samples=${audio.length} sampleRate=${sampleRate} duration=${duration.toFixed(2)}s`
      );

      if (wavBlob.size < 500 || duration < 0.2) {
        console.warn('[STT] Audio too short, skipping');
        return null;
      }

      const formData = new FormData();
      formData.append('audio', new File([wavBlob], 'speech.wav', { type: 'audio/wav' }));
      formData.append('model', this.config.model);
      if (this.config.language && this.config.language !== 'auto') {
        formData.append('language', this.config.language);
      }

      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errMsg = errorData.details || errorData.error || errorData.message || `HTTP ${response.status}`;
        console.error('[StreamingSTT] Transcribe error:', errMsg, 'raw:', errorData);
        this.onEvent({ type: 'error', error: errMsg });
        return null;
      }

      const data = await response.json();
      const text = data.text || '';
      console.log(`[StreamingSTT] Transcribed: "${text.substring(0, 100)}"`);
      this.onEvent({ type: 'final', text, language: data.language });
      return { text, language: data.language };
    } catch (error) {
      console.error('[StreamingSTT] Fetch error:', error);
      this.onEvent({ type: 'error', error: error instanceof Error ? error.message : 'Network error' });
      return null;
    }
  }

  // Legacy methods (kept for API compatibility, no-ops for HTTP)
  sendAudio(_audioBase64: string): void {
    // No-op in HTTP mode — use transcribeWav instead
  }

  sendAudioBuffer(_buffer: ArrayBuffer): void {
    // No-op in HTTP mode — use transcribeWav instead
  }

  disconnect(): void {
    this.isConnected = false;
    console.log('[StreamingSTT] Disconnected');
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

/**
 * Text-to-Speech Client (HTTP-based)
 * POSTs text to /api/voice/synthesize, receives audio blob, queues for playback
 */
export class StreamingTTSClient {
  private config: StreamingTTSConfig;
  private onEvent: (event: TTSStreamEvent) => void;
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private isConnected = false;

  constructor(config: StreamingTTSConfig, onEvent: (event: TTSStreamEvent) => void) {
    this.config = config;
    this.onEvent = onEvent;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.isConnected = true;
    this.initAudioContext();
    console.log('[StreamingTTS] Connected (HTTP mode)');
  }

  /**
   * Synthesize text to speech via backend API and play it
   */
  async speak(text: string, isFinal: boolean = true): Promise<void> {
    if (!text.trim()) return;

    try {
      const response = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: this.config.language,
          voice: this.config.voice,
          model: this.config.model,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errMsg = errorData.error || `HTTP ${response.status}`;
        console.error('[StreamingTTS] Synthesize error:', errMsg);
        this.onEvent({ type: 'error', error: errMsg });
        return;
      }

      const audioBlob = await response.blob();
      console.log(`[StreamingTTS] Received audio: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

      if (audioBlob.size === 0) {
        this.onEvent({ type: 'error', error: 'Empty audio response' });
        return;
      }

      // Decode and queue the audio
      const arrayBuffer = await audioBlob.arrayBuffer();
      await this.decodeAndQueue(arrayBuffer);
      this.onEvent({ type: 'chunk', isFinal });

      if (isFinal) {
        // After all chunks are queued, wait for playback to finish
        await this.waitForPlaybackComplete();
        this.onEvent({ type: 'complete' });
      }
    } catch (error) {
      console.error('[StreamingTTS] Fetch error:', error);
      this.onEvent({ type: 'error', error: error instanceof Error ? error.message : 'Network error' });
    }
  }

  private async decodeAndQueue(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      console.warn('[StreamingTTS] No audio context, cannot decode');
      return;
    }

    try {
      // decodeAudioData requires a fresh ArrayBuffer each call in some browsers
      const bufferCopy = arrayBuffer.slice(0);
      const audioBuffer = await this.audioContext.decodeAudioData(bufferCopy);
      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying) {
        this.playQueue();
      }
    } catch (error) {
      console.error('[StreamingTTS] Audio decode error:', error);
      throw error;
    }
  }

  private async waitForPlaybackComplete(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.audioQueue.length === 0 && !this.isPlaying) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private async playQueue(): Promise<void> {
    if (this.audioQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const buffer = this.audioQueue.shift()!;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        this.playQueue().then(resolve);
      };
      source.start(0);
    });
  }

  private initAudioContext(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    } catch (error) {
      console.error('[StreamingTTS] Failed to init AudioContext:', error);
    }
  }

  // TODO: Implement streaming TTS if Shunya API supports it.
  // Architecture for future implementation:
  //   Qwen token stream -> sentence chunk -> TTS -> immediate playback
  // Currently Shunya TTS requires complete text for synthesis.
  sendText(_text: string, _isFinal: boolean = false): void {
    // No-op in HTTP mode — use speak() instead
  }

  interrupt(): void {
    this.audioQueue = [];
    this.isPlaying = false;
  }

  disconnect(): void {
    this.interrupt();
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    this.isConnected = false;
    console.log('[StreamingTTS] Disconnected');
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

// Factory functions
export function createStreamingSTTClient(
  config: StreamingSTTConfig,
  onEvent: (event: STTStreamEvent) => void
): StreamingSTTClient {
  return new StreamingSTTClient(config, onEvent);
}

export function createStreamingTTSClient(
  config: StreamingTTSConfig,
  onEvent: (event: TTSStreamEvent) => void
): StreamingTTSClient {
  return new StreamingTTSClient(config, onEvent);
}

// Default configs
export const DEFAULT_STT_CONFIG: StreamingSTTConfig = {
  model: 'zero-indic',
  language: 'hi', // Default to Hindi for Indian context
};

export const DEFAULT_TTS_CONFIG: StreamingTTSConfig = {
  model: 'zero-indic',
  voice: 'Kavita',
  language: 'hi',
  responseFormat: 'mp3',
  sampleRate: 24000,
};
