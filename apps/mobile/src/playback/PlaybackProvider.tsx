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
  const controller = useContext(PlaybackContext);
  if (!controller)
    throw new Error('usePlayback must be used inside PlaybackProvider');
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    ...state,
    load: controller.load.bind(controller),
    play: controller.play.bind(controller),
    pause: controller.pause.bind(controller),
    seek: controller.seek.bind(controller),
    skipBack: () => controller.skip(-15),
    skipForward: () => controller.skip(15),
    setRate: controller.setRate.bind(controller),
  };
}
