import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AdminError, handleAdminSources, transitionFor } from '../src/admin.ts';

describe('editorial state transitions', () => {
  it('only permits explicit publication from READY', () => {
    assert.equal(transitionFor('publish', 'READY'), 'PUBLISHED');
    for (const state of [
      'EXTRACTING',
      'READY_FOR_REVIEW',
      'NEEDS_REVIEW',
      'PUBLISHED',
    ])
      assert.equal(transitionFor('publish', state), undefined);
  });

  it('supports reversible unpublish and bounded regeneration', () => {
    assert.equal(transitionFor('unpublish', 'PUBLISHED'), 'READY');
    assert.equal(transitionFor('regenerate_article', 'READY'), 'EXTRACTING');
    assert.equal(
      transitionFor('regenerate_audio', 'FAILED_TTS'),
      'TTS_PENDING',
    );
    assert.equal(transitionFor('regenerate_audio', 'PUBLISHED'), undefined);
    assert.equal(transitionFor('rehumanize', 'READY'), 'WRITING');
    assert.equal(transitionFor('rehumanize', 'PUBLISHED'), undefined);
  });
});

describe('source administration boundaries', () => {
  const env = { ADMIN_API_TOKEN: 'secret', DB: {} as D1Database };
  const patch = (slug: string, body: unknown) =>
    handleAdminSources(
      new Request(`https://example.test/v1/admin/sources/${slug}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret',
          'x-admin-actor': 'editor@example.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      env,
      new URL(`https://example.test/v1/admin/sources/${slug}`),
    );

  it('rejects slugs outside the compile-time registry', async () => {
    await assert.rejects(
      patch('custom-parser', { isActive: true }),
      (error) => error instanceof AdminError && error.code === 'UNKNOWN_SOURCE',
    );
  });

  it('rejects arbitrary parser code and unregistered feed URLs', async () => {
    await assert.rejects(
      patch('bbc-world', { parserCode: 'eval(input)' }),
      (error) => error instanceof AdminError && error.code === 'INVALID_SOURCE',
    );
    await assert.rejects(
      patch('bbc-world', { feedUrl: 'https://attacker.test/feed' }),
      (error) => error instanceof AdminError && error.code === 'INVALID_FEED',
    );
    await assert.rejects(
      patch('bbc-world', { adapterType: 'script' }),
      (error) =>
        error instanceof AdminError && error.code === 'INVALID_ADAPTER',
    );
  });
});
