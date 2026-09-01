import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { DATA_POLICIES, imageUrlForPolicy, type DataMode } from './policy';

const STORAGE_KEY = '@toneyarthi/data-mode';

type Value = {
  mode: DataMode;
  policy: (typeof DATA_POLICIES)[DataMode];
  ready: boolean;
  setMode(mode: DataMode): Promise<void>;
};

const Context = createContext<Value | null>(null);

export function DataPolicyProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<DataMode>('standard');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'standard' || stored === 'data-saver')
          setModeState(stored);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<Value>(
    () => ({
      mode,
      policy: DATA_POLICIES[mode],
      ready,
      async setMode(nextMode) {
        setModeState(nextMode);
        await AsyncStorage.setItem(STORAGE_KEY, nextMode);
      },
    }),
    [mode, ready],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDataPolicy() {
  const value = useContext(Context);
  if (!value)
    throw new Error('useDataPolicy must be used inside DataPolicyProvider');
  return value;
}

export function usePolicyImageUrl(uri: string | undefined) {
  const { policy } = useDataPolicy();
  return uri ? imageUrlForPolicy(uri, policy) : undefined;
}
