# TTS and mobile audio format audit

Audit date: 2026-08-31. Re-check these conclusions when the Gemini model, Expo
SDK, or native OS minimums change.

## Decision

The selected Gemini native-audio TTS endpoint currently returns base64-encoded,
mono, 16-bit PCM at 24 kHz (`audio/L16`/`audio/pcm`), not a selectable OGG Opus
or MP3 response. The audio Worker therefore only wraps those bytes in a WAV
header; it does not claim that changing a MIME type compresses the data and it
does not run FFmpeg. See Google's [speech generation
documentation](https://ai.google.dev/gemini-api/docs/speech-generation) and
[TTS sample](https://ai.google.dev/gemini-api/docs/speech-generation#javascript).

For distribution, the preferred future artifact is mono OGG Opus at 24–32
kbps. Android's platform table supports Opus in OGG on current supported API
levels, but Apple's AVFoundation documentation does not provide an equivalent
end-to-end OGG Opus guarantee. Consequently OGG Opus is **not verified for both
mobile platforms**. The fallback distribution artifact is mono MP3 at 32–48
kbps, which is listed by both Android and Apple playback stacks. Relevant
primary references are Android's [supported media
formats](https://developer.android.com/media/platform/supported-formats) and
Apple's [audio file and data formats](https://developer.apple.com/documentation/avfaudio/audio-file-formats).

The mobile app currently has no playback dependency or playback implementation.
Expo SDK 54 recommends `expo-audio`, but its API delegates decoding to the native
platforms; installing it alone would not convert PCM or make OGG support
portable. The codec decision must be re-tested on the application's oldest
supported physical Android and iOS devices when playback is implemented. See
the [`expo-audio` documentation](https://docs.expo.dev/versions/v54.0.0/sdk/audio/).

## Size budget and validation

The currently stored PCM WAV is 384 kbps (24,000 samples/second × 16 bits × one
channel), or about 48 KB/second before its 44-byte header. It exceeds the
approximate 2 MiB target at roughly 43.7 seconds. Gemini controls narration
duration and only supplies PCM, so the target **cannot be guaranteed** without
a separately deployed, supported transcoding service or a provider outputting
MP3/Opus directly. A nominal 32 kbps file reaches 2 MiB near 8.7 minutes; 48
kbps reaches it near 5.8 minutes, so even compressed output needs a duration or
hard-size policy.

The Worker now:

- accepts only mono PCM source MIME declarations and rejects unsupported codec,
  channel, sample-rate, and sample-alignment values;
- validates RIFF, WAVE, PCM, mono, 16-bit, and data-length fields in the emitted
  WAV header before upload;
- validates the final R2 `Content-Type`, readiness, codec, duration, bitrate,
  and exact stored size metadata;
- emits a structured `audio.size.over_target` warning above 2 MiB and persists
  `size_warning = 'over_target'`; and
- records codec, bitrate, byte size, duration, channels, and sample rate for API
  and mobile consumers.

The warning is deliberately not a rejection: longer narration remains usable,
and a warning accurately reflects that this is a target rather than a valid
universal upper bound.

## Path to compressed delivery

Do not add FFmpeg/WASM processing to this Worker. Introduce an external media
transcoding service or use a provider-side compressed response, retain the
validated PCM source until conversion succeeds, inspect the resulting
container headers, and publish atomically. Select OGG Opus only after physical
device playback tests pass on both supported OS ranges; otherwise publish mono
MP3 at 32–48 kbps. In either case, store measured (not requested) codec,
average bitrate, size, and duration and keep the same 2 MiB warning.
