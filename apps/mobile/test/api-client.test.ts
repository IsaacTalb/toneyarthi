import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ApiClientError,
  buildApiUrl,
  createApiClient,
  normalizeBaseUrl,
  parseApiResponse,
  shouldRetry,
} from '../src/api/client.ts';

describe('API URL generation', () => {
  it('joins paths and encodes pagination and search parameters', () => {
    assert.equal(
      buildApiUrl('https://api.example.test/', '/v1/search', {
        q: 'မြန်မာ news',
        page: 2,
        limit: 10,
      }),
      'https://api.example.test/v1/search?q=%E1%80%99%E1%80%BC%E1%80%94%E1%80%BA%E1%80%99%E1%80%AC+news&page=2&limit=10',
    );
  });

  it('rejects missing, relative, credentialed, and non-http base URLs', () => {
    for (const value of [
      undefined,
      '',
      '/api',
      'ftp://example.test',
      'https://a:b@example.test',
    ]) {
      assert.throws(() => normalizeBaseUrl(value));
    }
  });
});

describe('API responses', () => {
  it('unwraps successful envelopes', async () => {
    const result = await parseApiResponse<{ value: number }>(
      Response.json({ success: true, data: { value: 7 } }),
    );
    assert.deepEqual(result, { value: 7 });
  });

  it('maps server and malformed responses to one error class', async () => {
    await assert.rejects(
      parseApiResponse(
        Response.json(
          { success: false, error: { code: 'NOPE', message: 'No' } },
          { status: 404 },
        ),
      ),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.code === 'NOPE' &&
        error.status === 404,
    );
    await assert.rejects(
      parseApiResponse(new Response('not json', { status: 502 })),
      (error: unknown) =>
        error instanceof ApiClientError && error.code === 'HTTP_502',
    );
  });
});

describe('pagination and cancellation', () => {
  it('passes page/cursor values and the AbortSignal to fetch', async () => {
    const controller = new AbortController();
    let requested: RequestInfo | URL | undefined;
    let receivedSignal: AbortSignal | null | undefined;
    const client = createApiClient(
      'https://api.example.test',
      async (input, init) => {
        requested = input;
        receivedSignal = init?.signal;
        return Response.json({
          success: true,
          data: {
            items: [],
            page: 3,
            limit: 5,
            hasMore: true,
            nextCursor: 'next',
          },
        });
      },
    );
    const page = await client.feed(
      { page: 3, limit: 5, cursor: 'current' },
      controller.signal,
    );
    assert.equal(
      String(requested),
      'https://api.example.test/v1/feed?page=3&limit=5&cursor=current',
    );
    assert.equal(receivedSignal, controller.signal);
    assert.equal(page.nextCursor, 'next');
  });
});

describe('retry classification', () => {
  it('retries transient errors only and remains bounded', () => {
    assert.equal(shouldRetry(0, new TypeError('offline')), true);
    assert.equal(
      shouldRetry(1, new ApiClientError('RATE_LIMIT', 'wait', 429)),
      true,
    );
    assert.equal(
      shouldRetry(0, new ApiClientError('SERVER', 'down', 503)),
      true,
    );
    assert.equal(
      shouldRetry(0, new ApiClientError('BAD', 'invalid', 400)),
      false,
    );
    assert.equal(shouldRetry(2, new TypeError('offline')), false);
  });
});
