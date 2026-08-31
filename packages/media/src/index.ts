export const MEDIA_KEY_PREFIXES = ['audio', 'images', 'thumbnails'] as const;

export type MediaKeyPrefix = (typeof MEDIA_KEY_PREFIXES)[number];
export type MediaKey = `${MediaKeyPrefix}/${string}`;

/** Bindings required by code that uses the media package. */
export interface MediaBindings {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
}

export interface UploadMediaOptions {
  contentType: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Validate the caller-owned part of an object key. Identifiers deliberately
 * cannot contain path separators, encoded separators, or dot path segments.
 */
export function validateObjectIdentifier(identifier: string): string {
  if (
    !IDENTIFIER_PATTERN.test(identifier) ||
    identifier === '.' ||
    identifier === '..' ||
    identifier.includes('..')
  ) {
    throw new TypeError(
      'Media object identifiers must use only letters, numbers, dots, underscores, and hyphens and cannot contain path traversal',
    );
  }

  return identifier;
}

export function mediaKey(prefix: MediaKeyPrefix, identifier: string): MediaKey {
  return `${prefix}/${validateObjectIdentifier(identifier)}`;
}

export const audioKey = (identifier: string): MediaKey =>
  mediaKey('audio', identifier);
export const imageKey = (identifier: string): MediaKey =>
  mediaKey('images', identifier);
export const thumbnailKey = (identifier: string): MediaKey =>
  mediaKey('thumbnails', identifier);

/** Re-validates a key at destructive-operation boundaries. */
export function normalizeMediaKey(key: string): MediaKey {
  const parts = key.split('/');
  if (
    parts.length !== 2 ||
    !MEDIA_KEY_PREFIXES.includes(parts[0] as MediaKeyPrefix)
  ) {
    throw new TypeError(
      'Media keys must have a supported prefix and one identifier',
    );
  }

  return mediaKey(parts[0] as MediaKeyPrefix, parts[1]);
}

export async function uploadMedia(
  bucket: R2Bucket,
  key: MediaKey,
  value: Parameters<R2Bucket['put']>[1],
  options: UploadMediaOptions,
): Promise<R2Object> {
  const normalizedKey = normalizeMediaKey(key);
  return bucket.put(normalizedKey, value, {
    customMetadata: options.metadata,
    httpMetadata: {
      contentType: options.contentType,
      cacheControl: options.cacheControl,
    },
  });
}

export async function mediaExists(
  bucket: R2Bucket,
  key: MediaKey,
): Promise<boolean> {
  return (await bucket.head(normalizeMediaKey(key))) !== null;
}

export async function deleteMedia(
  bucket: R2Bucket,
  key: MediaKey,
): Promise<void> {
  await bucket.delete(normalizeMediaKey(key));
}

export function publicMediaUrl(baseUrl: string, key: MediaKey): string {
  const normalizedKey = normalizeMediaKey(key);
  const base = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.search ||
    base.hash
  ) {
    throw new TypeError(
      'MEDIA_PUBLIC_BASE_URL must be an HTTP(S) URL without a query or fragment',
    );
  }

  base.pathname = `${base.pathname.replace(/\/+$/, '')}/${normalizedKey
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  return base.toString();
}

export function mediaUrl(bindings: MediaBindings, key: MediaKey): string {
  return publicMediaUrl(bindings.MEDIA_PUBLIC_BASE_URL, key);
}

export * from './images.ts';
