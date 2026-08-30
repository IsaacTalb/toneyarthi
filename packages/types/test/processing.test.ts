import assert from 'node:assert/strict';
import { it } from 'node:test';
import { nextAutomaticStoryState } from '../src/processing.ts';

it('moves extraction through WRITING and stops before publication', () => {
  assert.equal(nextAutomaticStoryState('EXTRACTING', 'extract'), 'WRITING');
  assert.equal(nextAutomaticStoryState('WRITING', 'write'), 'READY_FOR_REVIEW');
  assert.equal(nextAutomaticStoryState('READY_FOR_REVIEW', 'write'), null);
  assert.notEqual(nextAutomaticStoryState('WRITING', 'write'), 'PUBLISHED');
});
