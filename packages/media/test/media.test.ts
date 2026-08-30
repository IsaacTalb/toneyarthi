import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  audioKey,
  imageKey,
  normalizeMediaKey,
  publicMediaUrl,
  thumbnailKey,
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
