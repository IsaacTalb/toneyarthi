import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { DownloadStorage } from './storage';
import type { DownloadFileSystem, DownloadMetadataStore } from './types';

const directory = `${FileSystem.documentDirectory}downloads/`;
const encodeId = (id: string) => encodeURIComponent(id).replaceAll('%', '_');

const files: DownloadFileSystem = {
  ensureDirectory: () =>
    FileSystem.makeDirectoryAsync(directory, { intermediates: true }),
  async download(remoteUri, temporaryUri) {
    const response = await FileSystem.downloadAsync(remoteUri, temporaryUri);
    const info = await FileSystem.getInfoAsync(temporaryUri);
    const contentLength = Number(response.headers?.['content-length']);
    return {
      status: response.status,
      size: info.exists && 'size' in info ? info.size : 0,
      expectedSize: Number.isFinite(contentLength) ? contentLength : undefined,
    };
  },
  async exists(uri) {
    return (await FileSystem.getInfoAsync(uri)).exists;
  },
  async list() {
    return (await FileSystem.readDirectoryAsync(directory)).map(
      (name) => `${directory}${name}`,
    );
  },
  move: (from, to) => FileSystem.moveAsync({ from, to }),
  remove: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
  finalUri: (id) => `${directory}${encodeId(id)}.audio`,
  temporaryUri: (id) => `${directory}${encodeId(id)}.partial`,
};

const metadata: DownloadMetadataStore = {
  async load() {
    const value = await AsyncStorage.getItem('@toneyarthi/downloads/v1');
    return value ? JSON.parse(value) : [];
  },
  save: (records) =>
    AsyncStorage.setItem('@toneyarthi/downloads/v1', JSON.stringify(records)),
};

export const downloadStorage = new DownloadStorage(files, metadata);
