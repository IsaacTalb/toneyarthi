import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalBookmarkRepository } from '../src/bookmarks/repository.ts';
import type { BookmarkSnapshot } from '../src/bookmarks/types.ts';

test('bookmark repository saves snapshots, checks membership, and removes', async () => {
  let records: BookmarkSnapshot[] = [];
  const repository = new LocalBookmarkRepository(
    {
      read: async () => records,
      write: async (value) => {
        records = structuredClone(value);
      },
    },
    () => new Date('2026-08-31T12:00:00.000Z'),
  );
  await repository.save({
    id: 'article-1',
    slug: 'breaking-news',
    title: 'Offline title',
    summary: 'Offline summary',
    category: 'News',
    publishedAt: '2026-08-30T00:00:00.000Z',
  });
  assert.equal(await repository.contains('article-1'), true);
  assert.deepEqual(await repository.list(), [
    {
      id: 'article-1',
      slug: 'breaking-news',
      title: 'Offline title',
      summary: 'Offline summary',
      category: 'News',
      publishedAt: '2026-08-30T00:00:00.000Z',
      savedAt: '2026-08-31T12:00:00.000Z',
      snapshotUpdatedAt: '2026-08-31T12:00:00.000Z',
    },
  ]);
  await repository.remove('article-1');
  assert.equal(await repository.contains('article-1'), false);
});

test('bookmark repository ignores corrupt and obsolete stored entries', async () => {
  const repository = new LocalBookmarkRepository({
    read: async () => [{ id: 'old-format' }, null, 'bad'],
    write: async () => undefined,
  });
  assert.deepEqual(await repository.list(), []);
});

test('serializes concurrent saves so neither persisted bookmark is lost', async () => {
  let records: BookmarkSnapshot[] = [];
  const repository = new LocalBookmarkRepository(
    {
      read: async () => {
        await Promise.resolve();
        return structuredClone(records);
      },
      write: async (value) => {
        await Promise.resolve();
        records = structuredClone(value);
      },
    },
    () => new Date('2026-09-01T00:00:00.000Z'),
  );
  await Promise.all([
    repository.save({ id: 'one', slug: 'one', title: 'One', category: 'News' }),
    repository.save({ id: 'two', slug: 'two', title: 'Two', category: 'News' }),
  ]);
  assert.deepEqual(
    (await repository.list()).map(({ id }) => id),
    ['two', 'one'],
  );
});
