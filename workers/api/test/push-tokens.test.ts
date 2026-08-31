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
    return { results: this.db.categories.map((slug) => ({ slug })) };
  }
  async run() {
    return { success: true };
  }
}
class FakeDb {
  calls: Array<{ sql: string; values: unknown[] }> = [];
  categories = ['world'];
  prepare(sql: string) {
    return new Statement(sql, this);
  }
}
const token = 'ExpoPushToken[abcdefghijklmnopqrstuv]';
const request = (method: string, body: Record<string, unknown>) =>
  new Request('https://api.example/v1/push-tokens', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const registration = {
  installationId: 'installation_123456',
  token,
  platform: 'android',
  appEnvironment: 'preview',
  preferences: { breakingNews: false, briefings: false, categories: ['world'] },
};

describe('push token API', () => {
  it('validates and stores a conservative registration using bound values', async () => {
    const db = new FakeDb();
    const response = await handleRequest(request('POST', registration), {
      DB: db,
    } as never);
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes(token), false);
    const insert = db.calls.find(({ sql }) =>
      sql.includes('INSERT INTO push_tokens'),
    )!;
    assert.equal(insert.sql.includes(token), false);
    assert.deepEqual(insert.values.slice(-3), [0, 0, '["world"]']);
  });

  it('rejects invalid platform, token, environment, and unavailable categories', async () => {
    for (const change of [
      { platform: 'web' },
      { token: 'not-a-token' },
      { appEnvironment: 'staging' },
      {
        preferences: {
          breakingNews: false,
          briefings: false,
          categories: ['unknown'],
        },
      },
    ]) {
      const db = new FakeDb();
      if ('preferences' in change) db.categories = [];
      const response = await handleRequest(
        request('POST', { ...registration, ...change }),
        { DB: db } as never,
      );
      assert.equal(response.status, 400);
      assert.equal(
        db.calls.some(({ sql }) => sql.includes('INSERT INTO push_tokens')),
        false,
      );
    }
  });

  it('revokes only an exact installation and token pair without returning the token', async () => {
    const db = new FakeDb();
    const response = await handleRequest(
      request('DELETE', { installationId: registration.installationId, token }),
      { DB: db } as never,
    );
    assert.equal(response.status, 200);
    const update = db.calls[0];
    assert.match(update.sql, /installation_id = \? AND token = \?/);
    assert.deepEqual(update.values, [registration.installationId, token]);
    assert.equal((await response.text()).includes(token), false);
  });
});
