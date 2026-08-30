import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import type { RawNewsArticle } from '@toneyarthi/types';
import {
  canonicalizeUrl,
  normalizeTitle,
  normalizeWhitespace,
  parsePublicationDate,
  removeCommonChrome,
  stableContentHash,
  stripHtml,
  validateAndNormalizeArticle,
} from '../src/index.ts';

const fixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await readFile(new URL(`fixtures/${name}`, import.meta.url), 'utf8'),
  ) as T;
const valid: RawNewsArticle = {
  sourceId: 'example',
  sourceName: 'Example News',
  sourceUrl: 'https://example.com',
  canonicalUrl: 'https://example.com/story',
  title: 'A real report',
  language: 'en',
  summary:
    'Officials announced a detailed policy after a public meeting today.',
  fetchedAt: '2026-08-30T12:00:00Z',
};

describe('fixture-driven transformations', () => {
  it('normalizes each supported representation', async () => {
    const rows = await fixture<Array<Record<string, string>>>(
      'transformations.json',
    );
    for (const row of rows) {
      const actual =
        row.operation === 'html'
          ? stripHtml(removeCommonChrome(row.input))
          : row.operation === 'whitespace'
            ? normalizeWhitespace(row.input)
            : row.operation === 'title'
              ? normalizeTitle(row.input, row.sourceName)
              : row.operation === 'url'
                ? canonicalizeUrl(row.input)
                : parsePublicationDate(row.input);
      assert.equal(actual, row.expected, row.name);
    }
  });
  it('produces the same hash for formatting-only changes', async () => {
    assert.equal(
      await stableContentHash({ title: 'Headline', content: 'one  two' }),
      await stableContentHash({ title: ' headline ', content: 'one\ttwo' }),
    );
  });
});

describe('fixture-driven rejection classes', () => {
  it('returns bounded structured diagnostics for every class', async () => {
    const rows = await fixture<
      Array<{
        code: string;
        patch?: Partial<RawNewsArticle>;
        options?: { rawDocumentBytes: number };
        duplicate?: boolean;
      }>
    >('rejections.json');
    for (const row of rows) {
      let options = row.options ?? {};
      if (row.duplicate)
        options = {
          ...options,
          seenUrls: new Set([valid.canonicalUrl]),
        } as typeof options;
      const result = await validateAndNormalizeArticle(
        { ...valid, ...row.patch },
        options,
      );
      assert.equal(result.accepted, false, row.code);
      if (!result.accepted) {
        assert.equal(result.code, row.code);
        assert.ok(result.message.length <= 300);
        assert.equal('content' in result.diagnostic, false);
      }
    }
  });
  it('returns normalized accepted content', async () => {
    const result = await validateAndNormalizeArticle({
      ...valid,
      title: '<b>A real report</b> — Example News',
      summary:
        '<nav>Home</nav><p>Officials announced a detailed policy after a public meeting today.</p>',
    });
    assert.equal(result.accepted, true);
    if (result.accepted) {
      assert.equal(result.article.title, 'A real report');
      assert.equal(
        result.article.summary,
        'Officials announced a detailed policy after a public meeting today.',
      );
      assert.match(result.contentHash, /^[a-f0-9]{64}$/);
    }
  });
});
