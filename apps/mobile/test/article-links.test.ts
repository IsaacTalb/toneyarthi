import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { articlePublicUrl, validatedHttpsUrl } from '../src/articleLinks.ts';

describe('article links', () => {
  it('accepts only credential-free HTTPS source links', () => {
    assert.equal(
      validatedHttpsUrl('https://example.com/story'),
      'https://example.com/story',
    );
    assert.equal(validatedHttpsUrl('http://example.com/story'), undefined);
    assert.equal(validatedHttpsUrl('https://user:pass@example.com'), undefined);
    assert.equal(validatedHttpsUrl('not a url'), undefined);
  });

  it('builds an encoded, safe public article URL', () => {
    assert.equal(
      articlePublicUrl('မြန်မာ သတင်း'),
      `https://toneyarthi.com/article/${encodeURIComponent('မြန်မာ သတင်း')}`,
    );
  });
});
