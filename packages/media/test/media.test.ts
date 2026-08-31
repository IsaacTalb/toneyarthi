import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  articleImageKeys,
  audioKey,
  categoryFallbackArtwork,
  fetchApprovedImage,
  imageKey,
  normalizeMediaKey,
  publicMediaUrl,
  thumbnailKey,
  withCategoryFallback,
} from '../src/index.ts';

describe('media keys', () => {
  it('creates keys under normalized prefixes', () => {
    assert.equal(audioKey('story-42.mp3'), 'audio/story-42.mp3');
    assert.equal(imageKey('story_42.webp'), 'images/story_42.webp');
    assert.equal(thumbnailKey('42.jpg'), 'thumbnails/42.jpg');
    assert.equal(normalizeMediaKey('images/hero.png'), 'images/hero.png');
  });

  for (const identifier of [
    '../secret',
    'folder/file.jpg',
    'folder\\file.jpg',
    '..',
    'image..jpg',
    '%2e%2e%2fsecret',
    ' leading.jpg',
    '',
  ]) {
    it(`rejects unsafe identifier ${JSON.stringify(identifier)}`, () => {
      assert.throws(() => imageKey(identifier), TypeError);
    });
  }

  for (const key of ['other/file.jpg', '/images/file.jpg', 'images/a/b.jpg']) {
    it(`rejects non-normalized key ${JSON.stringify(key)}`, () => {
      assert.throws(() => normalizeMediaKey(key), TypeError);
    });
  }
});

describe('approved image fetching', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2]);

  it('accepts an allowlisted HTTPS image with matching MIME and magic bytes', async () => {
    const result = await fetchApprovedImage(
      'https://media.example/image',
      { allowedHosts: ['media.example'] },
      async () =>
        new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }),
    );
    assert.equal(result.mimeType, 'image/jpeg');
    assert.deepEqual(result.bytes, jpeg);
  });

  it('validates the host again across redirects', async () => {
    await assert.rejects(
      fetchApprovedImage(
        'https://media.example/image',
        { allowedHosts: ['media.example'] },
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://untrusted.example/image' },
          }),
      ),
      /not approved/,
    );
  });

  it('rejects insecure URLs, oversized bodies, and MIME spoofing', async () => {
    await assert.rejects(
      fetchApprovedImage('http://media.example/image', {
        allowedHosts: ['media.example'],
      }),
      /HTTPS/,
    );
    await assert.rejects(
      fetchApprovedImage(
        'https://media.example/image',
        { allowedHosts: ['media.example'], maxBytes: 3 },
        async () =>
          new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }),
      ),
      /response-size limit/,
    );
    await assert.rejects(
      fetchApprovedImage(
        'https://media.example/image',
        { allowedHosts: ['media.example'] },
        async () =>
          new Response(jpeg, { headers: { 'content-type': 'image/png' } }),
      ),
      /magic bytes/,
    );
  });
});

describe('article image variants and fallback art', () => {
  it('uses normalized article and thumbnail keys', () => {
    assert.deepEqual(articleImageKeys('article-42'), {
      article: 'images/article-42.webp',
      thumbnail: 'thumbnails/article-42.webp',
    });
  });

  it('creates compact category-specific SVG artwork', () => {
    const article = new TextDecoder().decode(
      categoryFallbackArtwork('science', 'article'),
    );
    const thumbnail = new TextDecoder().decode(
      categoryFallbackArtwork('science', 'thumbnail'),
    );
    assert.match(article, /width="1200"/);
    assert.match(thumbnail, /width="480"/);
    assert.match(article, /SCIENCE/);
    assert.ok(article.length < 1_000);
  });

  it('never lets primary or fallback image failure block publication', async () => {
    const errors: unknown[] = [];
    const result = await withCategoryFallback(
      async () => {
        throw new Error('remote image failed');
      },
      async () => {
        throw new Error('R2 failed');
      },
      (error) => errors.push(error),
    );
    assert.equal(result, undefined);
    assert.equal(errors.length, 2);
  });
});

describe('publicMediaUrl', () => {
  it('joins a normalized key to a base URL', () => {
    assert.equal(
      publicMediaUrl('https://media.example.com/', audioKey('story-42.mp3')),
      'https://media.example.com/audio/story-42.mp3',
    );
  });

  it('preserves a base path without introducing duplicate slashes', () => {
    assert.equal(
      publicMediaUrl(
        'https://example.com/public/media///',
        thumbnailKey('story.jpg'),
      ),
      'https://example.com/public/media/thumbnails/story.jpg',
    );
  });

  for (const baseUrl of [
    'ftp://example.com',
    'https://example.com?version=1',
  ]) {
    it(`rejects unsuitable base URL ${JSON.stringify(baseUrl)}`, () => {
      assert.throws(
        () => publicMediaUrl(baseUrl, imageKey('hero.jpg')),
        TypeError,
      );
    });
  }
});
