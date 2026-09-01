import type { ApiError, ApiResponse } from '@toneyarthi/types';

export interface ArticleSummary {
  id: string;
  title: string;
  titleMy?: string;
  summary: string;
  summaryMy?: string;
  author?: string;
  imageUrl?: string;
  audioUrl?: string;
  publishedAt: string;
  categorySlug?: string;
  categoryName?: string;
  categoryNameMy?: string;
  sources: Array<{
    name: string;
    url: string;
    siteUrl?: string;
    title?: string;
    publishedAt?: string;
  }>;
}

export interface ArticleDetail extends ArticleSummary {
  bodyMy?: string;
}

export interface Category {
  slug: string;
  name: string;
  nameMy?: string;
  description?: string;
}

export interface PlaylistSummary {
  slug: string;
  title: string;
  titleMy?: string;
  description?: string;
  imageUrl?: string;
  publishedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
  /** Supported for APIs that migrate from numbered pages to opaque cursors. */
  nextCursor?: string;
}

export interface Playlist extends PlaylistSummary, Page<ArticleSummary> {}

export type PaginationInput = {
  limit?: number;
  page?: number;
  cursor?: string;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    status?: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeBaseUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must use http or https');
  }
  const environment = process.env.EXPO_PUBLIC_APP_ENVIRONMENT ?? 'development';
  const environmentHosts: Record<string, ReadonlySet<string>> = {
    development: new Set([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'api-dev.toneyarthi.com',
    ]),
    staging: new Set(['api-staging.toneyarthi.com']),
    production: new Set(['api.toneyarthi.com']),
  };
  if (
    url.hostname.endsWith('toneyarthi.com') &&
    !environmentHosts[environment]?.has(url.hostname)
  ) {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL is not valid for ${environment}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL cannot contain credentials, query, or hash',
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function buildApiUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function mappedError(error: Partial<ApiError> | undefined, status?: number) {
  return new ApiClientError(
    error?.code ?? (status ? `HTTP_${status}` : 'INVALID_RESPONSE'),
    error?.message ?? 'The API returned an invalid response',
    status,
    error?.details,
  );
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw mappedError(undefined, response.status);
  }
  if (!response.ok || payload.success !== true) {
    throw mappedError(
      payload.success === false ? payload.error : undefined,
      response.status,
    );
  }
  if (!('data' in payload)) throw mappedError(undefined, response.status);
  return payload.data;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiClientError && error.status !== undefined) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

const pageParams = (input: PaginationInput = {}) => ({
  page: input.page,
  limit: input.limit,
  cursor: input.cursor,
});

export function createApiClient(
  baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL,
  fetcher: typeof fetch = fetch,
) {
  const normalized = normalizeBaseUrl(baseUrl);
  const get = async <T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ) => {
    const response = await fetcher(buildApiUrl(normalized, path, params), {
      headers: { Accept: 'application/json' },
      signal,
    });
    return parseApiResponse<T>(response);
  };

  return {
    feed: (input?: PaginationInput, signal?: AbortSignal) =>
      get<Page<ArticleSummary>>('/v1/feed', pageParams(input), signal),
    article: (id: string, signal?: AbortSignal) =>
      get<ArticleDetail>(`/v1/articles/${encodeURIComponent(id)}`, {}, signal),
    categories: (signal?: AbortSignal) =>
      get<{ items: Category[] }>('/v1/categories', {}, signal),
    categoryFeed: (
      slug: string,
      input?: PaginationInput,
      signal?: AbortSignal,
    ) =>
      get<Page<ArticleSummary>>(
        `/v1/categories/${encodeURIComponent(slug)}/feed`,
        pageParams(input),
        signal,
      ),
    audio: (input?: PaginationInput, signal?: AbortSignal) =>
      get<Page<ArticleSummary>>('/v1/audio/latest', pageParams(input), signal),
    search: (query: string, input?: PaginationInput, signal?: AbortSignal) =>
      get<Page<ArticleSummary>>(
        '/v1/search',
        { q: query.trim(), ...pageParams(input) },
        signal,
      ),
    playlists: (input?: PaginationInput, signal?: AbortSignal) =>
      get<Page<PlaylistSummary>>('/v1/playlists', pageParams(input), signal),
    playlist: (slug: string, input?: PaginationInput, signal?: AbortSignal) =>
      get<Playlist>(
        `/v1/playlists/${encodeURIComponent(slug)}`,
        pageParams(input),
        signal,
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
