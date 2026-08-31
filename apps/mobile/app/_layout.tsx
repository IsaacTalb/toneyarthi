import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, lightTheme } from '../src/theme';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: lightTheme.colors.canvas },
          headerShown: false,
        }}
      />
    </ThemeProvider>
  );
}
