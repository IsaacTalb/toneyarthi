import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildExtractionPrompt, isExtractionOutput } from '../src/index.ts';

const empty = {
  people: [],
  organizations: [],
  countries: [],
  locations: [],
  dates: [],
  numbers: [],
  confirmedFacts: [],
  attributedClaims: [],
  uncertainFacts: [],
  sourceDisagreements: [],
};

it('builds a versioned prompt without losing source identity', () => {
  const prompt = buildExtractionPrompt('cluster-1', [
    {
      id: 'article-1',
      title: 'Title',
      body: 'Body',
      sourceName: 'Wire',
      canonicalUrl: 'https://example.com',
      publishedAt: null,
    },
  ]);
  assert.match(prompt, /story-extraction@1\.0\.0/);
  assert.match(prompt, /article-1/);
});

it('strictly validates output and cluster evidence', () => {
  assert.equal(isExtractionOutput(empty, new Set(['article-1'])), true);
  assert.equal(isExtractionOutput({ ...empty, extra: true }), false);
  assert.equal(
    isExtractionOutput(
      {
        ...empty,
        confirmedFacts: [
          {
            statement: 'Fact',
            evidence: [{ articleId: 'other', excerpt: 'words' }],
          },
        ],
      },
      new Set(['article-1']),
    ),
    false,
  );
});
