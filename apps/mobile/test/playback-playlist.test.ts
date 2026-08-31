import assert from 'node:assert/strict';
import test from 'node:test';
import type { ArticleSummary, ApiClient } from '../src/api/client.ts';
import { resolvePlayableArticles } from '../src/playback/playlist.ts';

const summary = (id: string, audioUrl?: string): ArticleSummary => ({
  id,
  title: id,
  summary: '',
  publishedAt: '2026-01-01T00:00:00Z',
  audioUrl,
  sources: [],
});

test('resolves ID-only entries in order without merging or duplicates', async () => {
  const article = (async (id: string) =>
    summary(id, `https://audio.test/${id}.mp3`)) as ApiClient['article'];
  const items = await resolvePlayableArticles(
    [summary('one'), summary('two'), summary('one')],
    article,
  );
  assert.deepEqual(
    items.map(({ id }) => id),
    ['one', 'two'],
  );
  assert.deepEqual(
    items.map(({ uri }) => uri),
    ['https://audio.test/one.mp3', 'https://audio.test/two.mp3'],
  );
});

test('skips failed and audio-less article resolution safely', async () => {
  const article = (async (id: string) => {
    if (id === 'failed') throw new Error('unavailable');
    return summary(id);
  }) as ApiClient['article'];
  assert.deepEqual(
    await resolvePlayableArticles(
      [summary('failed'), summary('silent')],
      article,
    ),
    [],
  );
});
