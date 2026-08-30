import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBurmeseWritingPrompt,
  BURMESE_WRITING_SCHEMA,
  isBurmeseWritingOutput,
  type ExtractionOutput,
} from '../src/index.ts';

const extraction: ExtractionOutput = {
  people: [],
  organizations: [],
  countries: [],
  locations: [],
  dates: [],
  numbers: [],
  confirmedFacts: [
    {
      statement: 'မိုးရွာသည်',
      evidence: [{ articleId: 'a1', excerpt: 'rain' }],
    },
  ],
  attributedClaims: [],
  uncertainFacts: [],
  sourceDisagreements: [],
};

describe('Burmese writing contract', () => {
  it('uses a versioned prompt and extraction as the sole source of truth', () => {
    const prompt = buildBurmeseWritingPrompt('cluster-1', extraction);
    assert.match(prompt, /burmese-story-writing@1\.0\.0/);
    assert.match(prompt, /sole source of truth/);
    assert.match(prompt, /neutral, natural Burmese/);
    assert.match(prompt, /မိုးရွာသည်/);
  });

  it('publishes a strict three-field JSON schema', () => {
    assert.equal(BURMESE_WRITING_SCHEMA.additionalProperties, false);
    const valid = {
      title_mm: 'ခေါင်းစဉ်',
      summary_mm: 'အကျဉ်း',
      content_mm: 'အကြောင်းအရာ',
    };
    assert.equal(isBurmeseWritingOutput(valid), true);
    assert.equal(isBurmeseWritingOutput({ ...valid, sources: [] }), false);
    assert.equal(isBurmeseWritingOutput({ ...valid, summary_mm: '  ' }), false);
    assert.equal(
      isBurmeseWritingOutput({ title_mm: 'ခေါင်းစဉ်', summary_mm: 'အကျဉ်း' }),
      false,
    );
  });
});
