import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'recent-searches-v1';
export const MAX_RECENT_SEARCHES = 6;
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 100;

export function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function addRecentSearch(items: string[], value: string): string[] {
  const normalized = normalizeSearch(value);
  if (!normalized) return items;
  return [
    normalized,
    ...items.filter(
      (item) =>
        normalizeSearch(item).toLocaleLowerCase() !==
        normalized.toLocaleLowerCase(),
    ),
  ].slice(0, MAX_RECENT_SEARCHES);
}

export async function loadRecentSearches(): Promise<string[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === 'string')
          .slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

export async function saveRecentSearches(items: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
