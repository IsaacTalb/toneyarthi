import {
  bbcWorldAdapter,
  nasaBreakingNewsAdapter,
  nprNewsAdapter,
} from './adapters.ts';
import type { NewsSourceAdapter } from './types.ts';

const adapters = [bbcWorldAdapter, nprNewsAdapter, nasaBreakingNewsAdapter];

export const newsSourceRegistry: ReadonlyMap<string, NewsSourceAdapter> =
  new Map(adapters.map((adapter) => [adapter.definition.slug, adapter]));

export function getNewsSourceAdapter(slug: string): NewsSourceAdapter {
  const adapter = newsSourceRegistry.get(slug);
  if (!adapter) throw new RangeError(`Unknown news source: ${slug}`);
  return adapter;
}
