import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { lightTheme } from '../../src/theme';

const icon = (name: ComponentProps<typeof Ionicons>['name']) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerTitleAlign: Platform.OS === 'android' ? 'left' : 'center',
        sceneStyle: { backgroundColor: lightTheme.colors.canvas },
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
