# MANNSUKH VAD REFACTOR

Refactor the existing VoiceActivityDetector implementation.

Context:

I have already installed:

npm install @ricky0123/vad-web

The current implementation uses:

- Web Audio API
- AnalyserNode
- Frequency-based speech detection
- Custom volume thresholds
- requestAnimationFrame monitoring

This implementation should no longer be used as the primary VAD engine.

We want to migrate MannSukh to use:

@ricky0123/vad-web (Silero VAD)

which provides significantly more accurate speech detection for real-time voice conversations.

--------------------------------------------------
GOAL
--------------------------------------------------

Replace custom speech detection logic with Silero VAD while preserving the public API used by the rest of the application.

The VAD should be optimized for:

- real-time conversations
- Hindi
- Hinglish
- English
- mobile browsers
- low latency
- user interruptions

--------------------------------------------------
REFACTOR REQUIREMENTS
--------------------------------------------------

1. Remove custom speech detection logic

Delete:

- getByteFrequencyData based detection
- volume thresholds
- volume speech counters
- silence counters
- frequency spectrum analysis
- custom speech detection heuristics

These are no longer required.

--------------------------------------------------
2. Use MicVAD from vad-web

Import:

import { MicVAD } from "@ricky0123/vad-web";

Use MicVAD as the primary VAD engine.

Speech detection should come entirely from:

- onSpeechStart
- onSpeechEnd

provided by MicVAD.

--------------------------------------------------
3. Preserve Existing Callback Interface

Keep:

interface VADCallbacks {
  onSpeechStart(...)
  onSpeechEnd(...)
  onVADUpdate(...)
  onError(...)
}

Refactor internally only.

Avoid breaking consumers.

--------------------------------------------------
4. Preserve Audio Level Support

The application still needs:

audioLevel

for:

- breathing orb
- speaking animation
- listening animation

Keep a lightweight analyser node only for UI visualization.

Do NOT use it for speech detection.

Use it only to calculate:

audioLevel

for UI updates.

--------------------------------------------------
5. Add User Interruption Detection

Add support for:

onUserInterrupt()

When:

AI is speaking

AND

MicVAD detects speech start

Trigger:

onUserInterrupt()

This will allow MannSukh to stop TTS playback immediately.

User should always have priority.

--------------------------------------------------
6. Add Explicit AI Speaking State

Add:

setAISpeaking(isSpeaking: boolean)

When AI is speaking:

speech from user should be treated as interruption.

--------------------------------------------------
7. Add Pause Tracking

Store:

lastSpeechEndTime

Expose:

getCurrentPauseDuration()

This will be used by the Reflection Engine.

Example:

pause > 2500ms

=> generate reflection

--------------------------------------------------
8. Remove requestAnimationFrame Loop

Do not use requestAnimationFrame for VAD.

Speech detection should be handled by MicVAD.

Only keep lightweight audio level updates for UI.

Limit UI updates to:

10-20 times per second.

Optimize for battery life.

--------------------------------------------------
9. Improve Cleanup

Ensure stop() properly cleans:

- MicVAD
- AudioContext
- GainNode
- SourceNode
- Timers
- Event listeners

Avoid memory leaks.

--------------------------------------------------
10. Maintain Public Methods

Keep:

start()
stop()
getIsRunning()
isSpeechDetected()

Add:

setAISpeaking()
getCurrentPauseDuration()

--------------------------------------------------
11. Type Safety

Use proper TypeScript types.

Avoid:

any

Use MicVAD types wherever available.

--------------------------------------------------
12. Output

After refactor provide:

1. Explanation of architecture changes
2. Full updated VoiceActivityDetector implementation
3. Any required package updates
4. Any required type updates
5. Any changes required in consuming components

Goal:

MannSukh should use Silero VAD for production-grade speech detection while keeping existing application integrations working.
