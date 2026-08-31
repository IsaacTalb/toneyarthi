import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PLAYBACK_RATES,
  type PlaybackState,
  type PlaybackStore,
} from './types';

const KEY = '@toneyarthi/playback/v1';

export const playbackStore: PlaybackStore = {
  async load() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<PlaybackState>;
      if (
        !value.item ||
        typeof value.item.id !== 'string' ||
        typeof value.item.uri !== 'string' ||
        typeof value.item.title !== 'string' ||
        typeof value.position !== 'number' ||
        !PLAYBACK_RATES.includes(value.rate as never)
      )
        return null;
      const queue = Array.isArray(value.queue) ? value.queue : [value.item];
      const currentIndex =
        typeof value.currentIndex === 'number' &&
        value.currentIndex >= 0 &&
        value.currentIndex < queue.length
          ? value.currentIndex
          : 0;
      return { ...value, queue, currentIndex } as PlaybackState;
    } catch {
      return null;
    }
  },
  async save(state) {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Playback must remain usable when device storage is unavailable/full.
    }
  },
};
