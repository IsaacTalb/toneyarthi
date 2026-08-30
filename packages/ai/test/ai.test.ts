import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGeminiClient, extractJson, GeminiError } from '../src/index.ts';

const env = {
  GEMINI_API_KEY: 'top-secret-key',
  GEMINI_TEXT_MODEL: 'text-model',
  GEMINI_TTS_MODEL: 'tts-model',
};
const schema = { type: 'object', properties: { title: { type: 'string' } } };
const valid = (value: unknown): value is { title: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { title?: unknown }).title === 'string';
const envelope = (text: string) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] } }] });

describe('JSON output', () => {
  it('extracts plain, fenced, and surrounded JSON', () => {
    assert.deepEqual(extractJson('{"ok":true}'), { ok: true });
    assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
    assert.deepEqual(extractJson('Result: {"ok":true}\nDone'), { ok: true });
  });

  it('parses and validates a structured response', async () => {
    let requestedUrl = '';
    const client = createGeminiClient(env, {
      fetch: async (url) => {
        requestedUrl = String(url);
        return envelope('{"title":"Hello"}');
      },
    });
    assert.deepEqual(
      await client.generateStructured({
        prompt: 'Write',
        schema,
        validate: valid,
      }),
      { title: 'Hello' },
    );
    assert.match(requestedUrl, /text-model/);
    assert.match(requestedUrl, /top-secret-key/);
  });

  it('rejects invalid JSON and schema mismatches', async () => {
    const invalidJson = createGeminiClient(env, {
      fetch: async () => envelope('not JSON'),
    });
    await assert.rejects(
      invalidJson.generateStructured({ prompt: 'x', schema, validate: valid }),
      (error: unknown) =>
        error instanceof GeminiError && error.code === 'invalid_json',
    );
    const invalidShape = createGeminiClient(env, {
      fetch: async () => envelope('{"title":1}'),
    });
    await assert.rejects(
      invalidShape.generateStructured({ prompt: 'x', schema, validate: valid }),
      (error: unknown) =>
        error instanceof GeminiError && error.code === 'schema_validation',
    );
  });
});

describe('transport resilience', () => {
  it('aborts timed out requests', async () => {
    const client = createGeminiClient(env, {
      timeoutMs: 5,
      maxRetries: 0,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    });
    await assert.rejects(
      client.generateStructured({ prompt: 'x', schema, validate: valid }),
      (error: unknown) =>
        error instanceof GeminiError && error.code === 'timeout',
    );
  });

  it('retries rate limits and transient network failures', async () => {
    let calls = 0;
    const delays: number[] = [];
    const client = createGeminiClient(env, {
      random: () => 0,
      maxRetries: 3,
      sleep: async (delay) => {
        delays.push(delay);
      },
      fetch: async () => {
        calls++;
        if (calls === 1) return new Response('busy', { status: 429 });
        if (calls === 2) throw new TypeError('connection reset');
        return envelope('{"title":"Recovered"}');
      },
    });
    assert.equal(
      (
        await client.generateStructured({
          prompt: 'x',
          schema,
          validate: valid,
        })
      ).title,
      'Recovered',
    );
    assert.equal(calls, 3);
    assert.deepEqual(delays, [125, 250]);
  });

  it('does not retry terminal HTTP errors', async () => {
    let calls = 0;
    const client = createGeminiClient(env, {
      fetch: async () => {
        calls++;
        return new Response('bad request', { status: 400 });
      },
    });
    await assert.rejects(
      client.generateStructured({ prompt: 'x', schema, validate: valid }),
      (error: unknown) => error instanceof GeminiError && error.status === 400,
    );
    assert.equal(calls, 1);
  });

  it('rejects oversized responses', async () => {
    const client = createGeminiClient(env, {
      maxResponseBytes: 4,
      fetch: async () => new Response('12345'),
    });
    await assert.rejects(
      client.generateStructured({ prompt: 'x', schema, validate: valid }),
      (error: unknown) =>
        error instanceof GeminiError && error.code === 'response_too_large',
    );
  });

  it('never includes secrets or response bodies in structured logs', async () => {
    const logs: unknown[] = [];
    const client = createGeminiClient(env, {
      logger: (entry) => logs.push(entry),
      fetch: async () =>
        new Response('contains top-secret-key', { status: 400 }),
    });
    await assert.rejects(
      client.generateStructured({
        prompt: 'private prompt',
        schema,
        validate: valid,
      }),
    );
    const serialized = JSON.stringify(logs);
    assert.doesNotMatch(serialized, /top-secret-key|private prompt|contains/);
    assert.match(serialized, /HTTP 400/);
  });
});
