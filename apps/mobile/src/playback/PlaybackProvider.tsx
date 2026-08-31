import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { PlaybackController } from './controller';
import { ExpoAudioDriver } from './expoAudioDriver';
import { playbackStore } from './playbackStore';

const PlaybackContext = createContext<PlaybackController | null>(null);

export function PlaybackProvider({ children }: PropsWithChildren) {
  const [controller] = useState(
    () => new PlaybackController(new ExpoAudioDriver(), playbackStore),
  );
  useEffect(() => {
    void controller.restore();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void controller.persist();
    });
    return () => subscription.remove();
  }, [controller]);
  useEffect(
    () => () => {
      void controller.dispose();
    },
    [controller],
  );
  return (
    <PlaybackContext.Provider value={controller}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const controller = usePlaybackController();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    ...state,
    load: controller.load.bind(controller),
    replaceQueue: controller.replaceQueue.bind(controller),
    playNext: controller.playNext.bind(controller),
    next: controller.next,
    previous: controller.previous,
    play: controller.play.bind(controller),
    pause: controller.pause.bind(controller),
    seek: controller.seek.bind(controller),
    skipBack: () => controller.skip(-15),
    skipForward: () => controller.skip(15),
    setRate: controller.setRate.bind(controller),
  };
}

/**
 * Subscribe to one small, stable slice of playback state. This is preferable
 * for persistent navigation chrome, where position ticks must not invalidate
 * the navigation tree.
 */
export function usePlaybackSelector<T>(
  selector: (state: ReturnType<PlaybackController['getSnapshot']>) => T,
) {
  const controller = usePlaybackController();
  return useSyncExternalStore(
    controller.subscribe,
    () => selector(controller.getSnapshot()),
    () => selector(controller.getSnapshot()),
  );
}

export function usePlaybackController() {
  const controller = useContext(PlaybackContext);
  if (!controller)
    throw new Error('Playback hooks must be used inside PlaybackProvider');
  return controller;
}
