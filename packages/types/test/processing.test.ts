import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  canAutomaticallyPublish,
  nextAutomaticStoryState,
} from '../src/processing.ts';

it('moves extraction through WRITING and stops before publication', () => {
  assert.equal(nextAutomaticStoryState('EXTRACTING', 'extract'), 'WRITING');
  assert.equal(nextAutomaticStoryState('WRITING', 'write'), 'READY_FOR_REVIEW');
  assert.equal(nextAutomaticStoryState('READY_FOR_REVIEW', 'write'), null);
  assert.notEqual(nextAutomaticStoryState('WRITING', 'write'), 'PUBLISHED');
});

it('automatic publication is forbidden at every risk level', () => {
  assert.equal(canAutomaticallyPublish('standard'), false);
  assert.equal(canAutomaticallyPublish('high'), false);
});
