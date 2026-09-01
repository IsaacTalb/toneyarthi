import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { PersistentPlayerHost } from '../src/components';
import { shouldRetry } from '../src/api/client';
import { ThemeProvider, lightTheme } from '../src/theme';
import { PlaybackProvider } from '../src/playback';
import { DownloadsProvider } from '../src/downloads';
import { BookmarksProvider } from '../src/bookmarks';
import { NotificationsProvider } from '../src/notifications';
import { DataPolicyProvider, useDataPolicy } from '../src/dataPolicy';

function QueryPolicy({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { policy, ready } = useDataPolicy();
  queryClient.setDefaultOptions({
    queries: {
      retry: policy.queries.retry,
      staleTime: 60_000 * policy.queries.staleTimeMultiplier,
      refetchOnReconnect: policy.queries.refetchOnReconnect,
      refetchOnWindowFocus: policy.queries.refetchOnWindowFocus,
    },
  });
  if (!ready) return null;
  return children;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetry,
            staleTime: 60_000,
          },
        },
      }),
  );
  return (
    <DataPolicyProvider>
      <QueryClientProvider client={queryClient}>
        <QueryPolicy>
          <SafeAreaProvider>
            <ThemeProvider>
              <NotificationsProvider>
                <BookmarksProvider>
                  <DownloadsProvider>
                    <PlaybackProvider>
                      <StatusBar style="dark" />
                      <Stack
                        screenOptions={{
                          contentStyle: {
                            backgroundColor: lightTheme.colors.canvas,
                          },
                          headerBackButtonDisplayMode: 'minimal',
                          headerShadowVisible: false,
                        }}
                      >
                        <Stack.Screen
                          name="index"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="(tabs)"
                          options={{ headerShown: false }}
                        />
                        <Stack.Screen
                          name="article/[slug]"
                          options={{ title: 'Article' }}
                        />
                        <Stack.Screen
                          name="search"
                          options={{ title: 'Search' }}
                        />
                        <Stack.Screen
                          name="settings"
                          options={{ title: 'Settings' }}
                        />
                        <Stack.Screen
                          name="downloads"
                          options={{ title: 'Downloads' }}
                        />
                        <Stack.Screen
                          name="player"
                          options={{
                            presentation: 'fullScreenModal',
                            headerShown: false,
                            gestureEnabled: true,
                          }}
                        />
                      </Stack>
                      <PersistentPlayerHost />
                    </PlaybackProvider>
                  </DownloadsProvider>
                </BookmarksProvider>
              </NotificationsProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </QueryPolicy>
      </QueryClientProvider>
    </DataPolicyProvider>
  );
}
