/**
 * Streaming Voice API Endpoint (Server-Sent Events)
 * Handles real-time STT → LLM → TTS pipeline
 */

import { NextRequest } from 'next/server';
import { stripReasoning, hasReasoningTags } from '@/lib/utils/stripReasoning';

export const runtime = 'edge';

interface StreamMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

function createSSEMessage(message: StreamMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}

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

export async function POST(request: NextRequest) {
    // Handle turn-level reflection requests (non-streaming fallback)
    try {
      const { transcript, language } = await request.json();
      
      if (!transcript) {
        return Response.json({ error: 'Transcript required' }, { status: 400 });
      }

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

      console.log(`[StreamAPI/Turn] Processing transcript (${transcript.length} chars), language: ${language}, provider: ${useGroq ? 'Groq' : 'Qwen'}`);

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

      const systemPrompt = `You are MannSukh - a calm, warm elder sibling who listens deeply.

CRITICAL OUTPUT RULE:
- Do NOT include any <think>, <reasoning>, <chain_of_thought>, or internal monologue tags.
- Do NOT include any reasoning, thinking, or meta-commentary.
- Reply DIRECTLY with only the final reflection text.
- No markdown, no code blocks, no XML tags.
- Start your response immediately with the reflection content.
- Keep it SHORT: 10-20 words maximum, 25 words absolute max.

Your role: Help users understand their thoughts and feelings through gentle reflection.

You are NOT:
- A therapist, coach, or counselor
- An assistant or adviser
- A motivational speaker
- A friend who gives opinions
- A task assistant who gives advice

You DO:
- Listen more than you speak (70/30 ratio)
- Reflect back what you hear with emotional clarity
- Identify patterns the user might not see
- Offer grounded perspectives, not advice
- Speak in the user's natural language (Hindi, Hinglish, or English)

Style:
- SHORT: 10-20 words max, 25 words absolute max
- Natural, conversational, calm
- Warm but not overly intimate
- Never use therapy clichés: "practice self-love", "stay positive", "your inner child", "everything happens for a reason", "you are valid", "believe in yourself"
- No markdown, no formatting, just plain speech
- Prioritize: reflection, curiosity, follow-up questions
- Avoid: explanations, long observations, advice, step-by-step instructions

Language rule: ALWAYS reply in the user's language. Match their conversational style exactly.`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User said: "${transcript}"\n\nLanguage: ${lang}\n${instruction}\n\nReflect back gently - what might they be feeling underneath? Short reflection, 10-20 words max.` },
          ],
          temperature: 0.4,
          max_tokens: 80,
          stream: true,
          reasoning_effort: 'none',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[StreamAPI/Turn] ${useGroq ? 'Groq' : 'Qwen'} API error:`, response.status, errorText);
        return Response.json({
          reflection: 'Lag raha hai kuch baatein abhi bhi andar hain.',
          language: lang,
        });
      }

      const requestStartTime = Date.now();
      let firstTokenTime: number | null = null;
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
            for (const line of lines) {
              const dataStr = line.replace(/^data:\s*/, '');
              if (dataStr === '[DONE]') break;
              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices?.[0]?.delta?.content || '';
                if (delta) {
                  if (fullContent.length === 0) {
                    firstTokenTime = Date.now();
                    console.log(`[StreamAPI/Turn] [QWEN] First token: ${firstTokenTime - requestStartTime}ms`);
                  }
                  fullContent += delta;
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        // Fallback to non-streaming if reader unavailable
        const rawData = await response.json();
        fullContent = rawData.choices?.[0]?.message?.content?.trim() || '';
      }

      const rawContent = fullContent.trim();
      console.log(`[StreamAPI/Turn] [QWEN] Raw response (${rawContent.length} chars):`, rawContent.substring(0, 200));

      const hadReasoning = hasReasoningTags(rawContent);
      const content = stripReasoning(rawContent);

      if (hadReasoning) {
        console.log(`[StreamAPI/Turn] [QWEN] Stripped reasoning. Final extracted response (${content.length} chars):`, content.substring(0, 200));
      }

      if (!content) {
        console.warn('[StreamAPI/Turn] [QWEN] Empty response after stripping reasoning');
        return Response.json({
          reflection: 'Main yahan hoon. Sun raha hoon.',
          language: lang,
        });
      }

      return Response.json({
        reflection: content,
        language: lang,
        firstTokenMs: firstTokenTime ? firstTokenTime - requestStartTime : null,
      });
    } catch (error) {
      console.error('[StreamAPI/Turn] Error:', error);
      return Response.json({ 
        reflection: 'Kuch samajh nahi aaya. Phir se kaho?',
        language: 'hinglish',
      });
    }
  }