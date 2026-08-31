import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { transitionFor } from '../src/admin.ts';

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
