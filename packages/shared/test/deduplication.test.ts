import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEDUPLICATION_THRESHOLDS,
  persistClusterRecommendation,
  recommendCluster,
  scoreDuplicate,
  type DeduplicationArticle,
} from '../src/index.ts';

const article = (
  patch: Partial<DeduplicationArticle> = {},
): DeduplicationArticle => ({
  id: 'one',
  canonicalUrl: 'https://news.example/world/story',
  title: 'NASA Artemis Mission Launches From Florida Today',
  contentHash: 'abc123',
  publishedAt: '2026-08-30T10:00:00Z',
  ...patch,
});

describe('explainable deduplication scoring', () => {
  it('classifies exact duplicates using canonical URL and content hash', () => {
    const result = scoreDuplicate(article(), article({ id: 'two' }));
    assert.equal(result.decision, 'high-confidence');
    assert.equal(result.score, 1);
    assert.equal(result.signals.canonicalUrl.value, 1);
    assert.equal(result.signals.contentHash.value, 1);
    assert.match(result.signals.canonicalUrl.explanation, /equal/);
  });

  it('treats punctuation and capitalization title variants as equal', () => {
    const result = scoreDuplicate(
      article(),
      article({
        id: 'two',
        canonicalUrl: 'https://wire.example/a',
        contentHash: 'different',
        title: 'nasa artemis mission launches from florida today!!!',
      }),
    );
    assert.equal(result.decision, 'high-confidence');
    assert.equal(result.signals.headlineTokenSimilarity.value, 1);
  });

  it('clusters multi-source reporting of one event from headline evidence', () => {
    const result = scoreDuplicate(
      article(),
      article({
        id: 'two',
        canonicalUrl: 'https://wire.example/b',
        contentHash: 'different',
        title: 'NASA Artemis Mission Launches From Florida',
        publishedAt: '2026-08-30T12:00:00Z',
      }),
    );
    assert.equal(result.decision, 'high-confidence');
    assert.ok(result.signals.namedTokenOverlap.value > 0.8);
  });

  it('preserves ambiguous candidates without automatic membership', () => {
    const incoming = article({ title: 'NASA Artemis Mission Florida Launch' });
    const candidate = article({
      id: 'two',
      canonicalUrl: 'https://wire.example/c',
      contentHash: 'different',
      title: 'NASA Artemis Mission Launches From Florida Today',
    });
    const recommendation = recommendCluster(incoming, [
      { clusterId: 'cluster-1', article: candidate },
    ]);
    assert.equal(recommendation.automatic, undefined);
    assert.equal(recommendation.review.length, 1);
    assert.equal(recommendation.review[0]?.score.decision, 'ambiguous');
    assert.ok(
      recommendation.review[0]!.score.score >=
        DEDUPLICATION_THRESHOLDS.ambiguous,
    );
  });

  it('persists confident membership and ambiguous review separately', async () => {
    const members: unknown[] = [];
    const reviews: unknown[] = [];
    const store = {
      async addStoryClusterArticle(input: unknown) {
        members.push(input);
      },
      async addStoryClusterCandidate(input: unknown) {
        reviews.push(input);
      },
    };
    const confident = recommendCluster(article(), [
      { clusterId: 'exact', article: article({ id: 'two' }) },
      {
        clusterId: 'review',
        article: article({
          id: 'three',
          canonicalUrl: 'https://wire.example/c',
          contentHash: 'different',
          title: 'NASA Artemis Mission Florida Launch',
        }),
      },
    ]);
    await persistClusterRecommendation(store, 'one', confident);
    assert.equal(members.length, 1);
    assert.equal(reviews.length, 1);
    assert.match(JSON.stringify(members[0]), /signals/);
  });

  it('keeps unrelated stories separate', () => {
    const result = scoreDuplicate(
      article(),
      article({
        id: 'two',
        canonicalUrl: 'https://sports.example/final',
        contentHash: 'different',
        title: 'United Win League Final Against City',
        publishedAt: '2026-08-20T12:00:00Z',
      }),
    );
    assert.equal(result.decision, 'separate-story');
    assert.equal(result.score, 0);
  });
});
