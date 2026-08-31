import type { Category } from './content';

export const IMAGE_REUSE_RIGHTS = [
  'publisher-permission',
  'licensed',
  'editorial-owned',
  'project-owned',
] as const;

export type ImageReuseRight = (typeof IMAGE_REUSE_RIGHTS)[number];

interface ProvenanceBase {
  rights: ImageReuseRight;
  /** ISO-8601 time at which the right/source was recorded. */
  recordedAt: string;
  attribution?: string;
  licenseUrl?: string;
  expiresAt?: string;
}

/** Media published by a feed/publisher whose reuse has been explicitly approved. */
export interface PermittedSourceImageProvenance extends ProvenanceBase {
  kind: 'permitted-source';
  rights: 'publisher-permission';
  sourceId: string;
  sourceUrl: string;
  originalUrl: string;
}

export interface LicensedImageProvenance extends ProvenanceBase {
  kind: 'licensed-asset';
  rights: 'licensed';
  provider: string;
  assetId: string;
  originalUrl: string;
  licenseName: string;
}

export interface EditorialUploadImageProvenance extends ProvenanceBase {
  kind: 'editorial-upload';
  rights: 'editorial-owned' | 'licensed';
  uploadedBy: string;
  uploadId: string;
}

export interface CategoryFallbackImageProvenance extends ProvenanceBase {
  kind: 'category-fallback';
  rights: 'project-owned';
  category: Category;
  artworkVersion: string;
}

export type ImageProvenance =
  | PermittedSourceImageProvenance
  | LicensedImageProvenance
  | EditorialUploadImageProvenance
  | CategoryFallbackImageProvenance;

export interface ArticleImage {
  articleUrl: string;
  thumbnailUrl: string;
  provenance: ImageProvenance;
  isFallback: boolean;
}
