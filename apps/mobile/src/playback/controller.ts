import {
  initialPlaybackState,
  PLAYBACK_RATES,
  type AudioDriver,
  type DriverProgress,
  type PlaybackItem,
  type PlaybackRate,
  type PlaybackState,
  type PlaybackStore,
} from './types.ts';

export const clampPosition = (position: number, duration: number) =>
  Math.min(
    Math.max(Number.isFinite(position) ? position : 0, 0),
    Math.max(duration, 0),
  );

export class PlaybackController {
  private readonly driver: AudioDriver;
  private state: PlaybackState = initialPlaybackState;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private unsubscribe: () => void;
  private readonly store?: PlaybackStore;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(driver: AudioDriver, store?: PlaybackStore) {
    this.driver = driver;
    this.store = store;
    this.unsubscribe = driver.subscribe((progress) =>
      this.onProgress(progress),
    );
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<PlaybackState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
    this.scheduleSave();
  }

  private scheduleSave() {
    if (!this.store || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.store?.save(this.state);
    }, 5_000);
  }

  async restore() {
    const saved = await this.store?.load();
    if (!saved?.item || this.disposed || this.state.item) return;
    const position = saved.position;
    this.update({ rate: saved.rate });
    await this.replaceQueue(saved.queue, saved.currentIndex, false);
    await this.seek(position);
  }

  async persist() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.store?.save(this.state);
  }

  async load(item: PlaybackItem) {
    await this.replaceQueue([item], 0, false);
  }

  private async loadCurrent(autoplay: boolean) {
    const item = this.state.queue[this.state.currentIndex];
    if (!item) return;
    const generation = ++this.generation;
    this.update({
      phase: 'loading',
      item,
      position: 0,
      duration: 0,
      error: null,
    });
    try {
      const loaded = await this.driver.load(item, generation);
      if (this.disposed || generation !== this.generation) return;
      await this.driver.setRate(this.state.rate);
      this.update({
        phase: 'ready',
        duration: Math.max(loaded.duration || 0, 0),
      });
      if (autoplay) await this.play();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.update({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Audio is unavailable',
      });
      // A broken entry must not strand a playlist. Continue until a playable
      // item is found (or the ordered queue is exhausted).
      if (this.state.currentIndex < this.state.queue.length - 1)
        await this.moveTo(this.state.currentIndex + 1, autoplay);
    }
  }

  async replaceQueue(items: PlaybackItem[], startIndex = 0, autoplay = true) {
    const seen = new Set<string>();
    const queue = items.filter(
      (item) =>
        Boolean(item.id && item.uri) &&
        !seen.has(item.id) &&
        Boolean(seen.add(item.id)),
    );
    if (!queue.length) {
      this.generation++;
      this.update({ ...initialPlaybackState, rate: this.state.rate });
      return;
    }
    const currentIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
    this.update({ queue, currentIndex });
    await this.loadCurrent(autoplay);
  }

  playNext(item: PlaybackItem) {
    if (
      !item.id ||
      !item.uri ||
      this.state.queue.some((entry) => entry.id === item.id)
    )
      return false;
    const index = Math.max(this.state.currentIndex + 1, 0);
    const queue = [...this.state.queue];
    queue.splice(index, 0, item);
    this.update({ queue });
    return true;
  }

  private async moveTo(index: number, autoplay = true) {
    if (index < 0 || index >= this.state.queue.length) return false;
    this.update({ currentIndex: index });
    await this.loadCurrent(autoplay);
    return true;
  }

  next = () => this.moveTo(this.state.currentIndex + 1);
  previous = () => this.moveTo(this.state.currentIndex - 1);

  async play() {
    if (
      !this.state.item ||
      !['ready', 'playing', 'buffering'].includes(this.state.phase)
    )
      return;
    const generation = this.generation;
    try {
      await this.driver.play();
      if (generation !== this.generation) return;
      this.update({ phase: 'playing', error: null });
    } catch (error) {
      this.update({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Audio is unavailable',
      });
    }
  }

  async pause() {
    if (!['playing', 'buffering'].includes(this.state.phase)) return;
    const generation = this.generation;
    await this.driver.pause();
    if (generation !== this.generation) return;
    this.update({ phase: 'ready' });
  }

  async seek(position: number) {
    if (!this.state.item || this.state.phase === 'loading') return;
    const generation = this.generation;
    const bounded = clampPosition(position, this.state.duration);
    await this.driver.seek(bounded);
    if (generation !== this.generation) return;
    this.update({ position: bounded });
  }

  skip = (seconds: number) => this.seek(this.state.position + seconds);

  async setRate(rate: PlaybackRate) {
    if (!PLAYBACK_RATES.includes(rate)) return;
    if (this.state.item && this.state.phase !== 'loading')
      await this.driver.setRate(rate);
    this.update({ rate });
  }

  private onProgress(progress: DriverProgress) {
    if (progress.generation !== this.generation) return;
    if (!progress.available) {
      this.update({ phase: 'error', error: 'Audio is unavailable' });
      if (this.state.currentIndex < this.state.queue.length - 1)
        void this.moveTo(this.state.currentIndex + 1);
      return;
    }
    if (this.state.phase === 'loading') return;
    const duration = Math.max(progress.duration || this.state.duration, 0);
    this.update({
      duration,
      position: clampPosition(progress.position, duration),
      phase: progress.ended
        ? 'ready'
        : progress.buffering
          ? 'buffering'
          : progress.playing
            ? 'playing'
            : 'ready',
      error: null,
    });
    if (progress.ended) void this.next();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.unsubscribe();
    this.listeners.clear();
    await this.persist();
    await this.driver.dispose();
  }
}
