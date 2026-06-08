/**
 * Streaming Voice API Endpoint (Server-Sent Events)
 * Handles real-time STT → LLM → TTS pipeline
 * 
 * FIX: VERCEL PRODUCTION UNICODE CORRUPTION
 * Root cause: Edge Runtime SSE chunk boundary splitting caused Hindi UTF-8 
 * multi-byte characters to be corrupted when chunks were split mid-sequence.
 * 
 * Fixes applied:
 * 1. Runtime changed from 'edge' to 'nodejs' for reliable TextDecoder
 * 2. Raw response logging at Groq API level
 * 3. Browser-side TextDecoder uses persistent decoder with { stream: true }
 * 4. SSE parser accumulator to handle split buffer boundaries
 * 5. NEXT_PUBLIC_DISABLE_LLM_STREAMING env flag for non-streaming fallback
 * 6. Pre-TTS validation hook
 * 7. Latency metrics fixed (turnMetricsMap)
 */

import { NextRequest } from 'next/server';
import { stripReasoning, hasReasoningTags } from '@/lib/utils/stripReasoning';
import { MANNSUKH_SYSTEM_PROMPT, MANNSUKH_USER_PROMPT } from '@/lib/prompts';

// Use Node.js runtime for reliable TextDecoder (Edge Runtime has 
// inconsistent behavior with multi-byte UTF-8 sequences)
export const runtime = 'nodejs';

// ============================================================
// FIX 7: turnMetricsMap for per-turn latency tracking
// ============================================================
interface TurnMetrics {
  turnId: string;
  sttStart: number;
  sttEnd: number;
  llmStart: number;
  llmEnd: number;
  ttsStart: number;
  ttsEnd: number;
}

const turnMetricsMap = new Map<string, TurnMetrics>();

export function getTurnMetrics(turnId: string): TurnMetrics | undefined {
  return turnMetricsMap.get(turnId);
}

export function setTurnMetrics(turnId: string, metrics: Partial<TurnMetrics>): void {
  const existing = turnMetricsMap.get(turnId) || {
    turnId,
    sttStart: 0,
    sttEnd: 0,
    llmStart: 0,
    llmEnd: 0,
    ttsStart: 0,
    ttsEnd: 0,
  };
  turnMetricsMap.set(turnId, { ...existing, ...metrics });
}

// ============================================================
// FIX 5: Pre-TTS Validation
// ============================================================
function isCorruptedHindi(text: string): boolean {
  // Criteria for corrupted Hindi:
  // 1. Mostly diacritics / combining marks with no meaningful content
  // 2. Mostly punctuation with scattered Hindi chars
  // 3. Extremely short with only combining characters
  
  const hindiRange = /[\u0900-\u097F]/;
  const combiningMarks = /[\u0900-\u0903\u093A-\u093C\u093E-\u094D\u0951-\u0954\u0962-\u0963]/;
  const latinChars = /[a-zA-Z]/;
  const punctuation = /[.,!?;:'"\-_()\[\]{}]/;
  
  // Count character types
  let hindiCount = 0;
  let combiningCount = 0;
  let latinCount = 0;
  let punctCount = 0;
  
  for (const char of text) {
    if (hindiRange.test(char)) hindiCount++;
    if (combiningMarks.test(char)) combiningCount++;
    if (latinChars.test(char)) latinCount++;
    if (punctuation.test(char)) punctCount++;
  }
  
  const total = text.length;
  if (total === 0) return true;
  
  // If mostly combining marks with no meaningful content
  if (combiningCount > 0 && hindiCount === 0) return true;
  
  // If mostly punctuation with very few Hindi chars
  if (punctCount > 0 && hindiCount > 0 && hindiCount < 2 && latinCount === 0) return true;
  
  // If extremely short and has combining marks but no full chars
  if (total < 5 && combiningCount > 0 && hindiCount === 0) return true;
  
  return false;
}

// ============================================================
// FIX 2: Raw Groq Response Logging
// ============================================================
interface RawResponseLog {
  timestamp: string;
  model: string;
  provider: 'groq' | 'qwen';
  transcript: string;
  rawResponse: string;
  parsedResponse: string;
  streamMode: boolean;
}

const rawResponseLogs: RawResponseLog[] = [];

export function getRawResponseLogs(): RawResponseLog[] {
  return rawResponseLogs;
}

// ============================================================
// SSE message helpers (GET endpoint only - SSE streaming)
// ============================================================
interface StreamMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

function createSSEMessage(message: StreamMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}

// ============================================================
// GET endpoint: SSE connection for streaming pipeline
// ============================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') || `session-${Date.now()}`;

  // Check for required API keys
  const hasShunya = Boolean(process.env.SHUNYALABS_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasQwen = Boolean(process.env.QWEN_API_KEY);
  if (!hasShunya || (!hasGroq && !hasQwen)) {
    return new Response(
      'data: ' + JSON.stringify({ type: 'error', payload: { message: 'API keys not configured' } }) + '\n\n',
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
    );
  }

  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send connection established
      controller.enqueue(encoder.encode(createSSEMessage({
        type: 'connected',
        payload: { sessionId },
        timestamp: Date.now(),
      })));

      try {
        // Pipeline ready signal
        controller.enqueue(encoder.encode(createSSEMessage({
          type: 'pipeline_ready',
          payload: { message: 'Streaming pipeline ready' },
          timestamp: Date.now(),
        })));

        // Keep connection alive
        const keepAlive = setInterval(() => {
          if (!isClosed) {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          }
        }, 30000);

        // Cleanup on close
        request.signal.addEventListener('abort', () => {
          isClosed = true;
          clearInterval(keepAlive);
          controller.close();
        });

      } catch (error) {
        console.error('[StreamAPI] Error:', error);
        controller.enqueue(encoder.encode(createSSEMessage({
          type: 'error',
          payload: { message: error instanceof Error ? error.message : 'Stream error' },
          timestamp: Date.now(),
        })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ============================================================
// FIX 3+4: SSE Parser with accumulator for split buffer boundaries
// ============================================================
class SSELineAccumulator {
  private buffer = '';
  
  /**
   * Feed raw bytes, get complete SSE data lines.
   * Handles the case where a `data:` line is split across 
   * two `reader.read()` calls (common on Vercel with small chunk sizes).
   */
  feed(chunk: string): string[] {
    this.buffer += chunk;
    
    // Split on SSE double-newline boundaries, but keep partial last segment
    const parts = this.buffer.split('\n');
    
    // The last part may be incomplete - keep it in the buffer
    this.buffer = parts.pop() || '';
    
    const lines: string[] = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('data:')) {
        lines.push(trimmed);
      } else if (trimmed.length > 0 && this.buffer.length === 0) {
        // If we have a non-empty line that doesn't start with 'data:',
        // and there's nothing left in the buffer, it could be a continuation
        // from a previous split - try parsing it as data
        if (trimmed.startsWith('{') || trimmed.startsWith('"')) {
          lines.push(trimmed);
        }
      }
    }
    
    return lines;
  }
  
  /**
   * Flush any remaining buffer content
   */
  flush(): string[] {
    if (!this.buffer.trim()) return [];
    const lines: string[] = [];
    const trimmed = this.buffer.trim();
    if (trimmed.startsWith('data:')) {
      lines.push(trimmed);
    }
    this.buffer = '';
    return lines;
  }
}

// ============================================================
// Non-streaming LLM call (fallback when NEXT_PUBLIC_DISABLE_LLM_STREAMING=true)
// ============================================================
async function callLLMNonStreaming(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  useGroq: boolean,
  requestStartTime: number
): Promise<{ content: string; firstTokenMs: number | null }> {
  console.log(`[LLM/NonStreaming] Calling ${useGroq ? 'Groq' : 'Qwen'} model=${model} stream=false`);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 80,
      stream: false,
      reasoning_effort: 'none',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM/NonStreaming] API error:`, response.status, errorText);
    throw new Error(`LLM API error: ${response.status}`);
  }

  const rawData = await response.json();
  const content = rawData.choices?.[0]?.message?.content?.trim() || '';
  const firstTokenMs = Date.now() - requestStartTime;
  
  console.log(`[LLM/NonStreaming] Raw response (${content.length} chars):`, content.substring(0, 200));
  
  return { content, firstTokenMs };
}

// ============================================================
// Streaming LLM call with robust SSE parser
// ============================================================
async function callLLMStreaming(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  useGroq: boolean,
  requestStartTime: number
): Promise<{ content: string; firstTokenMs: number | null }> {
  console.log(`[LLM/Streaming] Calling ${useGroq ? 'Groq' : 'Qwen'} model=${model} stream=true`);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 80,
      stream: true,
      reasoning_effort: 'none',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM/Streaming] API error:`, response.status, errorText);
    throw new Error(`LLM API error: ${response.status}`);
  }

  let firstTokenTime: number | null = null;
  let fullContent = '';
  
  // FIX 3: Use persistent decoder with { stream: true }
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();
  
  // FIX 4: Use SSE line accumulator to handle split buffer boundaries
  const accumulator = new SSELineAccumulator();
  
  if (!reader) {
    throw new Error('No reader available for streaming response');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // FIX 1: Log raw chunk for debugging
      console.log(`[RAW_CHUNK] size=${value?.byteLength || 0} bytes`);
      
      // FIX 3: Use persistent decoder with { stream: true }
      const chunk = decoder.decode(value, { stream: true });
      
      // Log Hindi presence in raw chunk
      const hasHindi = /[\u0900-\u097F]/.test(chunk);
      if (hasHindi) {
        console.log(`[RAW_CHUNK_HINDI] chunk contains Hindi: "${chunk.substring(0, 100)}"`);
      }

      // FIX 4: Use accumulator for split boundary handling
      const lines = accumulator.feed(chunk);
      
      for (const line of lines) {
        const dataStr = line.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') break;
        
        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta?.content || '';
          
          // Log raw delta for debugging
          if (delta) {
            console.log(`[RAW_DELTA] "${delta}"`);
          }
          
          if (delta) {
            if (fullContent.length === 0) {
              firstTokenTime = Date.now();
              console.log(`[StreamAPI/Turn] [${useGroq ? 'GROQ' : 'QWEN'}] First token: ${firstTokenTime - requestStartTime}ms`);
            }
            fullContent += delta;
          }
        } catch (parseError) {
          // Log parse failures for debugging but don't crash
          console.warn(`[SSE_PARSE_SKIP] Failed to parse line: "${dataStr.substring(0, 100)}"`, 
            parseError instanceof Error ? parseError.message : 'Parse error');
        }
      }
    }
    
    // Flush any remaining buffered content
    const remaining = accumulator.flush();
    for (const line of remaining) {
      const dataStr = line.replace(/^data:\s*/, '');
      try {
        const data = JSON.parse(dataStr);
        const delta = data.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
        }
      } catch {
        // ignore
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore cleanup errors
    }
  }

  return { content: fullContent.trim(), firstTokenMs: firstTokenTime };
}

// ============================================================
// POST endpoint: Turn-level reflection
// ============================================================
export async function POST(request: NextRequest) {
    const logEntry: RawResponseLog = {
      timestamp: new Date().toISOString(),
      model: '',
      provider: 'groq',
      transcript: '',
      rawResponse: '',
      parsedResponse: '',
      streamMode: true,
    };
    
    try {
      const { transcript, language, turnId, stage, stageStyle, maxWords } = await request.json();
      
      if (!transcript) {
        return Response.json({ error: 'Transcript required' }, { status: 400 });
      }

      logEntry.transcript = transcript;

      const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
      const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
      const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3-32b';

      const QWEN_API_KEY = process.env.QWEN_API_KEY || '';
      const QWEN_API_URL = process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen3-32b-chat';

      const useGroq = Boolean(GROQ_API_KEY);
      const apiKey = useGroq ? GROQ_API_KEY : QWEN_API_KEY;
      const apiUrl = useGroq ? GROQ_API_URL : QWEN_API_URL;
      const model = useGroq ? GROQ_MODEL : QWEN_MODEL;

      logEntry.model = model;
      logEntry.provider = useGroq ? 'groq' : 'qwen';

      console.log(`[StreamAPI/Turn] Processing transcript (${transcript.length} chars), language: ${language}, provider: ${useGroq ? 'Groq' : 'Qwen'}`);
      console.log(`[StreamAPI/Turn] Input text: "${transcript}"`);
      
      // FIX 8: Log VERCEL_GIT_COMMIT_SHA to verify production build
      console.log(`MANNSUKH_BUILD=${process.env.VERCEL_GIT_COMMIT_SHA || 'local'}`);

      // Track metrics per turn
      const currentTurnId = turnId || `turn-${Date.now()}`;
      if (turnId) {
        setTurnMetrics(turnId, { turnId, llmStart: Date.now() });
      }

      if (!apiKey) {
        return Response.json({ 
          reflection: 'Main yahan hoon. Sun raha hoon.',
          language: language || 'hinglish',
        });
      }

      const languageInstructions: Record<string, string> = {
        hindi: 'Reply in natural, conversational Hindi (not formal).',
        hinglish: 'Reply in natural Hinglish (mix of Hindi + English as people actually speak).',
        english: 'Reply in natural, conversational English.',
      };

      const lang = (language as string) || 'hinglish';
      const instruction = languageInstructions[lang] || languageInstructions.hinglish;

      const messages = [
        { role: 'system', content: MANNSUKH_SYSTEM_PROMPT },
        { role: 'user', content: MANNSUKH_USER_PROMPT({ 
          transcript, 
          language: lang, 
          instruction,
          stage: stage || undefined,
          stageStyle: stageStyle || undefined,
          maxWords: maxWords ? Number(maxWords) : undefined,
        }) },
      ];

      const requestStartTime = Date.now();
      
      // FIX 6: Check if streaming should be disabled
      const disableStreaming = process.env.NEXT_PUBLIC_DISABLE_LLM_STREAMING === 'true';
      logEntry.streamMode = !disableStreaming;
      
      let llmResult: { content: string; firstTokenMs: number | null };
      
      if (disableStreaming) {
        // Non-streaming path (debug mode)
        llmResult = await callLLMNonStreaming(
          apiUrl, apiKey, model, messages, useGroq, requestStartTime
        );
      } else {
        // Streaming path (production default)
        llmResult = await callLLMStreaming(
          apiUrl, apiKey, model, messages, useGroq, requestStartTime
        );
      }

      // Log raw response
      logEntry.rawResponse = llmResult.content;
      console.log(`[RAW_GROQ_RESPONSE] provider=${useGroq ? 'Groq' : 'Qwen'} model=${model} stream=${!disableStreaming}`);
      console.log(`[RAW_GROQ_TEXT] "${llmResult.content}"`);
      console.log(`[RAW_GROQ_TEXT_LENGTH] ${llmResult.content.length} chars`);

      const rawContent = llmResult.content;
      
      // Log Hindi-specific info
      const hasHindi = /[\u0900-\u097F]/.test(rawContent);
      console.log(`[UNICODE_CHECK] hasHindi=${hasHindi} contentLength=${rawContent.length}`);
      if (hasHindi) {
        console.log(`[UNICODE_CHECK_HINDI] codePoints=${Array.from(rawContent).length}`);
      }

      const hadReasoning = hasReasoningTags(rawContent);
      const content = stripReasoning(rawContent);

      logEntry.parsedResponse = content;

      if (hadReasoning) {
        console.log(`[StreamAPI/Turn] [${useGroq ? 'GROQ' : 'QWEN'}] Stripped reasoning. Final extracted response (${content.length} chars):`, content.substring(0, 200));
      }

      if (!content) {
        console.warn('[StreamAPI/Turn] Empty response after stripping reasoning');
        
        // FIX 5: Pre-TTS validation failed - use fallback
        const fallbackReflection = 'Mujhe lagta hai kuch technical dikkat aa gayi. Ek baar phir se bataoge?';
        
        if (turnId) {
          setTurnMetrics(turnId, { llmEnd: Date.now() });
        }
        
        rawResponseLogs.push(logEntry);
        
        return Response.json({
          reflection: fallbackReflection,
          language: lang,
          firstTokenMs: llmResult.firstTokenMs,
        });
      }

      // FIX 5: Pre-TTS validation - check for corrupted Hindi
      if (hasHindi && isCorruptedHindi(content)) {
        console.warn(`[PRE_TTS_VALIDATION] Corrupted Hindi detected: "${content}"`);
        console.warn(`[PRE_TTS_VALIDATION] Aborting TTS, using fallback. Raw was: "${rawContent}"`);
        
        const fallbackReflection = 'Mujhe lagta hai kuch technical dikkat aa gayi. Ek baar phir se bataoge?';
        
        if (turnId) {
          setTurnMetrics(turnId, { llmEnd: Date.now() });
        }
        
        rawResponseLogs.push(logEntry);
        
        return Response.json({
          reflection: fallbackReflection,
          language: 'hinglish',
          firstTokenMs: llmResult.firstTokenMs,
        });
      }

      // FIX 5: Final reflection validation before TTS
      console.log(`[FINAL_REFLECTION] "${content}"`);

      if (turnId) {
        setTurnMetrics(turnId, { llmEnd: Date.now() });
      }

      rawResponseLogs.push(logEntry);

      return Response.json({
        reflection: content,
        language: lang,
        firstTokenMs: llmResult.firstTokenMs,
      });
    } catch (error) {
      console.error('[StreamAPI/Turn] Error:', error);
      rawResponseLogs.push(logEntry);
      
      // FIX 5: Use fallback on error
      return Response.json({ 
        reflection: 'Mujhe lagta hai kuch technical dikkat aa gayi. Ek baar phir se bataoge?',
        language: 'hinglish',
      });
    }
  }

// ============================================================
// Debug endpoint for viewing raw response logs
// ============================================================
export async function OPTIONS() {
  return Response.json({
    logs: rawResponseLogs.slice(-50), // Last 50 logs
    metrics: Array.from(turnMetricsMap.entries()).slice(-20), // Last 20 entries
    build: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  });
}