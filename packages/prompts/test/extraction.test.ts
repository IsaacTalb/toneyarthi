import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  assessEditorialRisk,
  buildExtractionPrompt,
  isExtractionOutput,
} from '../src/index.ts';

const empty = {
  people: [],
  organizations: [],
  countries: [],
  locations: [],
  dates: [],
  numbers: [],
  confirmedFacts: [],
  attributedClaims: [],
  allegations: [],
  predictions: [],
  opinions: [],
  uncertainFacts: [],
  sourceDisagreements: [],
  riskTopics: [],
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
  assert.match(prompt, /story-extraction@2\.0\.0/);
  assert.match(prompt, /article-1/);
});

it('elevates sensitive topics and disagreement to mandatory review', () => {
  const war = assessEditorialRisk({ ...empty, riskTopics: ['war'] });
  assert.deepEqual([war.level, war.requiresHumanReview], ['high', true]);
  const conflict = assessEditorialRisk({
    ...empty,
    sourceDisagreements: [
      {
        topic: 'death toll',
        positions: [
          { statement: '10', evidence: [{ articleId: 'a', excerpt: '10' }] },
          { statement: '20', evidence: [{ articleId: 'b', excerpt: '20' }] },
        ],
      },
    ],
  });
  assert.equal(conflict.requiresHumanReview, true);
  assert.equal(conflict.confidence, 'low');
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
