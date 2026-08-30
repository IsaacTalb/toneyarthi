import type { RawNewsArticle } from '@toneyarthi/types';

export * from './deduplication.ts';

export const CONTENT_LIMITS = Object.freeze({
  rawDocumentBytes: 1_000_000,
  titleCharacters: 500,
  descriptionCharacters: 10_000,
  contentCharacters: 250_000,
  diagnosticCharacters: 300,
});

const TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid)$/i;
const BLOCK_TAG =
  /<\/?(?:address|article|aside|blockquote|br|div|h[1-6]|hr|li|main|ol|p|pre|section|table|tr|ul)\b[^>]*>/gi;
const CHROME_ELEMENT =
  /<(?:nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/(?:nav|footer|header|aside)>/gi;
const DANGEROUS_ELEMENT =
  /<(?:script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript|svg)>/gi;
const BOILERPLATE_LINE =
  /^(?:home|menu|navigation|skip to (?:content|main content)|privacy(?: policy)?|terms(?: of (?:use|service))?|cookie settings|all rights reserved|copyright(?: \d{4})?|subscribe|sign (?:in|up))$/i;

const decodeEntities = (value: string): string =>
  value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (entity, name: string) => {
    const named: Record<string, string> = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      nbsp: ' ',
      quot: '"',
      ndash: '–',
      mdash: '—',
      hellip: '…',
    };
    if (name[0] !== '#') return named[name.toLowerCase()] ?? entity;
    const hexadecimal = name[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(
      name.slice(hexadecimal ? 2 : 1),
      hexadecimal ? 16 : 10,
    );
    return Number.isFinite(point) && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });

export function normalizeWhitespace(value: string): string {
  return (
    value
      // Text controls are invalid article content; retain newline and tab for normalization.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\f\v ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Removes page chrome before converting HTML to bounded, readable plain text. */
export function removeCommonChrome(html: string): string {
  const withoutElements = html
    .replace(DANGEROUS_ELEMENT, '')
    .replace(CHROME_ELEMENT, '');
  return withoutElements
    .split(/\r?\n/)
    .filter(
      (line) => !BOILERPLATE_LINE.test(normalizeWhitespace(stripHtml(line))),
    )
    .join('\n');
}

export function stripHtml(html: string): string {
  return normalizeWhitespace(
    decodeEntities(
      html
        .replace(DANGEROUS_ELEMENT, '')
        .replace(/<!--([\s\S]*?)-->/g, '')
        .replace(BLOCK_TAG, '\n')
        .replace(/<[^>]*>/g, ' '),
    ),
  );
}

export function normalizeTitle(value: string, sourceName?: string): string {
  let title = normalizeWhitespace(stripHtml(value));
  title = title.replace(
    /\s+(?:[-–—|:])\s+(?:home|latest news|breaking news)$/i,
    '',
  );
  if (sourceName) {
    const escaped = normalizeWhitespace(sourceName).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    title = title.replace(
      new RegExp(`\\s+(?:[-–—|:])\\s+${escaped}$`, 'i'),
      '',
    );
  }
  return title.trim();
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(normalizeWhitespace(value));
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new TypeError(
      'URL must be an absolute HTTP(S) URL without credentials',
    );
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  )
    url.port = '';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function parsePublicationDate(
  value: string | number | Date | undefined,
): string | undefined {
  if (value === undefined || value === '') return undefined;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new TypeError('Publication date is invalid');
  return date.toISOString();
}

export async function stableContentHash(parts: {
  title: string;
  publishedAt?: string;
  content: string;
}): Promise<string> {
  const canonical = [
    normalizeTitle(parts.title).toLocaleLowerCase('en-US'),
    parsePublicationDate(parts.publishedAt) ?? '',
    normalizeWhitespace(parts.content),
  ].join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export type RejectionCode =
  | 'missing-source-identity'
  | 'missing-source-url'
  | 'missing-title'
  | 'empty-content'
  | 'malformed-url'
  | 'invalid-publication-date'
  | 'navigation-page'
  | 'document-too-large'
  | 'duplicate';

export interface ArticleRejection {
  accepted: false;
  code: RejectionCode;
  message: string;
  diagnostic: {
    sourceId?: string;
    url?: string;
    title?: string;
    rawBytes?: number;
  };
}
export interface AcceptedArticle {
  accepted: true;
  article: RawNewsArticle;
  contentHash: string;
}
export type ValidationResult = AcceptedArticle | ArticleRejection;
export interface ValidationOptions {
  seenUrls?: ReadonlySet<string>;
  seenHashes?: ReadonlySet<string>;
  rawDocumentBytes?: number;
}

function reject(
  code: RejectionCode,
  message: string,
  input: Partial<RawNewsArticle>,
  rawBytes?: number,
): ArticleRejection {
  const clip = (text?: string) =>
    text
      ? normalizeWhitespace(text).slice(0, CONTENT_LIMITS.diagnosticCharacters)
      : undefined;
  return {
    accepted: false,
    code,
    message: clip(message)!,
    diagnostic: {
      sourceId: clip(input.sourceId),
      url: clip(input.canonicalUrl ?? input.sourceUrl),
      title: clip(input.title),
      ...(rawBytes === undefined ? {} : { rawBytes }),
    },
  };
}

export async function validateAndNormalizeArticle(
  input: Partial<RawNewsArticle>,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  if (
    options.rawDocumentBytes !== undefined &&
    options.rawDocumentBytes > CONTENT_LIMITS.rawDocumentBytes
  )
    return reject(
      'document-too-large',
      `Raw document exceeds ${CONTENT_LIMITS.rawDocumentBytes} bytes`,
      input,
      options.rawDocumentBytes,
    );
  if (
    !normalizeWhitespace(input.sourceId ?? '') ||
    !normalizeWhitespace(input.sourceName ?? '')
  )
    return reject(
      'missing-source-identity',
      'Source id and name are required',
      input,
    );
  if (!normalizeWhitespace(input.sourceUrl ?? ''))
    return reject('missing-source-url', 'Source URL is required', input);
  let sourceUrl: string, canonicalUrl: string;
  try {
    sourceUrl = canonicalizeUrl(input.sourceUrl!);
    canonicalUrl = canonicalizeUrl(input.canonicalUrl ?? '');
  } catch {
    return reject(
      'malformed-url',
      'Source and article URLs must be absolute HTTP(S) URLs',
      input,
    );
  }
  const title = normalizeTitle(input.title ?? '', input.sourceName);
  if (!title)
    return reject('missing-title', 'Article title is required', input);
  let publishedAt: string | undefined;
  try {
    publishedAt = parsePublicationDate(input.publishedAt);
  } catch {
    return reject(
      'invalid-publication-date',
      'Publication date could not be parsed',
      input,
    );
  }
  const summary = input.summary
    ? normalizeWhitespace(stripHtml(removeCommonChrome(input.summary))).slice(
        0,
        CONTENT_LIMITS.descriptionCharacters,
      )
    : undefined;
  const content = input.content
    ? normalizeWhitespace(stripHtml(removeCommonChrome(input.content))).slice(
        0,
        CONTENT_LIMITS.contentCharacters,
      )
    : undefined;
  const usable = content || summary;
  if (!usable)
    return reject(
      'empty-content',
      'A usable description or article body is required',
      input,
    );
  const words = usable.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const navigationWords = words.filter((word) =>
    /^(home|menu|news|sports|business|contact|about|subscribe|login)$/.test(
      word,
    ),
  ).length;
  if (
    /^(home|latest news|news|menu|sitemap|archive)$/i.test(title) ||
    (words.length < 30 && navigationWords >= 3)
  )
    return reject(
      'navigation-page',
      'Content appears to be an index or navigation page',
      input,
    );
  const article: RawNewsArticle = {
    ...input,
    sourceId: normalizeWhitespace(input.sourceId!),
    sourceName: normalizeWhitespace(input.sourceName!),
    sourceUrl,
    canonicalUrl,
    title: title.slice(0, CONTENT_LIMITS.titleCharacters),
    language: normalizeWhitespace(input.language ?? ''),
    fetchedAt:
      parsePublicationDate(input.fetchedAt) ?? new Date().toISOString(),
    ...(summary ? { summary } : {}),
    ...(content ? { content } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
  const contentHash = await stableContentHash({
    title: article.title,
    publishedAt,
    content: usable,
  });
  if (
    options.seenUrls?.has(canonicalUrl) ||
    options.seenHashes?.has(contentHash)
  )
    return reject(
      'duplicate',
      'Article URL or normalized content was already seen',
      article,
    );
  return { accepted: true, article, contentHash };
}
