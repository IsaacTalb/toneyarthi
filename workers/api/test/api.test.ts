import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleRequest } from '../src/index.ts';

class Statement {
  values: unknown[] = [];
  readonly sql: string;
  readonly db: FakeDb;
  constructor(sql: string, db: FakeDb) {
    this.sql = sql;
    this.db = db;
  }
  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }
  async all() {
    if (this.sql.includes('FROM articles'))
      return { results: this.db.articleRows };
    if (this.sql.includes('FROM categories'))
      return { results: [{ slug: 'world', name: 'World', nameMy: 'ကမ္ဘာ' }] };
    return { results: [] };
  }
  async first() {
    if (this.sql.includes('SELECT 1')) return { healthy: 1 };
    if (this.sql.includes('FROM categories')) return { slug: 'world' };
    if (this.sql.includes('FROM articles'))
      return this.db.articleRows[0] ?? null;
    return null;
  }
}

class FakeDb {
  calls: { sql: string; values: unknown[] }[] = [];
  articleRows: Record<string, unknown>[] = [];
  prepare(sql: string) {
    return new Statement(sql, this);
  }
}

const env = (db: FakeDb, origins = 'https://app.example') => ({
  DB: db,
  ALLOWED_ORIGINS: origins,
});
const get = (path: string, init?: RequestInit) =>
  new Request(`https://api.example${path}`, init);

describe('public API boundary', () => {
  it('selects only explicitly published, non-future articles with bound input', async () => {
    const db = new FakeDb();
    const response = await handleRequest(
      get('/v1/search?q=budget%25&page=1&limit=5'),
      env(db) as never,
    );
    assert.equal(response.status, 200);
    const call = db.calls.find(({ sql }) => sql.includes('FROM articles'))!;
    assert.match(call.sql, /a\.status = 'published'/);
    assert.match(call.sql, /a\.published_at IS NOT NULL/);
    assert.match(call.sql, /a\.published_at <= datetime\('now'\)/);
    assert.doesNotMatch(call.sql, /budget/);
    assert.deepEqual(call.values.slice(-2), [5, 0]);
    assert.ok(
      call.values.slice(0, 4).every((value) => value === '%budget\\%%'),
    );
  });

  it('feed summaries never select or expose bodies or private pipeline material', async () => {
    const db = new FakeDb();
    db.articleRows = [
      {
        id: 'a1',
        title: 'Public',
        summary: 'Safe',
        sources: '[{"name":"Wire","url":"https://source.example/a"}]',
      },
    ];
    const response = await handleRequest(get('/v1/feed'), env(db) as never);
    const text = await response.text();
    const sql = db.calls.find(({ sql }) => sql.includes('FROM articles'))!.sql;
    assert.doesNotMatch(
      sql,
      /a\.body(?:\W|$)|prompt|raw_material|processing_jobs|error_message|secret/i,
    );
    for (const forbidden of [
      'prompt',
      'rawMaterial',
      'internalLog',
      'apiKey',
      'secret',
    ])
      assert.equal(text.includes(forbidden), false);
    assert.match(text, /source\.example/);
  });

  it('article detail exposes editorial bodies but cannot query private tables', async () => {
    const db = new FakeDb();
    db.articleRows = [
      { id: 'safe-id', title: 'Public', body: 'Edited copy', sources: '[]' },
    ];
    const response = await handleRequest(
      get('/v1/articles/safe-id'),
      env(db) as never,
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Edited copy/);
    assert.ok(
      db.calls.every(
        ({ sql }) =>
          !/prompts|raw_material|processing_jobs|logs|secrets/i.test(sql),
      ),
    );
  });

  it('rejects invalid inputs before SQL and bounds pagination', async () => {
    for (const path of [
      '/v1/feed?limit=51',
      '/v1/categories/..%2Fsecret/feed',
      '/v1/search?q=x',
    ]) {
      const db = new FakeDb();
      const response = await handleRequest(get(path), env(db) as never);
      assert.equal(response.status, 400);
      assert.equal(db.calls.length, 0);
    }
  });

  it('uses restrictive CORS, cache policy, and conditional ETags', async () => {
    const db = new FakeDb();
    const denied = await handleRequest(
      get('/v1/health', { headers: { origin: 'https://evil.example' } }),
      env(db) as never,
    );
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
    const allowed = await handleRequest(
      get('/v1/categories', { headers: { origin: 'https://app.example' } }),
      env(db) as never,
    );
    assert.equal(
      allowed.headers.get('access-control-allow-origin'),
      'https://app.example',
    );
    assert.match(allowed.headers.get('cache-control')!, /max-age=300/);
    const etag = allowed.headers.get('etag')!;
    const conditional = await handleRequest(
      get('/v1/categories', { headers: { 'if-none-match': etag } }),
      env(db) as never,
    );
    assert.equal(conditional.status, 304);
  });

  it('returns consistent safe errors without reflecting database exceptions', async () => {
    const db = new FakeDb();
    db.prepare = () => {
      throw new Error('secret=production-token raw prompt follows');
    };
    const response = await handleRequest(get('/v1/feed'), env(db) as never);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
    });
  });
});
