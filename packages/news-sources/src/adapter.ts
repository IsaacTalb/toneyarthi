import type { RawNewsArticle } from '@toneyarthi/types/content';
import { parseRss, type RssItem } from './rss.ts';
import { fetchFeed, type FeedTransport } from './transport.ts';
import {
  normalizeFetchOptions,
  type NewsSourceAdapter,
  type NewsSourceDefinition,
} from './types.ts';

export type SourceItemMapper = (item: RssItem) => Partial<RawNewsArticle>;

export function createRssAdapter(
  definition: NewsSourceDefinition,
  mapItem: SourceItemMapper,
  transport: FeedTransport = fetchFeed,
): NewsSourceAdapter {
  return {
    definition,
    async fetch(input) {
      const options = normalizeFetchOptions(input);
      const items = parseRss(
        await transport(definition.feedUrl, definition.slug, options),
        definition.slug,
      );
      const results: RawNewsArticle[] = [];
      for (const item of items) {
        const mapped = mapItem(item);
        const canonicalUrl = mapped.canonicalUrl ?? item.link;
        const title = mapped.title ?? item.title;
        // A malformed item cannot be safely identified; skip it without losing the feed.
        if (!title || !canonicalUrl || !/^https?:\/\//.test(canonicalUrl))
          continue;
        const published = mapped.publishedAt ?? item.published;
        const publishedAt =
          published && !Number.isNaN(Date.parse(published))
            ? new Date(published).toISOString()
            : undefined;
        results.push({
          sourceId: definition.slug,
          sourceName: definition.name,
          sourceUrl: definition.siteUrl,
          canonicalUrl,
          language: definition.language,
          title,
          fetchedAt: options.fetchedAt.toISOString(),
          summary: mapped.summary,
          content: mapped.content,
          author: mapped.author ?? item.author,
          imageUrl: mapped.imageUrl ?? item.imageUrl,
          publishedAt,
        });
        if (results.length >= options.maxItems) break;
      }
      return results;
    },
  };
}
