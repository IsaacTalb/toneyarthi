import { Stack, useLocalSearchParams } from 'expo-router';
import { RoutePlaceholder } from '../src/components';

export default function PlayerScreen() {
  const { articleId } = useLocalSearchParams<{ articleId?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Now Playing' }} />
      <RoutePlaceholder
        title="Now Playing"
        detail={articleId ? `Article ID: ${articleId}` : undefined}
      />
    </>
  );
}
