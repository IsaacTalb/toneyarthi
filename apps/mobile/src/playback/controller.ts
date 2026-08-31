import {
  initialPlaybackState,
  PLAYBACK_RATES,
  type AudioDriver,
  type DriverProgress,
  type PlaybackItem,
  type PlaybackRate,
  type PlaybackState,
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

  constructor(driver: AudioDriver) {
    this.driver = driver;
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
  }

  async load(item: PlaybackItem) {
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
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.update({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Audio is unavailable',
      });
    }
  }

  async play() {
    if (!this.state.item || !['ready', 'playing'].includes(this.state.phase))
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
    if (this.state.phase !== 'playing') return;
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
    if (
      progress.generation !== this.generation ||
      this.state.phase === 'loading'
    )
      return;
    if (!progress.available) {
      this.update({ phase: 'error', error: 'Audio is unavailable' });
      return;
    }
    const duration = Math.max(progress.duration || this.state.duration, 0);
    this.update({
      duration,
      position: clampPosition(progress.position, duration),
      phase: progress.ended ? 'ready' : progress.playing ? 'playing' : 'ready',
      error: null,
    });
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.unsubscribe();
    this.listeners.clear();
    await this.driver.dispose();
  }
}
