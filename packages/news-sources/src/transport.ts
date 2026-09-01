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
  let current: URL;
  try {
    current = approvedFeedUrl(url);
  } catch (cause) {
    throw new NewsSourceAdapterError(
      sourceSlug,
      'transport',
      `Feed URL for ${sourceSlug} is not allowed`,
      { cause },
    );
  }
  try {
    // Redirects are rejected so a trusted hostname cannot bounce the request to
    // a private address. Source hosts are compile-time configuration.
    response = await fetch(current, {
      headers: options.headers,
      signal,
      redirect: 'error',
    });
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
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!/(?:application|text)\/(?:rss\+xml|atom\+xml|xml)/.test(contentType))
    throw new NewsSourceAdapterError(
      sourceSlug,
      'transport',
      `Feed for ${sourceSlug} returned an unsupported content type`,
    );
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > options.maxBytes)
    throw new NewsSourceAdapterError(
      sourceSlug,
      'transport',
      `Feed for ${sourceSlug} exceeded the response-size limit`,
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw new NewsSourceAdapterError(
      sourceSlug,
      'transport',
      `Feed for ${sourceSlug} returned no body`,
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > options.maxBytes) {
      await reader.cancel();
      throw new NewsSourceAdapterError(
        sourceSlug,
        'transport',
        `Feed for ${sourceSlug} exceeded the response-size limit`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

function approvedFeedUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const forbidden =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(':');
  if (url.protocol !== 'https:' || url.username || url.password || forbidden)
    throw new TypeError(
      'Feed URLs must be public HTTPS hostnames without credentials',
    );
  return url;
}
