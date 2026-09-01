export type DataMode = 'standard' | 'data-saver';

export type DataPolicy = {
  mode: DataMode;
  image: { maxWidth?: number; quality?: number };
  prefetch: { images: boolean; queries: boolean };
  downloads: { automaticAudio: boolean };
  queries: {
    retry: number;
    refetchOnReconnect: boolean;
    refetchOnWindowFocus: boolean;
    staleTimeMultiplier: number;
  };
};

export const DATA_POLICIES: Record<DataMode, DataPolicy> = {
  standard: {
    mode: 'standard',
    image: {},
    prefetch: { images: true, queries: true },
    downloads: { automaticAudio: true },
    queries: {
      retry: 2,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTimeMultiplier: 1,
    },
  },
  'data-saver': {
    mode: 'data-saver',
    image: { maxWidth: 640, quality: 65 },
    prefetch: { images: false, queries: false },
    downloads: { automaticAudio: false },
    queries: {
      retry: 0,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      staleTimeMultiplier: 4,
    },
  },
};

/** Adds conventional image transformation hints while preserving existing parameters. */
export function imageUrlForPolicy(uri: string, policy: DataPolicy): string {
  if (!policy.image.maxWidth) return uri;
  try {
    const url = new URL(uri);
    url.searchParams.set('width', String(policy.image.maxWidth));
    if (policy.image.quality)
      url.searchParams.set('quality', String(policy.image.quality));
    return url.toString();
  } catch {
    return uri;
  }
}
