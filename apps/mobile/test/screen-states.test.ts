import assert from 'node:assert/strict';
import { it } from 'node:test';
import { screenStateContent } from '../src/components/screenStateContent.ts';

it('provides stable, distinct copy for key remote screen states', () => {
  assert.match(screenStateContent('offline').title, /အင်တာနက်/);
  assert.ok(screenStateContent('offline').message.length > 0);
  assert.ok(screenStateContent('error').title.length > 0);
  assert.ok(screenStateContent('empty').title.length > 0);
  assert.match(screenStateContent('loading').message, /…$/);
  assert.notEqual(
    screenStateContent('error').title,
    screenStateContent('empty').title,
  );
});
