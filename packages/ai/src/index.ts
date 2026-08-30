export type JsonSchema = Readonly<Record<string, unknown>>;

export interface GeminiEnvironment {
  GEMINI_API_KEY?: string;
  GEMINI_TEXT_MODEL?: string;
  GEMINI_TTS_MODEL?: string;
}

export interface GeminiLogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  attempt?: number;
  model?: string;
  status?: number;
  retryInMs?: number;
  error?: string;
}

export interface GeminiClientOptions {
  fetch?: typeof fetch;
  logger?: (entry: GeminiLogEntry) => void;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxResponseBytes?: number;
  random?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  endpoint?: string;
}

export interface StructuredOutputRequest<T> {
  prompt: string;
  schema: JsonSchema;
  validate: (value: unknown) => value is T;
  signal?: AbortSignal;
  model?: string;
  systemInstruction?: string;
}

export interface SpeechRequest {
  text: string;
  voice?: string;
  signal?: AbortSignal;
  model?: string;
}

export interface SpeechOutput {
  data: Uint8Array;
  mimeType: string;
}

export class GeminiError extends Error {
  readonly code:
    | 'configuration'
    | 'timeout'
    | 'network'
    | 'http'
    | 'response_too_large'
    | 'invalid_response'
    | 'invalid_json'
    | 'schema_validation';
  readonly status?: number;

  constructor(
    message: string,
    code:
      | 'configuration'
      | 'timeout'
      | 'network'
      | 'http'
      | 'response_too_large'
      | 'invalid_response'
      | 'invalid_json'
      | 'schema_validation',
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
  }
}

const defaults = {
  timeoutMs: 30_000,
  maxRetries: 3,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
  maxResponseBytes: 2 * 1024 * 1024,
  endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  random: Math.random,
  sleep: abortableSleep,
};

const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);

function required(value: string | undefined, name: string): string {
  if (!value?.trim())
    throw new GeminiError(`${name} is required`, 'configuration');
  return value.trim();
}

function abortableSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function combineSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  timedOut: () => boolean;
  clear: () => void;
} {
  const controller = new AbortController();
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timeout,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function readBounded(
  response: Response,
  maximum: number,
): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) {
    throw new GeminiError(
      'Gemini response exceeded size limit',
      'response_too_large',
    );
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new GeminiError(
        'Gemini response exceeded size limit',
        'response_too_large',
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch (cause) {
    const start = candidate.search(/[[{]/);
    if (start >= 0) {
      for (let end = candidate.length; end > start; end--) {
        try {
          return JSON.parse(candidate.slice(start, end));
        } catch {
          /* try a shorter suffix */
        }
      }
    }
    throw new GeminiError(
      'Gemini returned invalid JSON',
      'invalid_json',
      undefined,
      { cause },
    );
  }
}

function responseText(payload: unknown): string {
  const value = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const text = value.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === 'string',
  )?.text;
  if (typeof text !== 'string')
    throw new GeminiError(
      'Gemini response did not contain text',
      'invalid_response',
    );
  return text;
}

export function createGeminiClient(
  env: GeminiEnvironment,
  options: GeminiClientOptions = {},
) {
  const apiKey = required(env.GEMINI_API_KEY, 'GEMINI_API_KEY');
  const textModel = required(env.GEMINI_TEXT_MODEL, 'GEMINI_TEXT_MODEL');
  const ttsModel = required(env.GEMINI_TTS_MODEL, 'GEMINI_TTS_MODEL');
  const config = { ...defaults, ...options };
  const fetcher = options.fetch ?? globalThis.fetch;
  const log = (entry: GeminiLogEntry) => options.logger?.(entry);

  async function request(
    model: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = `${config.endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    for (let attempt = 0; ; attempt++) {
      const timeout = combineSignal(signal, config.timeoutMs);
      try {
        log({ level: 'info', event: 'gemini.request', attempt, model });
        const response = await fetcher(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: timeout.signal,
        });
        const raw = await readBounded(response, config.maxResponseBytes);
        if (!response.ok) {
          const retryable = retryStatuses.has(response.status);
          if (!retryable || attempt >= config.maxRetries) {
            log({
              level: 'error',
              event: 'gemini.failure',
              attempt,
              model,
              status: response.status,
              error: `HTTP ${response.status}`,
            });
            throw new GeminiError(
              `Gemini request failed with HTTP ${response.status}`,
              'http',
              response.status,
            );
          }
          const delay =
            Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt) *
            (0.5 + config.random() * 0.5);
          log({
            level: 'warn',
            event: 'gemini.retry',
            attempt,
            model,
            status: response.status,
            retryInMs: delay,
          });
          await config.sleep(delay, signal);
          continue;
        }
        try {
          return JSON.parse(raw);
        } catch (cause) {
          throw new GeminiError(
            'Gemini returned an invalid response envelope',
            'invalid_response',
            undefined,
            { cause },
          );
        }
      } catch (cause) {
        if (cause instanceof GeminiError) throw cause;
        if (timeout.timedOut())
          throw new GeminiError(
            'Gemini request timed out',
            'timeout',
            undefined,
            { cause },
          );
        if (signal?.aborted) throw cause;
        if (attempt >= config.maxRetries)
          throw new GeminiError(
            'Gemini network request failed',
            'network',
            undefined,
            { cause },
          );
        const delay =
          Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt) *
          (0.5 + config.random() * 0.5);
        log({
          level: 'warn',
          event: 'gemini.retry',
          attempt,
          model,
          retryInMs: delay,
          error: 'network error',
        });
        await config.sleep(delay, signal);
      } finally {
        timeout.clear();
      }
    }
  }

  return {
    async generateStructured<T>(input: StructuredOutputRequest<T>): Promise<T> {
      const payload = await request(
        input.model ?? textModel,
        {
          contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
          ...(input.systemInstruction
            ? {
                systemInstruction: {
                  parts: [{ text: input.systemInstruction }],
                },
              }
            : {}),
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: input.schema,
          },
        },
        input.signal,
      );
      const value = extractJson(responseText(payload));
      if (!input.validate(value))
        throw new GeminiError(
          'Gemini output failed schema validation',
          'schema_validation',
        );
      return value;
    },
    async generateSpeech(input: SpeechRequest): Promise<SpeechOutput> {
      const payload = (await request(
        input.model ?? ttsModel,
        {
          contents: [{ role: 'user', parts: [{ text: input.text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            ...(input.voice
              ? {
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: input.voice },
                    },
                  },
                }
              : {}),
          },
        },
        input.signal,
      )) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { data?: string; mimeType?: string };
            }>;
          };
        }>;
      };
      const audio = payload.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData,
      )?.inlineData;
      if (!audio?.data || !audio.mimeType)
        throw new GeminiError(
          'Gemini response did not contain audio',
          'invalid_response',
        );
      return {
        data: Uint8Array.from(atob(audio.data), (character) =>
          character.charCodeAt(0),
        ),
        mimeType: audio.mimeType,
      };
    },
  };
}

export type GeminiClient = ReturnType<typeof createGeminiClient>;
