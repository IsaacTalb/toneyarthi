import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPronunciationDictionary,
  buildAudioScriptPrompt,
  isAudioScriptOutput,
  isAudioScriptVerificationOutput,
} from '../src/index.ts';

test('audio prompt is versioned, speech constrained, and editor extensible', () => {
  const prompt = buildAudioScriptPrompt(
    'cluster-1',
    { title_mm: 'သတင်း', summary_mm: 'အကျဉ်း', content_mm: 'UN သတင်း' },
    { UN: 'ကုလသမဂ္ဂ', ASEAN: 'အာဆီယံ', ICC: 'အိုင် စီ စီ' },
  );
  assert.match(prompt, /burmese-audio-script@1\.0\.0/);
  assert.match(prompt, /two to five minutes/);
  assert.match(prompt, /names, dates, quantities/);
  assert.match(prompt, /"ICC":"အိုင် စီ စီ"/);
});

test('pronunciations use deterministic whole Unicode-token boundaries', () => {
  const dictionary = { UN: 'ကုလ', UNICEF: 'ယူနီဆက်' };
  assert.equal(
    applyPronunciationDictionary('UN, UNICEF; TUN UN_1', dictionary),
    'ကုလ, ယူနီဆက်; TUN UN_1',
  );
});

test('audio output excludes markup and verification must pass every check', () => {
  assert.equal(isAudioScriptOutput({ audio_script_mm: 'မင်္ဂလာပါ။' }), true);
  assert.equal(isAudioScriptOutput({ audio_script_mm: '# မင်္ဂလာပါ' }), false);
  assert.equal(
    isAudioScriptOutput({ audio_script_mm: 'https://example.com သတင်း' }),
    false,
  );
  const checks = {
    names: true,
    dates: true,
    numbers: true,
    attribution: true,
    uncertainty: true,
  };
  assert.equal(
    isAudioScriptVerificationOutput({ passed: true, checks, errors: [] }),
    true,
  );
  assert.equal(
    isAudioScriptVerificationOutput({
      passed: true,
      checks: { ...checks, numbers: false },
      errors: [],
    }),
    false,
  );
});
