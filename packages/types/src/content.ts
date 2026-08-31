/** A publisher or feed from which articles are ingested. */
export interface NewsSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  language: string;
  isActive: boolean;
}

/** The unmodified article fields supplied by a news source. */
export interface RawNewsArticle {
  sourceId: NewsSource['id'];
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  language: string;
  content?: string;
  summary?: string;
  author?: string;
  imageUrl?: string;
  publishedAt?: string;
  fetchedAt: string;
}

/** A normalized article awaiting editorial or automated processing. */
export interface ArticleCandidate extends RawNewsArticle {
  id: string;
  category: Category;
  canonicalUrl: string;
  language: string;
}

/** Provenance shown with a published article. */
export interface ArticleSource {
  id: NewsSource['id'];
  name: string;
  url: string;
  articleUrl: string;
}

/** Metadata for an article's generated audio rendition. */
export interface AudioMetadata {
  url: string;
  durationSeconds: number;
  mimeType: string;
  /** Container-independent codec name, for example `opus` or `mp3`. */
  codec: string;
  /** Average encoded bitrate. PCM assets use their exact sample bitrate. */
  bitrateBps: number;
  sizeBytes: number;
  channels: number;
  sampleRateHz: number;
  sizeWarning?: 'over_target';
  generatedAt: string;
}

/** A processed article suitable for API and application consumers. */
export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: Category;
  language: string;
  imageUrl?: string;
  source: ArticleSource;
  audio?: AudioMetadata;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** A group of articles reporting on the same story. */
export interface StoryCluster {
  id: string;
  title: string;
  category: Category;
  articles: Article[];
  createdAt: string;
  updatedAt: string;
}

/** An ordered collection prepared for continuous listening. */
export interface Playlist {
  id: string;
  title: string;
  description?: string;
  articleIds: Article['id'][];
  createdAt: string;
  updatedAt: string;
}

export const CATEGORIES = {
  local: { key: 'local', displayName: 'Local', displayNameMy: 'ပြည်တွင်း' },
  world: { key: 'world', displayName: 'World', displayNameMy: 'နိုင်ငံတကာ' },
  politics: {
    key: 'politics',
    displayName: 'Politics',
    displayNameMy: 'နိုင်ငံရေး',
  },
  business: {
    key: 'business',
    displayName: 'Business',
    displayNameMy: 'စီးပွားရေး',
  },
  technology: {
    key: 'technology',
    displayName: 'Technology',
    displayNameMy: 'နည်းပညာ',
  },
  health: { key: 'health', displayName: 'Health', displayNameMy: 'ကျန်းမာရေး' },
  science: { key: 'science', displayName: 'Science', displayNameMy: 'သိပ္ပံ' },
  sports: { key: 'sports', displayName: 'Sports', displayNameMy: 'အားကစား' },
  entertainment: {
    key: 'entertainment',
    displayName: 'Entertainment',
    displayNameMy: 'ဖျော်ဖြေရေး',
  },
} as const;

/** A stable English category key. */
export type Category = keyof typeof CATEGORIES;

export type CategoryRecord = (typeof CATEGORIES)[Category];
