import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import type {
  AudioDriver,
  DriverProgress,
  PlaybackItem,
  PlaybackRate,
} from './types.ts';

export class ExpoAudioDriver implements AudioDriver {
  private readonly player: AudioPlayer = createAudioPlayer(null, {
    updateInterval: 500,
  });
  private listener: ((progress: DriverProgress) => void) | null = null;
  private statusSubscription: { remove(): void } | null = null;

  async load(item: PlaybackItem, generation: number) {
    this.statusSubscription?.remove();
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    this.player.replace({ uri: item.uri, name: item.title });
    // Expo Audio maps the active player to MediaSession/Now Playing. Native
    // headset, Bluetooth, lock-screen, notification, interruption, and route
    // events consequently flow back through playbackStatusUpdate below.
    this.player.setActiveForLockScreen(true, {
      title: item.title,
      artist: item.artist,
      artworkUrl: item.artworkUri,
    });
    this.statusSubscription = this.player.addListener(
      'playbackStatusUpdate',
      (status) => {
        this.listener?.({
          generation,
          position: status.currentTime,
          duration: status.duration,
          playing: status.playing,
          available: status.playbackState !== 'error',
          buffering: status.playbackState === 'loading',
          ended: status.didJustFinish,
        });
      },
    );
    return { duration: this.player.duration };
  }

  play() {
    this.player.play();
  }
  pause() {
    this.player.pause();
  }
  seek(position: number) {
    return this.player.seekTo(position);
  }
  setRate(rate: PlaybackRate) {
    this.player.playbackRate = rate;
  }
  subscribe(listener: (progress: DriverProgress) => void) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }
  dispose() {
    this.statusSubscription?.remove();
    this.player.setActiveForLockScreen(false);
    this.player.remove();
  }
}
