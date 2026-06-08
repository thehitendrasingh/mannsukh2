/**
 * STT API Route - Server-side proxy to Shunya Labs
 * Browser POSTs audio blob here, we forward to Shunya with auth, return text
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.SHUNYALABS_API_KEY;
    if (!apiKey) {
      console.warn('[STT API] SHUNYALABS_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'STT service not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get form data (audio file + optional language/model)
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const model = (formData.get('model') as string) || 'zero-indic';
    const language = (formData.get('language') as string) || 'auto';

    if (!audioFile || !(audioFile instanceof Blob)) {
      return new Response(JSON.stringify({ error: 'Audio file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[STT API] Received audio: ${audioFile.size} bytes, type: ${audioFile.type}, language: ${language}`);

    // Reject tiny blobs that are almost certainly silence/noise
    if (audioFile.size < 500) {
      console.warn('[STT API] Audio blob too small, skipping:', audioFile.size);
      return new Response(JSON.stringify({ error: 'Audio too short' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build form data for Shunya API
    const shunyaFormData = new FormData();
    shunyaFormData.append('file', audioFile, 'speech.wav');
    shunyaFormData.append('model', model);
    if (language && language !== 'auto') {
      shunyaFormData.append('language', language);
    }
    shunyaFormData.append('response_format', 'json');

    // Call Shunya STT HTTP endpoint
    const sttUrl = 'https://asr.shunyalabs.ai/v1/audio/transcriptions';

    const sttResponse = await fetch(sttUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: shunyaFormData,
    });

    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      console.error('[STT API] Shunya STT error:', sttResponse.status, errorText);
      // Pass Shunya's error details through to the client so it can relay
      // proper error info back to the user instead of a generic message.
      return new Response(JSON.stringify({
        error: 'STT service failed',
        details: errorText.substring(0, 500),
        status: sttResponse.status,
      }), {
        status: sttResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await sttResponse.json();
    console.log(`[STT API] Transcribed: "${(data.text || '').substring(0, 100)}..."`);

    return new Response(JSON.stringify({
      text: data.text || '',
      language: data.language || language,
      confidence: data.confidence,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[STT API] Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
