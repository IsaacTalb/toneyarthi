import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVerificationCorrectionPrompt,
  isVerificationResult,
  routeVerification,
} from '../src/index.ts';

test('verification result is strict and pass agrees with errors', () => {
  assert.equal(isVerificationResult({ passed: true, errors: [] }), true);
  assert.equal(
    isVerificationResult({
      passed: true,
      errors: [
        {
          type: 'MISTRANSLATION',
          severity: 'minor',
          description: 'wrong word',
        },
      ],
    }),
    false,
  );
  assert.equal(
    isVerificationResult({
      passed: false,
      errors: [
        {
          type: 'MISTRANSLATION',
          severity: 'minor',
          description: 'wrong word',
          extra: true,
        },
      ],
    }),
    false,
  );
});

test('only unresolved all-minor results receive one correction', () => {
  const minor = {
    passed: false,
    errors: [
      {
        type: 'INCORRECT_NAME' as const,
        severity: 'minor' as const,
        description: 'spelling',
      },
    ],
  };
  assert.equal(
    routeVerification({ passed: true, errors: [] }, false),
    'TTS_PENDING',
  );
  assert.equal(routeVerification(minor, false), 'CORRECT_ONCE');
  assert.equal(routeVerification(minor, true), 'NEEDS_REVIEW');
  assert.equal(
    routeVerification(
      {
        passed: false,
        errors: [
          {
            type: 'EXAGGERATION',
            severity: 'serious',
            description: 'material',
          },
        ],
      },
      false,
    ),
    'NEEDS_REVIEW',
  );
});

test('high-risk and conflicting stories cannot advance automatically', () => {
  assert.equal(
    routeVerification({ passed: true, errors: [] }, false, {
      level: 'high',
      confidence: 'low',
      topics: ['election'],
      reasons: ['sensitive_topic:election'],
      requiresHumanReview: true,
    }),
    'NEEDS_REVIEW',
  );
});

test('correction is limited to minor errors and explicitly requires re-verification', () => {
  const content = {
    title_mm: 'သတင်း',
    summary_mm: 'အကျဉ်း',
    content_mm: 'အကြောင်းအရာ',
  };
  const prompt = buildVerificationCorrectionPrompt('cluster-1', content, [
    {
      type: 'INCORRECT_NAME',
      severity: 'minor',
      description: 'Fix one transliteration',
    },
  ]);
  assert.match(prompt, /only once/);
  assert.match(prompt, /re-verified/);
  assert.throws(() =>
    buildVerificationCorrectionPrompt('cluster-1', content, [
      {
        type: 'UNSUPPORTED_CLAIM',
        severity: 'serious',
        description: 'New claim',
      },
    ]),
  );
});
