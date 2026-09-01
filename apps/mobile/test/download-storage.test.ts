import assert from 'node:assert/strict';
import test from 'node:test';
import { DownloadStorage } from '../src/downloads/storage.ts';
import type {
  DownloadFileSystem,
  DownloadRecord,
} from '../src/downloads/types.ts';

const setup = (initial: DownloadRecord[] = []) => {
  const present = new Set<string>();
  let records = initial;
  const files: DownloadFileSystem = {
    ensureDirectory: async () => {},
    download: async (_remote, temporary) => {
      present.add(temporary);
      return { status: 200, size: 12, expectedSize: 12 };
    },
    exists: async (uri) => present.has(uri),
    list: async () => [...present],
    move: async (from, to) => {
      present.delete(from);
      present.add(to);
    },
    remove: async (uri) => {
      present.delete(uri);
    },
    finalUri: (id) => `/downloads/${id}.audio`,
    temporaryUri: (id) => `/downloads/${id}.partial`,
  };
  return {
    storage: new DownloadStorage(files, {
      load: async () => records,
      save: async (next) => {
        records = next;
      },
    }),
    present,
    getRecords: () => records,
  };
};

test('downloads through a partial path then atomically promotes and persists', async () => {
  const { storage, present } = setup();
  await storage.initialize();
  const record = await storage.download({
    id: 'story',
    title: 'Story',
    remoteUri: 'https://audio.test/story',
  });
  assert.equal(record.localUri, '/downloads/story.audio');
  assert.equal(present.has('/downloads/story.partial'), false);
  assert.equal(await storage.verifiedUri('story'), '/downloads/story.audio');
});

test('startup removes partials and metadata whose file is missing', async () => {
  const stale = {
    id: 'gone',
    title: 'Gone',
    remoteUri: 'https://audio.test/gone',
    localUri: '/downloads/gone.audio',
    size: 1,
    downloadedAt: '',
  };
  const { storage, present, getRecords } = setup([stale]);
  present.add('/downloads/old.partial');
  assert.deepEqual(await storage.initialize(), []);
  assert.equal(present.size, 0);
  assert.deepEqual(getRecords(), []);
});

test('rejects a size mismatch and cleans the abandoned partial', async () => {
  const { storage, present } = setup();
  await storage.initialize();
  await assert.rejects(
    storage.download({
      id: 'bad',
      title: 'Bad',
      remoteUri: 'https://audio.test/bad',
      expectedSize: 13,
    }),
    /Expected 13/,
  );
  assert.equal(present.has('/downloads/bad.partial'), false);
});

test('does not expose uncommitted state when metadata persistence fails', async () => {
  const { storage, present } = setup();
  await storage.initialize();
  const failing = new DownloadStorage(
    {
      ensureDirectory: async () => {},
      list: async () => [],
      exists: async (uri) => present.has(uri),
      download: async (_remote, uri) => {
        present.add(uri);
        return { status: 200, size: 4 };
      },
      move: async (from, to) => {
        present.delete(from);
        present.add(to);
      },
      remove: async (uri) => {
        present.delete(uri);
      },
      finalUri: (id) => `/downloads/${id}.audio`,
      temporaryUri: (id) => `/downloads/${id}.partial`,
    },
    {
      load: async () => [],
      save: async () => {
        throw new Error('disk full');
      },
    },
  );
  await failing.initialize();
  await assert.rejects(
    failing.download({
      id: 'new',
      title: 'New',
      remoteUri: 'https://audio.test/new',
    }),
    /disk full/,
  );
  assert.deepEqual(failing.list(), []);
  assert.equal(present.has('/downloads/new.partial'), false);
});
