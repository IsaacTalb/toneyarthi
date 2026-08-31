import type {
  BookmarkInput,
  BookmarkRepository,
  BookmarkSnapshot,
  BookmarkStore,
} from './types';

const isString = (value: unknown): value is string => typeof value === 'string';

function validSnapshot(value: unknown): value is BookmarkSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    isString(item.id) &&
    item.id.length > 0 &&
    isString(item.slug) &&
    item.slug.length > 0 &&
    isString(item.title) &&
    item.title.length > 0 &&
    isString(item.category) &&
    isString(item.savedAt) &&
    isString(item.snapshotUpdatedAt) &&
    (item.summary === undefined || isString(item.summary)) &&
    (item.publishedAt === undefined || isString(item.publishedAt)) &&
    (item.imageUrl === undefined || isString(item.imageUrl))
  );
}

/** Storage-independent bookmark repository; suitable for wrapping with cloud sync. */
export class LocalBookmarkRepository implements BookmarkRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly store: BookmarkStore;
  private readonly now: () => Date;

  constructor(store: BookmarkStore, now: () => Date = () => new Date()) {
    this.store = store;
    this.now = now;
  }

  private async read(): Promise<BookmarkSnapshot[]> {
    const value = await this.store.read();
    if (!Array.isArray(value)) return [];
    return value
      .filter(validSnapshot)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  list() {
    return this.run(() => this.read());
  }

  contains(id: string) {
    return this.run(async () =>
      (await this.read()).some((item) => item.id === id),
    );
  }

  save(input: BookmarkInput) {
    return this.run(async () => {
      const records = await this.read();
      const previous = records.find((item) => item.id === input.id);
      const timestamp = this.now().toISOString();
      const bookmark: BookmarkSnapshot = {
        ...input,
        savedAt: previous?.savedAt ?? timestamp,
        snapshotUpdatedAt: timestamp,
      };
      await this.store.write([
        bookmark,
        ...records.filter((item) => item.id !== input.id),
      ]);
      return bookmark;
    });
  }

  remove(id: string) {
    return this.run(async () => {
      const records = await this.read();
      const next = records.filter((item) => item.id !== id);
      if (next.length !== records.length) await this.store.write(next);
    });
  }
}
