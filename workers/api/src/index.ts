import {
  AdminError,
  handleAdminAction,
  handleAdminReview,
  handleAdminProcessing,
  handleAdminPlaylists,
  handleAdminSources,
} from './admin.ts';
import { handlePushTokenRequest, PushTokenError } from './push-tokens.ts';

const service = 'api';
const API_PREFIX = '/v1';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PAGE = 500;
const MAX_REQUEST_BYTES = 64 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  ADMIN_API_TOKEN?: string;
  PIPELINE_QUEUE: Queue;
  TTS_QUEUE: Queue;
  RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}

type Json = Record<string, unknown> | unknown[];

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ARTICLE_SUMMARY = `
  a.id, a.title, a.title_my AS titleMy, a.summary, a.summary_my AS summaryMy,
  a.author, a.image_url AS imageUrl, a.audio_url AS audioUrl,
  a.published_at AS publishedAt,
  c.slug AS categorySlug, c.name AS categoryName, c.name_my AS categoryNameMy,
  COALESCE((SELECT json_group_array(json_object(
    'name', source_rows.name, 'url', source_rows.source_url,
    'siteUrl', source_rows.site_url
  )) FROM (
    SELECT s.name, ars.source_url, s.site_url
    FROM article_sources ars JOIN sources s ON s.id = ars.source_id
    WHERE ars.article_id = a.id AND s.is_active = 1 ORDER BY s.name
  ) source_rows), json('[]')) AS sources`;

const PUBLISHABLE = `a.status = 'published' AND a.published_at IS NOT NULL AND a.published_at <= datetime('now')`;

function pagination(url: URL): { limit: number; offset: number } {
  const parse = (name: string, fallback: number, max: number) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw))
      throw new HttpError(
        400,
        'INVALID_QUERY',
        `${name} must be a positive integer`,
      );
    const value = Number(raw);
    if (value < 1 || value > max)
      throw new HttpError(
        400,
        'INVALID_QUERY',
        `${name} must be between 1 and ${max}`,
      );
    return value;
  };
  const limit = parse('limit', DEFAULT_LIMIT, MAX_LIMIT);
  const page = parse('page', 1, MAX_PAGE);
  return { limit, offset: (page - 1) * limit };
}

function pathValue(value: string, code: string, message: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, code, message);
  }
}

function rows<T extends Record<string, unknown>>(result: D1Result<T>): T[] {
  return result.results.map((row) => {
    const shaped: Record<string, unknown> = { ...row };
    if (typeof shaped.sources === 'string') {
      try {
        shaped.sources = JSON.parse(shaped.sources);
      } catch {
        shaped.sources = [];
      }
    }
    return shaped as T;
  });
}

function allowedOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get('origin');
  if (!origin) return undefined;
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : undefined;
}

async function jsonResponse(
  request: Request,
  env: Env,
  data: Json,
  status = 200,
  cache = 'public, max-age=60, s-maxage=300, stale-while-revalidate=300',
): Promise<Response> {
  const body = JSON.stringify({
    success: status < 400,
    ...(status < 400 ? { data } : { error: data }),
  });
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cache,
    etag: `W/"${await digest(body)}"`,
    vary: 'Origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  });
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    headers.set(
      'access-control-allow-headers',
      'Accept, Content-Type, If-None-Match',
    );
    headers.set('access-control-max-age', '86400');
  }
  if (
    request.headers.get('if-none-match') === headers.get('etag') &&
    status === 200
  )
    return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers,
  });
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(hash)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function listArticles(
  env: Env,
  url: URL,
  where = '',
  bindings: unknown[] = [],
  order = 'a.published_at DESC, a.id DESC',
) {
  const { limit, offset } = pagination(url);
  const result = await env.DB.prepare(
    `SELECT ${ARTICLE_SUMMARY} FROM articles a LEFT JOIN categories c ON c.id = a.category_id WHERE ${PUBLISHABLE} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<Record<string, unknown>>();
  return {
    items: rows(result),
    page: Math.floor(offset / limit) + 1,
    limit,
    hasMore: result.results.length === limit,
  };
}

async function route(
  request: Request,
  env: Env,
  url: URL,
): Promise<{ data: Json; cache?: string }> {
  const path = url.pathname;
  if (path === `${API_PREFIX}/health`) {
    await env.DB.prepare('SELECT 1 AS healthy').first();
    return {
      data: { status: 'ok', service, version: 'v1' },
      cache: 'no-store',
    };
  }
  const feedVariant = path.match(/^\/v1\/feed(?:\/(latest|audio))?$/);
  if (feedVariant) {
    const variant =
      feedVariant[1] ?? url.searchParams.get('variant') ?? 'latest';
    if (!['latest', 'audio'].includes(variant))
      throw new HttpError(
        400,
        'INVALID_VARIANT',
        'variant must be latest or audio',
      );
    return {
      data: await listArticles(
        env,
        url,
        variant === 'audio' ? 'AND a.audio_url IS NOT NULL' : '',
      ),
    };
  }
  if (path === `${API_PREFIX}/audio/latest`)
    return {
      data: await listArticles(env, url, 'AND a.audio_url IS NOT NULL'),
    };
  if (path === `${API_PREFIX}/categories`) {
    const result = await env.DB.prepare(
      'SELECT slug, name, name_my AS nameMy, description FROM categories WHERE is_active = ? ORDER BY display_order, name',
    )
      .bind(1)
      .all<Record<string, unknown>>();
    return {
      data: { items: rows(result) },
      cache: 'public, max-age=300, stale-while-revalidate=3600',
    };
  }
  const category = path.match(/^\/v1\/categories\/([^/]+)\/feed$/);
  if (category) {
    const slug = pathValue(
      category[1],
      'INVALID_CATEGORY',
      'Invalid category slug',
    );
    if (!SLUG.test(slug))
      throw new HttpError(400, 'INVALID_CATEGORY', 'Invalid category slug');
    const exists = await env.DB.prepare(
      'SELECT slug FROM categories WHERE slug = ? AND is_active = ?',
    )
      .bind(slug, 1)
      .first();
    if (!exists)
      throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    return { data: await listArticles(env, url, 'AND c.slug = ?', [slug]) };
  }
  const article = path.match(/^\/v1\/articles\/([^/]+)$/);
  if (article) {
    const id = pathValue(
      article[1],
      'INVALID_ARTICLE_ID',
      'Invalid article id',
    );
    if (!ID.test(id))
      throw new HttpError(400, 'INVALID_ARTICLE_ID', 'Invalid article id');
    const result = await env.DB.prepare(
      `SELECT ${ARTICLE_SUMMARY}, a.body, a.body_my AS bodyMy FROM articles a LEFT JOIN categories c ON c.id = a.category_id WHERE a.id = ? AND ${PUBLISHABLE} LIMIT 1`,
    )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!result)
      throw new HttpError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    return {
      data: rows({ results: [result] } as D1Result<Record<string, unknown>>)[0],
      cache: 'public, max-age=300, stale-while-revalidate=3600',
    };
  }
  if (path === `${API_PREFIX}/playlists`) {
    const { limit, offset } = pagination(url);
    const result = await env.DB.prepare(
      "SELECT slug, title, title_my AS titleMy, description, image_url AS imageUrl, published_at AS publishedAt FROM playlists WHERE status = ? AND published_at IS NOT NULL AND published_at <= datetime('now') ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?",
    )
      .bind('published', limit, offset)
      .all<Record<string, unknown>>();
    return {
      data: {
        items: rows(result),
        page: offset / limit + 1,
        limit,
        hasMore: result.results.length === limit,
      },
    };
  }
  const playlist = path.match(/^\/v1\/playlists\/([^/]+)$/);
  if (playlist) {
    const slug = pathValue(
      playlist[1],
      'INVALID_PLAYLIST',
      'Invalid playlist slug',
    );
    if (!SLUG.test(slug))
      throw new HttpError(400, 'INVALID_PLAYLIST', 'Invalid playlist slug');
    const meta = await env.DB.prepare(
      "SELECT slug, title, title_my AS titleMy, description, image_url AS imageUrl, published_at AS publishedAt FROM playlists WHERE slug = ? AND status = ? AND published_at IS NOT NULL AND published_at <= datetime('now')",
    )
      .bind(slug, 'published')
      .first<Record<string, unknown>>();
    if (!meta)
      throw new HttpError(404, 'PLAYLIST_NOT_FOUND', 'Playlist not found');
    const { limit, offset } = pagination(url);
    const articleRows = await env.DB.prepare(
      `SELECT ${ARTICLE_SUMMARY} FROM playlist_articles pa JOIN playlists p ON p.id = pa.playlist_id JOIN articles a ON a.id = pa.article_id LEFT JOIN categories c ON c.id = a.category_id WHERE p.slug = ? AND p.status = ? AND ${PUBLISHABLE} ORDER BY pa.position LIMIT ? OFFSET ?`,
    )
      .bind(slug, 'published', limit, offset)
      .all<Record<string, unknown>>();
    return {
      data: {
        ...meta,
        items: rows(articleRows),
        page: offset / limit + 1,
        limit,
        hasMore: articleRows.results.length === limit,
      },
    };
  }
  if (path === `${API_PREFIX}/search`) {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 2 || query.length > 100)
      throw new HttpError(
        400,
        'INVALID_QUERY',
        'q must contain 2 to 100 characters',
      );
    const escaped = query.replace(/[\\%_]/g, '\\$&');
    return {
      data: await listArticles(
        env,
        url,
        "AND (a.title LIKE ? ESCAPE '\\' OR a.title_my LIKE ? ESCAPE '\\' OR a.summary LIKE ? ESCAPE '\\' OR a.summary_my LIKE ? ESCAPE '\\')",
        Array(4).fill(`%${escaped}%`),
      ),
    };
  }
  throw new HttpError(404, 'NOT_FOUND', 'Route not found');
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (!url.pathname.startsWith(`${API_PREFIX}/`))
      throw new HttpError(404, 'NOT_FOUND', 'Route not found');
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES)
      throw new HttpError(
        413,
        'REQUEST_TOO_LARGE',
        'Request body is too large',
      );
    if (
      env.RATE_LIMITER &&
      (request.method !== 'GET' || url.pathname === '/v1/search')
    ) {
      const client = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const bucket = url.pathname.startsWith('/v1/admin/')
        ? 'admin'
        : url.pathname;
      const result = await env.RATE_LIMITER.limit({
        key: `${bucket}:${client}`,
      });
      if (!result.success)
        throw new HttpError(429, 'RATE_LIMITED', 'Too many requests');
    }
    if (request.method === 'OPTIONS') {
      if (request.headers.has('origin') && !allowedOrigin(request, env))
        throw new HttpError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed');
      return jsonResponse(request, env, {}, 204, 'no-store');
    }
    if (request.method === 'PATCH') {
      const playlistData = await handleAdminPlaylists(request, env, url);
      if (playlistData !== null)
        return jsonResponse(request, env, playlistData, 200, 'no-store');
      const sourceData = await handleAdminSources(request, env, url);
      if (sourceData !== null)
        return jsonResponse(request, env, sourceData, 200, 'no-store');
      const data = await handleAdminReview(request, env, url);
      if (data === null)
        throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      return jsonResponse(request, env, data, 200, 'no-store');
    }
    if (request.method === 'POST' || request.method === 'DELETE') {
      const pushResult = await handlePushTokenRequest(request, env, url);
      if (pushResult !== null)
        return jsonResponse(request, env, pushResult, 200, 'no-store');
      if (request.method === 'DELETE')
        throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      const playlistData = await handleAdminPlaylists(request, env, url);
      if (playlistData !== null)
        return jsonResponse(request, env, playlistData, 200, 'no-store');
      const data = await handleAdminAction(request, env, url);
      if (data === null) {
        const processing = await handleAdminProcessing(request, env, url);
        if (processing !== null)
          return jsonResponse(request, env, processing, 200, 'no-store');
      }
      if (data === null)
        throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      return jsonResponse(request, env, data, 200, 'no-store');
    }
    if (!['GET', 'HEAD'].includes(request.method))
      throw new HttpError(
        405,
        'METHOD_NOT_ALLOWED',
        'Only GET and HEAD are supported',
      );
    const adminReview = await handleAdminReview(request, env, url);
    if (adminReview !== null)
      return jsonResponse(request, env, adminReview, 200, 'no-store');
    const adminPlaylists = await handleAdminPlaylists(request, env, url);
    if (adminPlaylists !== null)
      return jsonResponse(request, env, adminPlaylists, 200, 'no-store');
    const adminProcessing = await handleAdminProcessing(request, env, url);
    if (adminProcessing !== null)
      return jsonResponse(request, env, adminProcessing, 200, 'no-store');
    const adminSources = await handleAdminSources(request, env, url);
    if (adminSources !== null)
      return jsonResponse(request, env, adminSources, 200, 'no-store');
    const result = await route(request, env, url);
    return jsonResponse(request, env, result.data, 200, result.cache);
  } catch (error) {
    const safe =
      error instanceof HttpError ||
      error instanceof AdminError ||
      error instanceof PushTokenError
        ? error
        : new HttpError(500, 'INTERNAL_ERROR', 'An internal error occurred');
    return jsonResponse(
      request,
      env,
      { code: safe.code, message: safe.message },
      safe.status,
      'no-store',
    );
  }
}

export default { fetch: handleRequest } satisfies ExportedHandler<Env>;
