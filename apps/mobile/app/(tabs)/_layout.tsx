import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { lightTheme } from '../../src/theme';
import { MINI_PLAYER_HEIGHT } from '../../src/components';
import { usePlaybackSelector } from '../../src/playback';

const icon = (name: ComponentProps<typeof Ionicons>['name']) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

export default function TabLayout() {
  const hasSelectedTrack = usePlaybackSelector((state) => Boolean(state.item));
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerTitleAlign: Platform.OS === 'android' ? 'left' : 'center',
        sceneStyle: {
          backgroundColor: lightTheme.colors.canvas,
          paddingBottom: hasSelectedTrack ? MINI_PLAYER_HEIGHT + 8 : 0,
        },
        tabBarActiveTintColor: lightTheme.colors.brand,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: icon('home-outline') }}
      />
      <Tabs.Screen
        name="listen"
        options={{ title: 'Listen', tabBarIcon: icon('headset-outline') }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explore', tabBarIcon: icon('compass-outline') }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: 'Saved', tabBarIcon: icon('bookmark-outline') }}
      />
    </Tabs>
  );
}
