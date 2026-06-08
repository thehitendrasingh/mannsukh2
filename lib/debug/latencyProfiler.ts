/**
 * Latency profiler for the voice pipeline.
 */

export interface LatencyMarkers {
  speechEndTime: number;
  sttStartTime: number;
  sttEndTime: number;
  llmStartTime: number;
  llmFirstTokenTime: number | null;
  llmEndTime: number;
  ttsStartTime: number | null;
  ttsFirstAudioTime: number | null;
  ttsEndTime: number | null;
  playbackStartTime: number | null;
}

export interface LatencyReport {
  sttMs: number | null;
  llmMs: number | null;
  llmFirstTokenMs: number | null;
  ttsMs: number | null;
  totalMs: number | null;
}

export function createLatencyMarkers(speechEndTime: number): LatencyMarkers {
  return {
    speechEndTime,
    sttStartTime: Date.now(),
    sttEndTime: 0,
    llmStartTime: 0,
    llmFirstTokenTime: null,
    llmEndTime: 0,
    ttsStartTime: null,
    ttsFirstAudioTime: null,
    ttsEndTime: null,
    playbackStartTime: null,
  };
}

export function reportLatency(markers: LatencyMarkers): LatencyReport {
  const sttMs = markers.sttEndTime - markers.sttStartTime || null;
  const llmMs = markers.llmEndTime - markers.llmStartTime || null;
  const llmFirstTokenMs = markers.llmFirstTokenTime ? markers.llmFirstTokenTime - markers.llmStartTime : null;
  const ttsMs =
    markers.ttsEndTime && markers.ttsStartTime
      ? markers.ttsEndTime - markers.ttsStartTime
      : null;
  const totalMs = markers.playbackStartTime ? markers.playbackStartTime - markers.speechEndTime : null;

  console.log('[Latency] STT:', sttMs ? `${sttMs}ms` : 'n/a');
  console.log('[Latency] LLM:', llmMs ? `${llmMs}ms` : 'n/a');
  console.log('[Latency] LLM first token:', llmFirstTokenMs ? `${llmFirstTokenMs}ms` : 'n/a');
  console.log('[Latency] TTS:', ttsMs ? `${ttsMs}ms` : 'n/a');
  console.log('[Latency] Total:', totalMs ? `${totalMs}ms` : 'n/a');

  return { sttMs, llmMs, llmFirstTokenMs, ttsMs, totalMs };
}
