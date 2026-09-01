import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createRssAdapter } from '../src/adapter.ts';
import { BBC_WORLD, NASA_BREAKING_NEWS, NPR_NEWS } from '../src/adapters.ts';
import { NewsSourceAdapterError } from '../src/errors.ts';
import { getNewsSourceAdapter, newsSourceRegistry } from '../src/registry.ts';
import { normalizeFetchOptions } from '../src/types.ts';
import { fetchFeed } from '../src/transport.ts';

const fixture = (name: string) =>
  readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const adapterFor = (definition: typeof BBC_WORLD, xml: string) =>
  createRssAdapter(
    definition,
    (item) => ({
      summary: item.description,
      content: item.content,
    }),
    async () => xml,
  );

describe('RSS normalization', () => {
  it('normalizes valid entries and skips malformed items', async () => {
    const articles = await adapterFor(
      BBC_WORLD,
      await fixture('bbc-world.xml'),
    ).fetch({
      fetchedAt: new Date('2026-08-30T15:00:00Z'),
    });
    assert.equal(articles.length, 2);
    assert.deepEqual(articles[0], {
      sourceId: 'bbc-world',
      sourceName: 'BBC News',
      sourceUrl: 'https://www.bbc.com/news',
      canonicalUrl: 'https://www.bbc.com/news/world-123',
      language: 'en-GB',
      title: 'World headline',
      fetchedAt: '2026-08-30T15:00:00.000Z',
      summary: 'A concise summary & context.',
      content: undefined,
      author: undefined,
      imageUrl: undefined,
      publishedAt: '2026-08-30T08:00:00.000Z',
    });
  });

  it('allows optional article fields to be absent', async () => {
    const [, article] = await adapterFor(
      BBC_WORLD,
      await fixture('bbc-world.xml'),
    ).fetch();
    assert.equal(article.title, 'Optional fields absent');
    assert.equal(article.summary, undefined);
    assert.equal(article.publishedAt, undefined);
  });

  it('rejects a malformed feed document', async () => {
    await assert.rejects(
      adapterFor(BBC_WORLD, '<html>not a feed</html>').fetch(),
      (error) =>
        error instanceof NewsSourceAdapterError &&
        error.code === 'invalid-feed',
    );
  });
});

describe('source-specific behavior', () => {
  it('maps NPR creator and media image extensions', async () => {
    const [article] = await adapterFor(
      NPR_NEWS,
      await fixture('npr.xml'),
    ).fetch();
    assert.equal(article.author, 'News Desk');
    assert.equal(article.imageUrl, 'https://media.npr.org/image.jpg');
  });

  it('maps NASA content:encoded without fetching article HTML', async () => {
    const [article] = await adapterFor(
      NASA_BREAKING_NEWS,
      await fixture('nasa.xml'),
    ).fetch();
    assert.equal(
      article.content,
      'Mission details supplied in the official feed.',
    );
  });
});

describe('configuration and registry', () => {
  it('normalizes defaults and validates limits', () => {
    assert.equal(normalizeFetchOptions().timeoutMs, 10_000);
    assert.throws(() => normalizeFetchOptions({ maxItems: 0 }), RangeError);
  });

  it('is keyed by stable source slug', () => {
    assert.equal(newsSourceRegistry.size, 3);
    assert.equal(getNewsSourceAdapter('bbc-world').definition, BBC_WORLD);
    assert.throws(() => getNewsSourceAdapter('unknown'), RangeError);
  });
});

describe('outbound transport security', () => {
  it('rejects non-HTTPS and private-address feed targets before fetch', async () => {
    const options = normalizeFetchOptions();
    await assert.rejects(fetchFeed('http://example.com/feed', 'test', options));
    await assert.rejects(fetchFeed('https://127.0.0.1/feed', 'test', options));
  });

  it('enforces XML content type and the streaming byte limit', async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response('not xml', {
          headers: { 'content-type': 'text/html' },
        });
      await assert.rejects(
        fetchFeed(
          'https://feeds.example/feed',
          'test',
          normalizeFetchOptions(),
        ),
      );
      globalThis.fetch = async () =>
        new Response('x'.repeat(2048), {
          headers: { 'content-type': 'application/rss+xml' },
        });
      await assert.rejects(
        fetchFeed(
          'https://feeds.example/feed',
          'test',
          normalizeFetchOptions({ maxBytes: 1024 }),
        ),
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it('strips active and presentation HTML from untrusted feed fields', async () => {
    const xml =
      '<rss><channel><item><title>Hello</title><link>https://example.test/a</link><description>Safe <b>text</b><script>steal()</script></description></item></channel></rss>';
    const [article] = await adapterFor(BBC_WORLD, xml).fetch();
    assert.equal(article.summary, 'Safe text');
  });
});
