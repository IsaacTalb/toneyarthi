import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlaybackController,
  clampPosition,
} from '../src/playback/controller.ts';
import type {
  AudioDriver,
  DriverProgress,
  PlaybackItem,
  PlaybackRate,
  PlaybackState,
  PlaybackStore,
} from '../src/playback/types.ts';

const item = (id: string): PlaybackItem => ({
  id,
  uri: `https://audio.test/${id}.mp3`,
  title: id,
});

class Driver implements AudioDriver {
  listener?: (progress: DriverProgress) => void;
  loads: Array<{
    generation: number;
    resolve: (value: { duration: number }) => void;
  }> = [];
  seeks: number[] = [];
  rates: PlaybackRate[] = [];
  load(_item: PlaybackItem, generation: number) {
    return new Promise<{ duration: number }>((resolve) =>
      this.loads.push({ generation, resolve }),
    );
  }
  play() {}
  pause() {}
  seek(position: number) {
    this.seeks.push(position);
  }
  setRate(rate: PlaybackRate) {
    this.rates.push(rate);
  }
  subscribe(listener: (progress: DriverProgress) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  dispose() {}
}

class Store implements PlaybackStore {
  saved: PlaybackState[] = [];
  private readonly restored: PlaybackState | null;
  constructor(restored: PlaybackState | null) {
    this.restored = restored;
  }
  async load() {
    return this.restored;
  }
  async save(state: PlaybackState) {
    this.saved.push(state);
  }
}

test('newer loads win and stale progress is ignored', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const first = controller.load(item('first'));
  const second = controller.load(item('second'));
  driver.loads[1]!.resolve({ duration: 120 });
  await second;
  driver.loads[0]!.resolve({ duration: 999 });
  await first;
  driver.listener?.({
    generation: driver.loads[0]!.generation,
    position: 50,
    duration: 999,
    playing: true,
    available: true,
  });
  assert.equal(controller.getSnapshot().item?.id, 'second');
  assert.equal(controller.getSnapshot().duration, 120);
  assert.equal(controller.getSnapshot().position, 0);
});

test('transitions between ready, playing, paused, and unavailable', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const loading = controller.load(item('story'));
  driver.loads[0]!.resolve({ duration: 60 });
  await loading;
  await controller.play();
  assert.equal(controller.getSnapshot().phase, 'playing');
  driver.listener?.({
    generation: driver.loads[0]!.generation,
    position: 1,
    duration: 60,
    playing: true,
    available: true,
    buffering: true,
  });
  assert.equal(controller.getSnapshot().phase, 'buffering');
  await controller.pause();
  assert.equal(controller.getSnapshot().phase, 'ready');
  driver.listener?.({
    generation: driver.loads[0]!.generation,
    position: 1,
    duration: 60,
    playing: false,
    available: false,
  });
  assert.equal(controller.getSnapshot().phase, 'error');
});

test('seek and 15-second skips stay within media bounds', async () => {
  assert.equal(clampPosition(Number.NaN, 10), 0);
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const loading = controller.load(item('story'));
  driver.loads[0]!.resolve({ duration: 100 });
  await loading;
  await controller.seek(5);
  await controller.skip(-15);
  await controller.seek(95);
  await controller.skip(15);
  assert.deepEqual(driver.seeks, [5, 0, 95, 100]);
});

test('only supported rates are applied and the choice survives a load', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  await controller.setRate(1.5);
  const loading = controller.load(item('story'));
  driver.loads[0]!.resolve({ duration: 10 });
  await loading;
  assert.equal(controller.getSnapshot().rate, 1.5);
  assert.deepEqual(driver.rates, [1.5]);
});

test('restores item, rate, and position without autoplay', async () => {
  const driver = new Driver();
  const store = new Store({
    phase: 'playing',
    item: item('story'),
    position: 25,
    duration: 60,
    rate: 1.5,
    error: null,
    queue: [item('story')],
    currentIndex: 0,
  });
  const controller = new PlaybackController(driver, store);
  const restoring = controller.restore();
  await Promise.resolve();
  driver.loads[0]!.resolve({ duration: 60 });
  await restoring;
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().rate, 1.5);
  assert.deepEqual(driver.seeks, [25]);
});

test('queue navigation observes both boundaries', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const replacing = controller.replaceQueue(
    [item('one'), item('two')],
    0,
    false,
  );
  driver.loads[0]!.resolve({ duration: 10 });
  await replacing;
  assert.equal(await controller.previous(), false);
  const advancing = controller.next();
  driver.loads[1]!.resolve({ duration: 10 });
  assert.equal(await advancing, true);
  assert.equal(controller.getSnapshot().currentIndex, 1);
  assert.equal(await controller.next(), false);
});

test('play-next is ordered and refuses duplicate IDs', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const replacing = controller.replaceQueue(
    [item('one'), item('three')],
    0,
    false,
  );
  driver.loads[0]!.resolve({ duration: 10 });
  await replacing;
  assert.equal(controller.playNext(item('two')), true);
  assert.equal(controller.playNext(item('two')), false);
  assert.deepEqual(
    controller.getSnapshot().queue.map(({ id }) => id),
    ['one', 'two', 'three'],
  );
});

test('an ended item advances automatically and skips an unavailable item', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const replacing = controller.replaceQueue(
    [item('one'), item('two'), item('three')],
    0,
    false,
  );
  driver.loads[0]!.resolve({ duration: 10 });
  await replacing;
  driver.listener?.({
    generation: driver.loads[0]!.generation,
    position: 10,
    duration: 10,
    playing: false,
    available: true,
    ended: true,
  });
  await Promise.resolve();
  assert.equal(controller.getSnapshot().item?.id, 'two');
  // Rejecting the middle load automatically attempts the final entry.
  const failed = driver.loads[1]!;
  // Driver test promises only expose resolve; simulate unavailability via progress.
  driver.listener?.({
    generation: failed.generation,
    position: 0,
    duration: 0,
    playing: false,
    available: false,
  });
  await Promise.resolve();
  assert.equal(controller.getSnapshot().item?.id, 'three');
});

test('normalizes queue input and clamps an invalid starting index', async () => {
  const driver = new Driver();
  const controller = new PlaybackController(driver);
  const loading = controller.replaceQueue(
    [item('one'), item('one'), { ...item('bad'), uri: '' }, item('two')],
    99,
    false,
  );
  driver.loads[0]!.resolve({ duration: 30 });
  await loading;
  assert.deepEqual(
    controller.getSnapshot().queue.map(({ id }) => id),
    ['one', 'two'],
  );
  assert.equal(controller.getSnapshot().currentIndex, 1);
  assert.equal(controller.getSnapshot().item?.id, 'two');
});

test('surfaces driver load errors and continues to the next queue item', async () => {
  class RejectingDriver extends Driver {
    override load(value: PlaybackItem, generation: number) {
      if (value.id === 'broken')
        return Promise.reject(new Error('decode failed'));
      return super.load(value, generation);
    }
  }
  const driver = new RejectingDriver();
  const controller = new PlaybackController(driver);
  const replacing = controller.replaceQueue(
    [item('broken'), item('working')],
    0,
    false,
  );
  await Promise.resolve();
  driver.loads[0]!.resolve({ duration: 20 });
  await replacing;
  assert.equal(controller.getSnapshot().item?.id, 'working');
  assert.equal(controller.getSnapshot().phase, 'ready');
});
