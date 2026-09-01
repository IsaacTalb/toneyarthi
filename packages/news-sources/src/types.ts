import type { RawNewsArticle } from '@toneyarthi/types/content';

export interface NewsSourceDefinition {
  /** Stable, URL-safe identifier used by the registry and persisted articles. */
  slug: string;
  name: string;
  siteUrl: string;
  feedUrl: string;
  language: string;
  /** Parser implementation selected from the compile-time adapter registry. */
  adapterType: 'rss';
}

export interface NewsFetchOptions {
  timeoutMs?: number;
  maxItems?: number;
  /** Maximum response bytes read from the network. */
  maxBytes?: number;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  fetchedAt?: Date;
}

export interface NormalizedNewsFetchOptions {
  timeoutMs: number;
  maxItems: number;
  maxBytes: number;
  headers: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  fetchedAt: Date;
}

export interface NewsSourceAdapter {
  readonly definition: NewsSourceDefinition;
  fetch(options?: NewsFetchOptions): Promise<RawNewsArticle[]>;
}

export function normalizeFetchOptions(
  options: NewsFetchOptions = {},
): NormalizedNewsFetchOptions {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxItems = options.maxItems ?? 50;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new RangeError('timeoutMs must be an integer between 1 and 60000');
  }
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 500) {
    throw new RangeError('maxItems must be an integer between 1 and 500');
  }
  if (
    !Number.isInteger(maxBytes) ||
    maxBytes < 1024 ||
    maxBytes > 10 * 1024 * 1024
  ) {
    throw new RangeError(
      'maxBytes must be an integer between 1024 and 10485760',
    );
  }
  return {
    timeoutMs,
    maxItems,
    maxBytes,
    headers: {
      accept: 'application/rss+xml, application/xml;q=0.9',
      ...options.headers,
    },
    signal: options.signal,
    fetchedAt: options.fetchedAt ?? new Date(),
  };
}
