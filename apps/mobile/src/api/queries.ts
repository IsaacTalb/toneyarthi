import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from '@tanstack/react-query';
import { createApiClient, type PaginationInput } from './client';

export const queryKeys = {
  feeds: ['feeds'] as const,
  feed: (input: PaginationInput = {}) => ['feeds', 'latest', input] as const,
  homeFeed: (limit = 12) => ['feeds', 'home', { limit }] as const,
  categoryFeed: (slug: string, input: PaginationInput = {}) =>
    ['feeds', 'category', slug, input] as const,
  articles: ['articles'] as const,
  article: (id: string) => ['articles', id] as const,
  categories: ['categories'] as const,
  audio: (input: PaginationInput = {}) => ['audio', input] as const,
  search: (term: string, input: PaginationInput = {}) =>
    ['search', term.trim(), input] as const,
  searchInfinite: (term: string, limit: number) =>
    ['search', term.trim(), 'infinite', { limit }] as const,
  exploreFeed: (slug: string | undefined, limit: number) =>
    ['feeds', 'explore', slug ?? 'latest', { limit }] as const,
  playlists: (input: PaginationInput = {}) =>
    ['playlists', 'list', input] as const,
  playlist: (slug: string, input: PaginationInput = {}) =>
    ['playlists', 'detail', slug, input] as const,
};

export const api = createApiClient();
const paged = {
  placeholderData: keepPreviousData,
} as const;

export const queries = {
  exploreFeed: (slug?: string, limit = 12) =>
    infiniteQueryOptions({
      queryKey: queryKeys.exploreFeed(slug, limit),
      initialPageParam: { page: 1 } as PaginationInput,
      queryFn: ({ pageParam, signal }) =>
        slug
          ? api.categoryFeed(slug, { limit, ...pageParam }, signal)
          : api.feed({ limit, ...pageParam }, signal),
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        return lastPage.nextCursor
          ? { cursor: lastPage.nextCursor }
          : { page: lastPage.page + 1 };
      },
    }),
  homeFeed: (limit = 12) =>
    infiniteQueryOptions({
      queryKey: queryKeys.homeFeed(limit),
      initialPageParam: { page: 1 } as PaginationInput,
      queryFn: ({ pageParam, signal }) =>
        api.feed({ limit, ...pageParam }, signal),
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        return lastPage.nextCursor
          ? { cursor: lastPage.nextCursor }
          : { page: lastPage.page + 1 };
      },
    }),
  feed: (input: PaginationInput = {}) =>
    queryOptions({
      queryKey: queryKeys.feed(input),
      queryFn: ({ signal }) => api.feed(input, signal),
      ...paged,
    }),
  categoryFeed: (slug: string, input: PaginationInput = {}) =>
    queryOptions({
      queryKey: queryKeys.categoryFeed(slug, input),
      queryFn: ({ signal }) => api.categoryFeed(slug, input, signal),
      ...paged,
    }),
  article: (id: string) =>
    queryOptions({
      queryKey: queryKeys.article(id),
      queryFn: ({ signal }) => api.article(id, signal),
    }),
  categories: () =>
    queryOptions({
      queryKey: queryKeys.categories,
      queryFn: ({ signal }) => api.categories(signal),
    }),
  audio: (input: PaginationInput = {}) =>
    queryOptions({
      queryKey: queryKeys.audio(input),
      queryFn: ({ signal }) => api.audio(input, signal),
      ...paged,
    }),
  search: (term: string, input: PaginationInput = {}) =>
    queryOptions({
      queryKey: queryKeys.search(term, input),
      queryFn: ({ signal }) => api.search(term, input, signal),
      enabled: term.trim().length >= 2,
      ...paged,
    }),
  searchInfinite: (term: string, limit = 12) =>
    infiniteQueryOptions({
      queryKey: queryKeys.searchInfinite(term, limit),
      initialPageParam: { page: 1 } as PaginationInput,
      queryFn: ({ pageParam, signal }) =>
        api.search(term, { limit, ...pageParam }, signal),
      enabled: term.length >= 2 && term.length <= 100,
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        return lastPage.nextCursor
          ? { cursor: lastPage.nextCursor }
          : { page: lastPage.page + 1 };
      },
    }),
  playlists: (input: PaginationInput = {}) =>
    queryOptions({
      queryKey: queryKeys.playlists(input),
      queryFn: ({ signal }) => api.playlists(input, signal),
      ...paged,
    }),
  playlist: (slug: string, input: PaginationInput = {}) =>
    queryOptions({
      queryKey: queryKeys.playlist(slug, input),
      queryFn: ({ signal }) => api.playlist(slug, input, signal),
      ...paged,
    }),
};
