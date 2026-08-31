import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalBookmarkRepository } from './repository';

const STORAGE_KEY = '@toneyarthi/bookmarks/v1';

export const bookmarkRepository = new LocalBookmarkRepository({
  async read() {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  },
  write: (value) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
});
