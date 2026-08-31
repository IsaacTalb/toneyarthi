export interface DownloadRecord {
  id: string;
  title: string;
  remoteUri: string;
  localUri: string;
  size: number;
  downloadedAt: string;
}

export interface DownloadRequest {
  id: string;
  title: string;
  remoteUri: string;
  expectedSize?: number;
}

export interface DownloadFileSystem {
  ensureDirectory(): Promise<void>;
  download(
    remoteUri: string,
    temporaryUri: string,
  ): Promise<{
    status: number;
    size: number;
    expectedSize?: number;
  }>;
  exists(uri: string): Promise<boolean>;
  list(): Promise<string[]>;
  move(from: string, to: string): Promise<void>;
  remove(uri: string): Promise<void>;
  finalUri(id: string): string;
  temporaryUri(id: string): string;
}

export interface DownloadMetadataStore {
  load(): Promise<DownloadRecord[]>;
  save(records: DownloadRecord[]): Promise<void>;
}
