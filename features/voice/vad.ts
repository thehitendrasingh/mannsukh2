/**
 * Voice Activity Detection Wrapper
 * Uses Silero VAD via @ricky0123/vad-web (MicVAD) for production-grade
 * real-time speech detection. Keeps a lightweight analyser only for UI level
 * updates.
 */

import { MicVAD } from "@ricky0123/vad-web";
import { VADResult, VADConfig, DEFAULT_VOICE_CONFIG } from "@/types/voice";
import type { RealTimeVADOptions } from "@ricky0123/vad-web";

const VAD_ASSET_BASE = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/";
const ONNX_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";

export interface VADCallbacks {
  onSpeechStart: (audioLevel: number) => void;
  onSpeechEnd: (durationMs: number, audio: Float32Array | null) => void;
  onVADUpdate: (result: VADResult) => void;
  onError: (error: Error) => void;
  onUserInterrupt?: () => void;
}

export class VoiceActivityDetector {
  private callbacks: VADCallbacks;
  private config: VADConfig;
  private isRunning = false;
  private speechActive = false;
  private mediaStream: MediaStream | null = null;
  private micVAD: MicVAD | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private speechStartTime = 0;
  private lastSpeechEndTime = 0;
  private aiSpeaking = false;
  private levelTimer: number | null = null;

  constructor(callbacks: VADCallbacks, config?: Partial<VADConfig>) {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_VOICE_CONFIG.vad, ...config };
  }

  async start(stream: MediaStream): Promise<void> {
    if (this.isRunning) return;

    try {
      this.mediaStream = stream;
      this.speechActive = false;
      this.lastSpeechEndTime = 0;

      await this.setupAudioContext(stream);
      await this.startMicVAD(stream);
      this.startLevelMonitoring();
      this.isRunning = true;
      console.log("[VAD] Started with Silero VAD (MicVAD)");
    } catch (error) {
      this.isRunning = false;
      this.callbacks.onError(error as Error);
      throw error;
    }
  }

  private async setupAudioContext(stream: MediaStream): Promise<void> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();

    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.3;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0;

    source.connect(this.analyser);
    this.analyser.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // non-fatal
      }
    }
  }

  private async startMicVAD(stream: MediaStream): Promise<void> {
    const vadConfig = this.config;
    this.micVAD = await MicVAD.new({
      baseAssetPath: VAD_ASSET_BASE,
      onnxWASMBasePath: ONNX_WASM_BASE,
      getStream: async () => stream,
      positiveSpeechThreshold: vadConfig.positiveSpeechThreshold,
      negativeSpeechThreshold: vadConfig.negativeSpeechThreshold,
      minSpeechMs: vadConfig.minSpeechMs,
      preSpeechPadMs: vadConfig.preSpeechPadMs,
      redemptionMs: vadConfig.redemptionMs,
      onSpeechStart: () => {
        const level = this.getCurrentAudioLevel();
        if (this.aiSpeaking) {
          this.callbacks.onUserInterrupt?.();
        }
        this.speechActive = true;
        this.speechStartTime = Date.now();
        this.callbacks.onSpeechStart(level);
      },
      onSpeechEnd: (audio: Float32Array) => {
        this.speechActive = false;
        this.lastSpeechEndTime = Date.now();
        const durationMs = this.lastSpeechEndTime - this.speechStartTime;
        this.callbacks.onSpeechEnd(durationMs, audio);
      },
      onVADMisfire: () => {},
      startOnLoad: true,
      processorType: "auto",
    } satisfies Partial<RealTimeVADOptions>);
  }

  private startLevelMonitoring(): void {
    if (this.levelTimer) return;
    this.levelTimer = window.setInterval(() => {
      if (!this.analyser || !this.dataArray || !this.audioContext || !this.isRunning) return;

      this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);

      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const audioLevel = Math.min(1, (sum / this.dataArray.length) / 128);

      const result: VADResult = {
        isSpeech: this.speechActive,
        confidence: audioLevel,
        audioLevel,
      };

      this.callbacks.onVADUpdate(result);
    }, 100);
  }

  private stopLevelMonitoring(): void {
    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
  }

  private getCurrentAudioLevel(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    return Math.min(1, (sum / this.dataArray.length) / 128);
  }

  setAISpeaking(isSpeaking: boolean): void {
    this.aiSpeaking = isSpeaking;
    if (this.micVAD && this.isRunning) {
      if (isSpeaking) {
        this.micVAD.pause();
      } else {
        this.micVAD.start();
      }
    }
  }

  getCurrentPauseDuration(): number {
    if (this.lastSpeechEndTime === 0) return 0;
    return Date.now() - this.lastSpeechEndTime;
  }

  stop(): void {
    this.isRunning = false;
    this.stopLevelMonitoring();

    if (this.micVAD) {
      this.micVAD.destroy().catch(() => {
        // ignore cleanup errors
      });
      this.micVAD = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        // ignore
      });
      this.audioContext = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.mediaStream = null;
    this.speechActive = false;
    this.aiSpeaking = false;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  isSpeechDetected(): boolean {
    return this.speechActive;
  }
}

export async function createVAD(
  stream: MediaStream,
  callbacks: VADCallbacks,
  _config?: Partial<VADConfig>
): Promise<VoiceActivityDetector> {
  const detector = new VoiceActivityDetector(callbacks, _config);
  await detector.start(stream);
  return detector;
}
