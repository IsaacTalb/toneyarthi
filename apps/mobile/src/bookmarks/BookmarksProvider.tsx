import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { bookmarkRepository } from './native';
import type { BookmarkInput, BookmarkSnapshot } from './types';
import { analytics } from '../analytics';

interface BookmarksContextValue {
  bookmarks: BookmarkSnapshot[];
  ready: boolean;
  contains(id: string): boolean;
  save(bookmark: BookmarkInput): Promise<void>;
  remove(id: string): Promise<void>;
}

const Context = createContext<BookmarksContextValue | null>(null);

export function BookmarksProvider({ children }: PropsWithChildren) {
  const [bookmarks, setBookmarks] = useState<BookmarkSnapshot[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void bookmarkRepository
      .list()
      .then(setBookmarks)
      .finally(() => setReady(true));
  }, []);
  const save = useCallback(async (bookmark: BookmarkInput) => {
    await bookmarkRepository.save(bookmark);
    setBookmarks(await bookmarkRepository.list());
    analytics.track('save_changed', {
      article_id: bookmark.id,
      action: 'saved',
    });
  }, []);
  const remove = useCallback(async (id: string) => {
    await bookmarkRepository.remove(id);
    setBookmarks(await bookmarkRepository.list());
    analytics.track('save_changed', { article_id: id, action: 'removed' });
  }, []);
  const value = useMemo<BookmarksContextValue>(
    () => ({
      bookmarks,
      ready,
      contains: (id) => bookmarks.some((item) => item.id === id),
      save,
      remove,
    }),
    [bookmarks, ready, remove, save],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBookmarks() {
  const value = useContext(Context);
  if (!value)
    throw new Error('useBookmarks must be used inside BookmarksProvider');
  return value;
}
