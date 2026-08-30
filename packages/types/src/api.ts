export const API_VERSION = 'v1' as const;

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const;

export const DEFAULT_PAGE = PAGINATION_DEFAULTS.page;
export const DEFAULT_PAGE_SIZE = PAGINATION_DEFAULTS.pageSize;
export const MAX_PAGE_SIZE = PAGINATION_DEFAULTS.maxPageSize;

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/** A discriminated response that requires callers to handle API failures. */
export type ApiResponse<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: ApiError };

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}
