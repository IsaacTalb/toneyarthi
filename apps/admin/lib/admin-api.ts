import 'server-only';

import { requireSession } from './session';

type AdminEnvironment = 'development' | 'staging' | 'production';

const apiHosts: Record<AdminEnvironment, ReadonlySet<string>> = {
  development: new Set(['localhost', '127.0.0.1', '[::1]']),
  staging: new Set(['api-staging.toneyarthi.com']),
  production: new Set(['api.toneyarthi.com']),
};

function validatedBaseUrl(): URL {
  const environment = process.env.APP_ENVIRONMENT;
  const configured = process.env.ADMIN_API_BASE_URL;
  if (
    !configured ||
    (environment !== 'development' &&
      environment !== 'staging' &&
      environment !== 'production')
  ) {
    throw new Error('APP_ENVIRONMENT and ADMIN_API_BASE_URL are required');
  }
  const url = new URL(configured);
  if (!apiHosts[environment].has(url.hostname)) {
    throw new Error(`ADMIN_API_BASE_URL is not valid for ${environment}`);
  }
  if (environment !== 'development' && url.protocol !== 'https:') {
    throw new Error('Remote admin APIs must use HTTPS');
  }
  return url;
}

type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit };

/** Authorized API access for server components, actions, and route handlers only. */
export async function adminApi<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const session = await requireSession();
  const baseUrl = validatedBaseUrl();
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) throw new Error('The admin API is not configured');
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('x-admin-actor', session.email);
  headers.set('accept', 'application/json');
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers,
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(
      payload?.error?.message ??
        `Admin API request failed (${response.status})`,
    );
  }
  return payload.data as T;
}
