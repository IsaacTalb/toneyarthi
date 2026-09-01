import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { handleRequest } from '../src/index.ts';

let runtime: Miniflare;
let db: D1Database;

before(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'api-integration',
          modules: true,
          script: 'export default { fetch() { return new Response("ok") } }',
          d1Databases: { DB: 'test-db' },
        },
      ],
    }),
  );
  db = await runtime.getD1Database('DB');
  await db.exec(`
    CREATE TABLE categories (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, name_my TEXT, description TEXT, is_active INTEGER, display_order INTEGER);
    CREATE TABLE articles (id TEXT PRIMARY KEY, canonical_url TEXT, title TEXT, title_my TEXT, summary TEXT, summary_my TEXT, body_my TEXT, author TEXT, image_url TEXT, audio_url TEXT, published_at TEXT, category_id TEXT, status TEXT);
    CREATE TABLE sources (id TEXT PRIMARY KEY, name TEXT, site_url TEXT, is_active INTEGER);
    CREATE TABLE article_sources (article_id TEXT, source_id TEXT, source_url TEXT, original_title TEXT, original_published_at TEXT);
    CREATE TABLE article_images (article_id TEXT, provenance_kind TEXT);
    CREATE TABLE playlists (id TEXT PRIMARY KEY, slug TEXT, title TEXT, title_my TEXT, description TEXT, image_url TEXT, published_at TEXT, status TEXT);
    CREATE TABLE playlist_articles (playlist_id TEXT, article_id TEXT, position INTEGER);
  `);
  await db.batch([
    db.prepare(
      "INSERT INTO categories VALUES ('cat','world','World','ကမ္ဘာ','Reports',1,1)",
    ),
    db.prepare(
      "INSERT INTO sources VALUES ('source','Wire','https://wire.test',1)",
    ),
    db.prepare(
      `INSERT INTO articles VALUES ('published','https://wire.test/published','Public title','အများသိ','Public summary','အနှစ်ချုပ်','ကိုယ်ထည်','Reporter','https://images.test/p.jpg','https://audio.test/p.wav','2026-08-01T00:00:00Z','cat','published')`,
    ),
    db.prepare(
      `INSERT INTO articles VALUES ('draft','https://wire.test/draft','Secret draft',NULL,'Private',NULL,NULL,NULL,NULL,NULL,'2026-08-01T00:00:00Z','cat','draft')`,
    ),
    db.prepare(
      "INSERT INTO article_sources VALUES ('published','source','https://wire.test/published','Original','2026-08-01T00:00:00Z')",
    ),
    db.prepare(
      "INSERT INTO article_images VALUES ('published','licensed-asset')",
    ),
  ]);
});

after(async () => runtime.dispose());

const request = (path: string) =>
  handleRequest(new Request(`https://api.test${path}`), { DB: db } as never);

interface ArticlePayload {
  success: boolean;
  data: {
    bodyMy?: string;
    items: Array<Record<string, unknown> & { id: string; sources: unknown[] }>;
  };
}

const payload = (response: Response) =>
  response.json() as Promise<ArticlePayload>;

describe('D1-backed public API', () => {
  it('shapes a published feed with parsed source attribution', async () => {
    const response = await request('/v1/feed?limit=10');
    assert.equal(response.status, 200);
    const body = await payload(response);
    assert.equal(body.success, true);
    assert.equal(body.data.items.length, 1);
    assert.deepEqual(body.data.items[0]!.sources, [
      {
        name: 'Wire',
        url: 'https://wire.test/published',
        siteUrl: 'https://wire.test',
        title: 'Original',
        publishedAt: '2026-08-01T00:00:00Z',
      },
    ]);
    assert.equal(body.data.items[0]!.imageUrl, 'https://images.test/p.jpg');
    assert.equal('bodyMy' in body.data.items[0]!, false);
  });

  it('returns editorial detail while keeping drafts unreachable', async () => {
    const detail = await request('/v1/articles/published');
    assert.equal(detail.status, 200);
    const body = await payload(detail);
    assert.equal(body.data.bodyMy, 'ကိုယ်ထည်');
    assert.equal((await request('/v1/articles/draft')).status, 404);
  });

  it('binds search wildcards literally against D1', async () => {
    assert.deepEqual(
      (await payload(await request('/v1/search?q=Public%25'))).data.items,
      [],
    );
    assert.equal(
      (await payload(await request('/v1/search?q=Public'))).data.items[0]!.id,
      'published',
    );
  });
});
