import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

const INSTALLATION_KEY = 'notifications.installation.v1';
const PREFERENCES_KEY = 'notifications.preferences.v1';
const ARTICLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface NotificationPreferences {
  breakingNews: boolean;
  briefings: boolean;
  categories: string[];
}

export const conservativeNotificationPreferences: NotificationPreferences = {
  breakingNews: false,
  briefings: false,
  categories: [],
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type NotificationContextValue = {
  preferences: NotificationPreferences;
  permission: Notifications.PermissionStatus | 'unknown';
  requestPermission: () => Promise<boolean>;
  updatePreferences: (value: NotificationPreferences) => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

function apiUrl(): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!base) throw new Error('EXPO_PUBLIC_API_BASE_URL is required');
  return `${base.replace(/\/+$/, '')}/v1/push-tokens`;
}

function environment(): 'development' | 'preview' | 'production' {
  const value = process.env.EXPO_PUBLIC_APP_ENVIRONMENT;
  return value === 'preview' || value === 'production' ? value : 'development';
}

async function installationId(): Promise<string> {
  const stored = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (stored) return stored;
  const created = `${Date.now().toString(36)}-${Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('-')}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

async function acquireToken(): Promise<string> {
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw new Error('EAS projectId is required for push notifications');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

async function register(preferences: NotificationPreferences): Promise<void> {
  if (!Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android'))
    return;
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') return;
  const token = await acquireToken();
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installationId: await installationId(),
      token,
      platform: Platform.OS,
      appEnvironment: environment(),
      preferences,
    }),
  });
  if (!response.ok)
    throw new Error(`Push registration failed (${response.status})`);
}

function openArticle(
  response: Notifications.NotificationResponse | null,
): void {
  const slug = response?.notification.request.content.data?.articleSlug;
  if (typeof slug === 'string' && ARTICLE_SLUG.test(slug))
    router.push({ pathname: '/article/[slug]', params: { slug } });
}

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState(
    conservativeNotificationPreferences,
  );
  const [permission, setPermission] = useState<
    Notifications.PermissionStatus | 'unknown'
  >('unknown');
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    void AsyncStorage.getItem(PREFERENCES_KEY).then((stored) => {
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as NotificationPreferences;
        if (
          typeof parsed.breakingNews === 'boolean' &&
          typeof parsed.briefings === 'boolean' &&
          Array.isArray(parsed.categories)
        )
          setPreferences(parsed);
      } catch {
        /* Retain conservative defaults for corrupt local state. */
      }
    });
    void Notifications.getPermissionsAsync().then(({ status }) =>
      setPermission(status),
    );
    if (Platform.OS === 'android')
      void Notifications.setNotificationChannelAsync('news', {
        name: 'News updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: '#8B5E3C',
      });
    void Notifications.getLastNotificationResponseAsync().then(openArticle);
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(openArticle);
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      // The native provider token changed; reacquire its corresponding Expo token.
      void register(preferencesRef.current).catch(() => undefined);
    });
    return () => {
      responseSubscription.remove();
      tokenSubscription.remove();
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (!Device.isDevice) return false;
    const result = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    setPermission(result.status);
    if (result.status === 'granted') await register(preferences);
    return result.status === 'granted';
  }, [preferences]);

  const updatePreferences = useCallback(
    async (next: NotificationPreferences) => {
      setPreferences(next);
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      await register(next);
    },
    [],
  );

  const value = useMemo(
    () => ({ preferences, permission, requestPermission, updatePreferences }),
    [permission, preferences, requestPermission, updatePreferences],
  );
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value)
    throw new Error(
      'useNotifications must be used inside NotificationsProvider',
    );
  return value;
}
