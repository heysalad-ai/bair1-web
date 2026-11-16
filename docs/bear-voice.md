# Bear One voice

The companion reads the existing displayed summary through an authenticated, output-only OpenAI Realtime session. Default voice: Cedar, warm and calm British English. There is no microphone capture, autoplay or browser speech-synthesis fallback.

`POST /api/voice/speak` accepts at most 1,200 characters and 8 KiB of JSON. Authentication runs first, followed by the existing shared daily voice budget (10 attempts per user, 100 globally). Device summaries use “Selected unit” instead of the identifying device label. Only the requested summary text and a hashed safety identifier reach OpenAI; the provider key remains server-side. Provider errors are sanitized. Audio is private/no-store and bounded to 2.5 MB PCM before base64 encoding.

Generation must finish within 35 seconds, return PCM16 mono at 24 kHz, and include a matching transcript. Comparison tolerates capitalization and punctuation, and treats spoken “minus” before digits as a negative sign, but separately checks numeric signs, decimal values and unit marks. It deliberately rejects paraphrases, including spelled-out replacements for digits. Failure leaves the original summary readable. Transcript verification is a provider-reported consistency check, not independent speech recognition or a guarantee about pronunciation.

The browser shows Preparing, Cancel, Stop, Mute and error states, plus an AI-generated voice disclosure. Cancellation aborts the request and guards against late fetch/play results. Text changes, hidden pages and unmounting stop companion playback. Audio starts only when explicitly requested and may still be rejected by browser autoplay policy; that failure is shown with a retry option.

The older Air Guide briefing endpoint also uses the same OpenAI speech generator, retaining its device authorization and text-only fallback.

## Provider choice

Checked 16 November 2026: OpenAI directs new speech integrations to Realtime; the older audio/speech TTS models are scheduled for retirement. No new environment variables or credentials are required: reuse the production `OPENAI_API_KEY`.

- [OpenAI text-to-speech guidance](https://developers.openai.com/api/docs/guides/text-to-speech)
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Realtime WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets?voice-api=realtime)
- [GPT-Realtime-2.1 mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

## NVIDIA facial animation

The companion now optionally passes the verified speech audio to the owned Modal deployment of NVIDIA's published Audio2Face Mark model. Its geometry is retargeted onto the existing SVG bear and synchronized to the audio playback clock. Reduced motion skips this stage. The old hosted NVIDIA demo is not used; production runs the official ONNX model on scale-to-zero CPU workers. See [the NVIDIA architecture and acceptance evidence](nvidia-face.md).

## Verification

`tests/openai-speech.mjs` checks output session configuration, transcript fidelity including changed numbers/signs/units, WAV format, cancellation, malformed or excessive output, authenticated cost gating and sanitized failures. Playback tests cover late responses, stop during play, completion and audio errors. The production-build smoke suite checks anonymous speech is rejected.

A real Cedar request using the existing production key returned an 8.45-second WAV with an exact transcript for a generic temperature sample and safety caveat. A harder sample revealed that Realtime transcribes negative signs as “minus”; the normalizer handles that exact equivalence while rejecting changed signs. The corrected implementation also generated a 17.25-second PM2.5/negative-temperature sample with the original history and connectivity caveats. This verifies provider generation, not subjective voice quality or browser playback. Browser playback and visual verification require the user's browser connection, which was unavailable during implementation.
