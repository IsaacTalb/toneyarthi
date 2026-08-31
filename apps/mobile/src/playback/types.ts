export const PLAYBACK_RATES = [0.8, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface PlaybackItem {
  id: string;
  uri: string;
  title: string;
  artist?: string;
  artworkUri?: string;
}

export type PlaybackPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

export interface PlaybackState {
  phase: PlaybackPhase;
  item: PlaybackItem | null;
  position: number;
  duration: number;
  rate: PlaybackRate;
  error: string | null;
}

export interface DriverProgress {
  generation: number;
  position: number;
  duration: number;
  playing: boolean;
  available: boolean;
  ended?: boolean;
}

export interface AudioDriver {
  load(item: PlaybackItem, generation: number): Promise<{ duration: number }>;
  play(): Promise<void> | void;
  pause(): Promise<void> | void;
  seek(position: number): Promise<void> | void;
  setRate(rate: PlaybackRate): Promise<void> | void;
  subscribe(listener: (progress: DriverProgress) => void): () => void;
  dispose(): Promise<void> | void;
}

export interface PlaybackStore {
  load(): Promise<PlaybackState | null>;
  save(state: PlaybackState): Promise<void>;
}

export const initialPlaybackState: PlaybackState = {
  phase: 'idle',
  item: null,
  position: 0,
  duration: 0,
  rate: 1,
  error: null,
};
