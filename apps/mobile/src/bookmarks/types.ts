export interface BookmarkSnapshot {
  /** Stable backend identity used for deduplication and future synchronization. */
  id: string;
  /** Route/API identifier retained even when the snapshot is rendered offline. */
  slug: string;
  title: string;
  summary?: string;
  category: string;
  publishedAt?: string;
  imageUrl?: string;
  savedAt: string;
  snapshotUpdatedAt: string;
}

export type BookmarkInput = Omit<
  BookmarkSnapshot,
  'savedAt' | 'snapshotUpdatedAt'
>;

export interface BookmarkStore {
  read(): Promise<unknown>;
  write(value: BookmarkSnapshot[]): Promise<void>;
}

export interface BookmarkRepository {
  save(bookmark: BookmarkInput): Promise<BookmarkSnapshot>;
  remove(id: string): Promise<void>;
  contains(id: string): Promise<boolean>;
  list(): Promise<BookmarkSnapshot[]>;
}
