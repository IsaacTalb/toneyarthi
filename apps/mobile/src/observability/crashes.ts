import Constants from 'expo-constants';
import { Platform } from 'react-native';

const endpoint = `${process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8787'}/v1/telemetry/crashes`;
const environment = process.env.EXPO_PUBLIC_APP_ENVIRONMENT ?? 'development';
const release = Constants.expoConfig?.version ?? 'unknown';

export async function captureCrash(
  error: unknown,
  fatal: boolean,
): Promise<void> {
  const failure =
    error instanceof Error ? error : new Error('Unknown mobile error');
  // Never transmit messages, stacks, screen state, user data, or article content.
  const payload = JSON.stringify({
    platform: Platform.OS,
    fatal,
    errorName: failure.name.slice(0, 80),
    environment,
    release,
  });
  if (payload.length > 1024) return;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  }).catch(() => undefined);
}

export function installCrashHandler(): void {
  const errorUtils = (
    globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler(): (error: Error, fatal?: boolean) => void;
        setGlobalHandler(
          handler: (error: Error, fatal?: boolean) => void,
        ): void;
      };
    }
  ).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, fatal) => {
    void captureCrash(error, fatal === true);
    previous(error, fatal);
  });
}
