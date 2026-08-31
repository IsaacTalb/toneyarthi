import type { Category, ImageProvenance } from '../../types/src/index';

import {
  imageKey,
  publicMediaUrl,
  thumbnailKey,
  uploadMedia,
  type MediaKey,
} from './index.ts';

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export interface ApprovedImageSource {
  /** Exact host names; subdomains are not implicitly trusted. */
  allowedHosts: readonly string[];
  maxRedirects?: number;
  maxBytes?: number;
  /** Enables Cloudflare's fetch-time image resizing when running on Workers. */
  cloudflareTransform?: {
    width: number;
    height: number;
    fit?: 'cover' | 'contain';
  };
}

export interface FetchedImage {
  bytes: Uint8Array;
  mimeType: SupportedImageMimeType;
  finalUrl: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

function approvedUrl(value: string, allowedHosts: readonly string[]): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('Image URLs must use HTTPS without credentials');
  }
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
    throw new TypeError(`Image host is not approved: ${host}`);
  }
  return url;
}

function sniffMime(bytes: Uint8Array): SupportedImageMimeType | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  return undefined;
}

/** Fetches only explicitly authorized remote media and validates every redirect. */
export async function fetchApprovedImage(
  input: string,
  policy: ApprovedImageSource,
  fetcher: typeof fetch = fetch,
): Promise<FetchedImage> {
  const maxBytes = policy.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new TypeError('maxBytes must be positive');
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0)
    throw new TypeError('maxRedirects must be a non-negative integer');

  let url = approvedUrl(input, policy.allowedHosts);
  for (let redirects = 0; ; redirects += 1) {
    const init: RequestInit & { cf?: { image: Record<string, unknown> } } = {
      redirect: 'manual',
      headers: { Accept: SUPPORTED_IMAGE_MIME_TYPES.join(',') },
    };
    if (policy.cloudflareTransform) {
      init.cf = {
        image: {
          ...policy.cloudflareTransform,
          format: 'webp',
          metadata: 'none',
        },
      };
    }
    const response = await fetcher(url, init);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= maxRedirects)
        throw new Error('Image redirect limit exceeded');
      const location = response.headers.get('location');
      if (!location) throw new Error('Image redirect has no Location header');
      url = approvedUrl(new URL(location, url).toString(), policy.allowedHosts);
      continue;
    }
    if (!response.ok)
      throw new Error(`Image fetch failed with status ${response.status}`);

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
      throw new Error('Image exceeds response-size limit');
    const declaredMime = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (
      !SUPPORTED_IMAGE_MIME_TYPES.includes(
        declaredMime as SupportedImageMimeType,
      )
    )
      throw new Error('Image response has an unsupported MIME type');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Image response has no body');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Image exceeds response-size limit');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const detectedMime = sniffMime(bytes);
    if (!detectedMime || detectedMime !== declaredMime)
      throw new Error('Image MIME type does not match its magic bytes');
    return { bytes, mimeType: detectedMime, finalUrl: url.toString() };
  }
}

export interface ImageVariantKeys {
  article: MediaKey;
  thumbnail: MediaKey;
}

export function articleImageKeys(
  articleId: string,
  extension = 'webp',
): ImageVariantKeys {
  return {
    article: imageKey(`${articleId}.${extension}`),
    thumbnail: thumbnailKey(`${articleId}.${extension}`),
  };
}

export interface StoreImageVariantsInput {
  bucket: R2Bucket;
  publicBaseUrl: string;
  articleId: string;
  article: { bytes: Uint8Array; mimeType: string; extension?: string };
  thumbnail: { bytes: Uint8Array; mimeType: string; extension?: string };
  provenance: ImageProvenance;
}

/** Stores both normalized variants with the same auditable provenance metadata. */
export async function storeImageVariants(input: StoreImageVariantsInput) {
  const extension = input.article.extension ?? 'webp';
  const keys = articleImageKeys(input.articleId, extension);
  const provenance = JSON.stringify(input.provenance);
  const metadata = { articleId: input.articleId, provenance };
  await Promise.all([
    uploadMedia(input.bucket, keys.article, input.article.bytes, {
      contentType: input.article.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata,
    }),
    uploadMedia(input.bucket, keys.thumbnail, input.thumbnail.bytes, {
      contentType: input.thumbnail.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata,
    }),
  ]);
  return {
    keys,
    articleUrl: publicMediaUrl(input.publicBaseUrl, keys.article),
    thumbnailUrl: publicMediaUrl(input.publicBaseUrl, keys.thumbnail),
    provenance: input.provenance,
  };
}

export interface PersistedImageVariants {
  articleId: string;
  keys: ImageVariantKeys;
  mimeType: string;
  provenance: ImageProvenance;
}

/** Upserts the R2 locations and provenance after both objects are stored. */
export async function persistImageProvenance(
  database: D1Database,
  image: PersistedImageVariants,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO article_images
        (article_id, article_key, thumbnail_key, mime_type, provenance_kind, provenance_json, is_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET
        article_key = excluded.article_key,
        thumbnail_key = excluded.thumbnail_key,
        mime_type = excluded.mime_type,
        provenance_kind = excluded.provenance_kind,
        provenance_json = excluded.provenance_json,
        is_fallback = excluded.is_fallback,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(
      image.articleId,
      image.keys.article,
      image.keys.thumbnail,
      image.mimeType,
      image.provenance.kind,
      JSON.stringify(image.provenance),
      image.provenance.kind === 'category-fallback' ? 1 : 0,
    )
    .run();
}

const FALLBACK_COLORS: Record<Category, readonly [string, string]> = {
  local: ['#0F766E', '#115E59'],
  world: ['#2563EB', '#1E3A8A'],
  politics: ['#7C3AED', '#4C1D95'],
  business: ['#047857', '#064E3B'],
  technology: ['#0891B2', '#164E63'],
  health: ['#E11D48', '#881337'],
  science: ['#4F46E5', '#312E81'],
  sports: ['#EA580C', '#9A3412'],
  entertainment: ['#DB2777', '#831843'],
};

/** Small, deterministic, project-owned fallback artwork; no external asset is fetched. */
export function categoryFallbackArtwork(
  category: Category,
  variant: 'article' | 'thumbnail',
): Uint8Array {
  const [start, end] = FALLBACK_COLORS[category];
  const [width, height] = variant === 'article' ? [1200, 675] : [480, 270];
  const label = category.toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * 0.82}" cy="${height * 0.2}" r="${height * 0.32}" fill="#fff" opacity=".1"/><text x="8%" y="82%" fill="#fff" font-family="system-ui,sans-serif" font-size="${Math.round(height * 0.13)}" font-weight="700">${label}</text></svg>`;
  return new TextEncoder().encode(svg);
}

/** Image errors are absorbed and replaced, so publication can always continue. */
export async function withCategoryFallback<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
  onError?: (error: unknown) => void,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    onError?.(error);
    try {
      return await fallback();
    } catch (fallbackError) {
      onError?.(fallbackError);
      return undefined;
    }
  }
}
