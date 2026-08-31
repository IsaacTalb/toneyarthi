import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { downloadStorage } from './native';
import type { DownloadRecord, DownloadRequest } from './types';

type DownloadsContextValue = {
  records: DownloadRecord[];
  ready: boolean;
  download(request: DownloadRequest): Promise<void>;
  remove(id: string): Promise<void>;
};
const Context = createContext<DownloadsContextValue | null>(null);

export function DownloadsProvider({ children }: PropsWithChildren) {
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void downloadStorage
      .initialize()
      .then(setRecords)
      .finally(() => setReady(true));
  }, []);
  const value = useMemo<DownloadsContextValue>(
    () => ({
      records,
      ready,
      async download(request) {
        await downloadStorage.download(request);
        setRecords(downloadStorage.list());
      },
      async remove(id) {
        await downloadStorage.remove(id);
        setRecords(downloadStorage.list());
      },
    }),
    [ready, records],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDownloads() {
  const value = useContext(Context);
  if (!value)
    throw new Error('useDownloads must be used inside DownloadsProvider');
  return value;
}
