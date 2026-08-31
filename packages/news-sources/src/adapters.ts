import { createRssAdapter } from './adapter.ts';
import { SOURCE_DEFINITIONS } from './definitions.ts';
import type { NewsSourceDefinition } from './types.ts';

export const [BBC_WORLD, NPR_NEWS, NASA_BREAKING_NEWS] =
  SOURCE_DEFINITIONS satisfies readonly NewsSourceDefinition[];

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
