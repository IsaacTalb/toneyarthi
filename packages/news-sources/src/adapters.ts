import { createRssAdapter } from './adapter.ts';
import type { NewsSourceDefinition } from './types.ts';

export const BBC_WORLD: NewsSourceDefinition = {
  slug: 'bbc-world',
  name: 'BBC News',
  siteUrl: 'https://www.bbc.com/news',
  feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  language: 'en-GB',
};

export const NPR_NEWS: NewsSourceDefinition = {
  slug: 'npr-news',
  name: 'NPR',
  siteUrl: 'https://www.npr.org/',
  feedUrl: 'https://feeds.npr.org/1001/rss.xml',
  language: 'en-US',
};

export const NASA_BREAKING_NEWS: NewsSourceDefinition = {
  slug: 'nasa-breaking-news',
  name: 'NASA',
  siteUrl: 'https://www.nasa.gov/',
  feedUrl: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',
  language: 'en-US',
};

export const bbcWorldAdapter = createRssAdapter(BBC_WORLD, (item) => ({
  summary: item.description,
}));

export const nprNewsAdapter = createRssAdapter(NPR_NEWS, (item) => ({
  summary: item.description,
  imageUrl: item.imageUrl,
}));

export const nasaBreakingNewsAdapter = createRssAdapter(
  NASA_BREAKING_NEWS,
  (item) => ({
    summary: item.description,
    content: item.content,
  }),
);
