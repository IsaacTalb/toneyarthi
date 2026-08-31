import 'server-only';

import { requireSession } from './session';

type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit };

/** Authorized API access for server components, actions, and route handlers only. */
export async function adminApi<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const session = await requireSession();
  const baseUrl = process.env.ADMIN_API_BASE_URL;
  const token = process.env.ADMIN_API_TOKEN;
  if (!baseUrl || !token) throw new Error('The admin API is not configured');
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
