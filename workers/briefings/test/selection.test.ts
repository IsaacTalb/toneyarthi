import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_CONFIG,
  parseConfig,
  selectStories,
} from '../src/selection.ts';

const now = new Date('2026-09-01T12:00:00.000Z');

describe('briefing selection', () => {
  it('selects at most eight unique clusters and records scoring reasons', () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      articleId: `article-${index}`,
      clusterId: index === 9 ? 'cluster-0' : `cluster-${index}`,
      categoryId: `category-${index % 3}`,
      publishedAt: new Date(now.getTime() - index * 60_000).toISOString(),
      importance: 0.5,
    }));
    const selected = selectStories(candidates, DEFAULT_CONFIG, now);
    assert.equal(selected.length, 8);
    assert.equal(new Set(selected.map((story) => story.clusterId)).size, 8);
    assert.ok(selected.every((story) => story.reason.total === story.score));
  });

  it('uses diversity as an explicit greedy tie breaker', () => {
    const candidates = ['a', 'b', 'c'].map((id, index) => ({
      articleId: id,
      clusterId: id,
      categoryId: index === 1 ? 'one' : index === 2 ? 'two' : 'one',
      publishedAt: now.toISOString(),
      importance: index === 0 ? 1 : 0.5,
    }));
    const selected = selectStories(
      candidates,
      { ...DEFAULT_CONFIG, maxStories: 3 },
      now,
    );
    assert.deepEqual(
      selected.map((story) => story.articleId),
      ['a', 'c', 'b'],
    );
  });

  it('rejects playlist sizes outside five through eight', () => {
    assert.throws(() => parseConfig('{"minStories":4}'), /Invalid/);
    assert.throws(() => parseConfig('{"maxStories":9}'), /Invalid/);
  });
});
