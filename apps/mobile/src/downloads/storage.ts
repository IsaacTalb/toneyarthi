import type {
  DownloadFileSystem,
  DownloadMetadataStore,
  DownloadRecord,
  DownloadRequest,
} from './types';

const safeRemove = async (files: DownloadFileSystem, uri: string) => {
  if (await files.exists(uri)) await files.remove(uri);
};

/** Owns the lifecycle of app-controlled files and their persisted index. */
export class DownloadStorage {
  private records: DownloadRecord[] = [];
  private readonly files: DownloadFileSystem;
  private readonly metadata: DownloadMetadataStore;

  constructor(files: DownloadFileSystem, metadata: DownloadMetadataStore) {
    this.files = files;
    this.metadata = metadata;
  }

  async initialize(): Promise<DownloadRecord[]> {
    await this.files.ensureDirectory();
    for (const uri of await this.files.list()) {
      if (uri.endsWith('.partial')) await safeRemove(this.files, uri);
    }
    const stored = await this.metadata.load();
    this.records = [];
    for (const record of stored) {
      if (await this.files.exists(record.localUri)) this.records.push(record);
    }
    if (this.records.length !== stored.length)
      await this.metadata.save(this.records);
    return this.list();
  }

  list() {
    return [...this.records];
  }

  async verifiedUri(id: string): Promise<string | undefined> {
    const record = this.records.find((entry) => entry.id === id);
    if (!record) return undefined;
    if (await this.files.exists(record.localUri)) return record.localUri;
    this.records = this.records.filter((entry) => entry.id !== id);
    await this.metadata.save(this.records);
    return undefined;
  }

  async download(request: DownloadRequest): Promise<DownloadRecord> {
    const previousRecords = this.records;
    const temporaryUri = this.files.temporaryUri(request.id);
    const finalUri = this.files.finalUri(request.id);
    await safeRemove(this.files, temporaryUri);
    try {
      const result = await this.files.download(request.remoteUri, temporaryUri);
      if (result.status < 200 || result.status >= 300)
        throw new Error(`Download failed with HTTP ${result.status}`);
      const expected = request.expectedSize ?? result.expectedSize;
      if (expected !== undefined && result.size !== expected)
        throw new Error(`Expected ${expected} bytes, received ${result.size}`);
      if (!(await this.files.exists(temporaryUri)))
        throw new Error('Downloaded file is missing');
      await safeRemove(this.files, finalUri);
      await this.files.move(temporaryUri, finalUri);
      if (!(await this.files.exists(finalUri)))
        throw new Error('Promoted file is missing');
      const record: DownloadRecord = {
        id: request.id,
        title: request.title,
        remoteUri: request.remoteUri,
        localUri: finalUri,
        size: result.size,
        downloadedAt: new Date().toISOString(),
      };
      const nextRecords = [
        record,
        ...this.records.filter((item) => item.id !== request.id),
      ];
      await this.metadata.save(nextRecords);
      this.records = nextRecords;
      return record;
    } catch (error) {
      this.records = previousRecords;
      await safeRemove(this.files, temporaryUri);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const record = this.records.find((entry) => entry.id === id);
    if (record) await safeRemove(this.files, record.localUri);
    await safeRemove(this.files, this.files.temporaryUri(id));
    this.records = this.records.filter((entry) => entry.id !== id);
    await this.metadata.save(this.records);
  }
}
