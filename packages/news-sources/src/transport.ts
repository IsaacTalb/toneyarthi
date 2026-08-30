import { NewsSourceAdapterError } from './errors.ts';
import type { NormalizedNewsFetchOptions } from './types.ts';

export type FeedTransport = (
  url: string,
  sourceSlug: string,
  options: NormalizedNewsFetchOptions,
) => Promise<string>;

export const fetchFeed: FeedTransport = async (url, sourceSlug, options) => {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await fetch(url, { headers: options.headers, signal });
  } catch (cause) {
    throw new NewsSourceAdapterError(
      sourceSlug,
      'transport',
      `Unable to fetch feed for ${sourceSlug}`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new NewsSourceAdapterError(
      sourceSlug,
      'http',
      `Feed for ${sourceSlug} returned HTTP ${response.status}`,
    );
  }
  return response.text();
};
