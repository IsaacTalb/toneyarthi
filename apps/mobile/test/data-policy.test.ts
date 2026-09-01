import assert from 'node:assert/strict';
import test from 'node:test';
import { DATA_POLICIES, imageUrlForPolicy } from '../src/dataPolicy/policy.ts';

test('data saver centralizes reduced network behavior', () => {
  const policy = DATA_POLICIES['data-saver'];
  assert.equal(policy.prefetch.images, false);
  assert.equal(policy.prefetch.queries, false);
  assert.equal(policy.downloads.automaticAudio, false);
  assert.equal(policy.queries.refetchOnReconnect, false);
  assert.equal(policy.queries.staleTimeMultiplier, 4);
});

test('data saver requests a smaller image without dropping query parameters', () => {
  const result = new URL(
    imageUrlForPolicy(
      'https://images.test/story.jpg?token=one',
      DATA_POLICIES['data-saver'],
    ),
  );
  assert.equal(result.searchParams.get('token'), 'one');
  assert.equal(result.searchParams.get('width'), '640');
  assert.equal(result.searchParams.get('quality'), '65');
  assert.equal(
    imageUrlForPolicy('https://images.test/story.jpg', DATA_POLICIES.standard),
    'https://images.test/story.jpg',
  );
});
