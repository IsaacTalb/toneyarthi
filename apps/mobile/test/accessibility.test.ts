import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackAnnouncement } from '../src/accessibility/playbackAnnouncements.ts';
import type { PlaybackState } from '../src/playback/types.ts';

const state = (overrides: Partial<PlaybackState> = {}): PlaybackState => ({
  item: null,
  queue: [],
  currentIndex: -1,
  phase: 'idle',
  position: 0,
  duration: 0,
  rate: 1,
  error: null,
  ...overrides,
});

test('announces meaningful playback changes but not position ticks', () => {
  assert.equal(playbackAnnouncement(state(), state({ position: 1 })), null);
  assert.equal(
    playbackAnnouncement(
      state({ phase: 'ready' }),
      state({ phase: 'playing' }),
    ),
    'အသံ စတင်ဖွင့်နေသည်',
  );
});

test('announces playback errors before phase changes', () => {
  assert.equal(
    playbackAnnouncement(state(), state({ phase: 'error', error: 'ကွန်ရက်' })),
    'အသံဖွင့်၍ မရပါ။ ကွန်ရက်',
  );
});
