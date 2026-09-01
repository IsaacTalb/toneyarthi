import type { Page, PaginationInput } from './client';

export const normalizedSearchTerm = (term: string) => term.trim();

export const isSearchEnabled = (term: string) => {
  const length = normalizedSearchTerm(term).length;
  return length >= 2 && length <= 100;
};

export const nextPageParam = <T>(
  lastPage: Page<T>,
): PaginationInput | undefined => {
  if (!lastPage.hasMore) return undefined;
  return lastPage.nextCursor
    ? { cursor: lastPage.nextCursor }
    : { page: lastPage.page + 1 };
};
