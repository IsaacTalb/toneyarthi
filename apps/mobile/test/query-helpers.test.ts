import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSearchEnabled,
  nextPageParam,
  normalizedSearchTerm,
} from '../src/api/queryHelpers.ts';

describe('mobile query helpers', () => {
  it('normalizes search keys and keeps category feeds distinct', () => {
    assert.equal(normalizedSearchTerm('  election  '), 'election');
    assert.equal(isSearchEnabled('x'), false);
    assert.equal(isSearchEnabled(' xy '), true);
    assert.equal(isSearchEnabled('x'.repeat(101)), false);
  });

  it('enables only valid searches and chooses cursor pagination first', () => {
    const next = nextPageParam({
      items: [],
      page: 1,
      limit: 12,
      hasMore: true,
      nextCursor: 'opaque',
    });
    assert.deepEqual(next, { cursor: 'opaque' });
    const ended = nextPageParam({
      items: [],
      page: 2,
      limit: 12,
      hasMore: false,
    });
    assert.equal(ended, undefined);
  });
});
