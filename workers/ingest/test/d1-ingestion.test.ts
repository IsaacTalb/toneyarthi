import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import type { RawNewsArticle } from '@toneyarthi/types';
import { insertCandidate, type Env, type SourceRow } from '../src/index.ts';

let runtime: Miniflare;
let db: D1Database;
const sent: unknown[] = [];
const source: SourceRow = { id: 'source', slug: 'fixture', priority: 7 };
const record: RawNewsArticle = {
  sourceId: 'source',
  sourceName: 'Fixture',
  sourceUrl: 'https://fixture.test',
  canonicalUrl: 'https://fixture.test/story',
  title: 'Deterministic story',
  summary: 'A complete fixture summary.',
  language: 'en',
  fetchedAt: '2026-09-01T00:00:00.000Z',
  publishedAt: '2026-08-31T00:00:00.000Z',
};

before(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'ingest-integration',
          modules: true,
          script: 'export default {}',
          d1Databases: { DB: 'ingest-test' },
        },
      ],
    }),
  );
  db = await runtime.getD1Database('DB');
  await db.exec(`
    CREATE TABLE articles (id TEXT PRIMARY KEY, canonical_url TEXT UNIQUE, title TEXT, summary TEXT, body TEXT, author TEXT, image_url TEXT, language TEXT, status TEXT, content_hash TEXT UNIQUE, published_at TEXT);
    CREATE TABLE article_sources (article_id TEXT, source_id TEXT, source_url TEXT, source_article_id TEXT, fetched_at TEXT, original_title TEXT, original_published_at TEXT, UNIQUE(article_id, source_id, source_url));
    CREATE TABLE processing_jobs (id TEXT PRIMARY KEY, article_id TEXT, job_type TEXT, payload TEXT, deduplication_key TEXT UNIQUE, priority INTEGER, status TEXT DEFAULT 'pending');
  `);
});
after(async () => runtime.dispose());

const env = () =>
  ({
    DB: db,
    NEWS_QUEUE: {
      send: async (value: unknown) => {
        sent.push(value);
      },
    },
  }) as Env;

describe('D1-backed ingestion boundary', () => {
  it('atomically persists an article, provenance and one queue job', async () => {
    assert.equal(
      await insertCandidate(env(), source, record, 'hash-one', new Set()),
      'inserted',
    );
    assert.equal(
      (await db
        .prepare('SELECT count(*) count FROM articles')
        .first<{ count: number }>())!.count,
      1,
    );
    assert.equal(
      (await db
        .prepare('SELECT count(*) count FROM article_sources')
        .first<{ count: number }>())!.count,
      1,
    );
    const job = await db
      .prepare('SELECT status, priority FROM processing_jobs')
      .first<{ status: string; priority: number }>();
    assert.deepEqual(job, { status: 'pending', priority: 7 });
    assert.equal(sent.length, 1);
  });

  it('is idempotent across redelivery and does not enqueue duplicates', async () => {
    assert.equal(
      await insertCandidate(env(), source, record, 'hash-one', new Set()),
      'duplicate',
    );
    assert.equal(sent.length, 1);
    assert.equal(
      (await db
        .prepare('SELECT count(*) count FROM articles')
        .first<{ count: number }>())!.count,
      1,
    );
  });

  it('links syndicated URLs to existing content without a second job', async () => {
    const syndicated = {
      ...record,
      canonicalUrl: 'https://another.test/story',
    };
    assert.equal(
      await insertCandidate(env(), source, syndicated, 'hash-one', new Set()),
      'duplicate',
    );
    assert.equal(
      (await db
        .prepare('SELECT count(*) count FROM article_sources')
        .first<{ count: number }>())!.count,
      2,
    );
    assert.equal(sent.length, 1);
  });
});
