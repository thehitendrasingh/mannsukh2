/**
 * TTS API Route - Server-side proxy to Shunya Labs
 * Browser POSTs text here, we forward to Shunya with auth, return audio blob
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, language = 'hinglish', voice = 'Kavita', model = 'zero-indic' } = body;

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.SHUNYALABS_API_KEY;
    if (!apiKey) {
      console.warn('[TTS API] SHUNYALABS_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'TTS service not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Map our app language to Shunya language code
    const langCode = (language === 'hindi' || language === 'hinglish') ? 'hi' : 'en';

    // Try the HTTP TTS endpoint
    const ttsUrl = 'https://tts.shunyalabs.ai/v1/audio/speech';

    const ttsResponse = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        language: langCode,
        response_format: 'mp3',
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('[TTS API] Shunya TTS error:', ttsResponse.status, errorText);
      return new Response(JSON.stringify({
        error: 'TTS service failed',
        details: errorText.substring(0, 200),
      }), {
        status: ttsResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get audio buffer
    const audioBuffer = await ttsResponse.arrayBuffer();
    const contentType = ttsResponse.headers.get('content-type') || 'audio/mpeg';

    console.log(`[TTS API] Synthesized ${audioBuffer.byteLength} bytes for "${text.substring(0, 50)}..."`);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[TTS API] Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
