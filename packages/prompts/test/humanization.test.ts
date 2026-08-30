import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBurmeseHumanizationPrompt,
  BURMESE_HUMANIZATION_PROMPT_VERSION,
  isBurmeseHumanizationOutput,
} from '../src/index.ts';

const draft = {
  title_mm: 'မိုးသတင်း',
  summary_mm: 'ယနေ့ မိုးရွာသည်။',
  content_mm: 'တာဝန်ရှိသူက မိုးရွာနိုင်သည်ဟု ပြောသည်။',
};
const immutable = {
  facts: ['မိုးရွာသည်'],
  names: ['မိုးလေဝသဌာန'],
  dates: ['2026-08-30'],
  numbers: ['50%'],
  quotations: ['“မိုးရွာနိုင်သည်”'],
  attributions: ['မိုးလေဝသဌာနက ပြောသည်'],
  uncertaintyMarkers: ['နိုင်သည်'],
};

describe('Burmese humanization contract', () => {
  it('is versioned, receives both draft and immutable ledger, and forbids drift', () => {
    const prompt = buildBurmeseHumanizationPrompt('cluster-1', {
      draft,
      immutable,
    });
    assert.match(
      prompt,
      new RegExp(
        `burmese-humanization@${BURMESE_HUMANIZATION_PROMPT_VERSION.replaceAll('.', '\\.')}`,
      ),
    );
    assert.match(prompt, /PRE_HUMANIZED_DRAFT/);
    assert.match(prompt, /IMMUTABLE/);
    assert.match(prompt, /Do not add or infer a fact/);
    assert.match(prompt, /Do not omit a fact/);
    assert.match(prompt, /Do not strengthen or weaken certainty/);
    assert.match(prompt, /politically reframe/);
    assert.match(prompt, /sensational/);
    assert.match(prompt, /robotic word-for-word translation/);
    assert.match(prompt, /50%/);
  });

  it('accepts only the three non-empty Burmese fields', () => {
    assert.equal(isBurmeseHumanizationOutput(draft), true);
    assert.equal(isBurmeseHumanizationOutput({ ...draft, notes: 'x' }), false);
    assert.equal(
      isBurmeseHumanizationOutput({ ...draft, title_mm: 'English' }),
      false,
    );
  });
});
