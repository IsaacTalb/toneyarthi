# `@toneyarthi/ai`

Low-level Gemini HTTP client for schema-constrained structured output and audio
generation. It deliberately contains no language- or product-specific prompting.

Create a client with `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, and
`GEMINI_TTS_MODEL`, then call `generateStructured` with a JSON Schema and a type
guard. The schema is sent to Gemini, while the type guard independently validates
the parsed response at the caller boundary. `generateSpeech` returns the decoded
audio bytes and MIME type.

The transport enforces abort-based timeouts and response limits, retries rate
limits and transient failures with bounded exponential jitter, and emits only
redacted structured operational metadata through the optional logger.
