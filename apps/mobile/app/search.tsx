import { useLocalSearchParams } from 'expo-router';
import { RoutePlaceholder } from '../src/components';

export default function SearchScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return <RoutePlaceholder title="Search" detail={q ? `Query: ${q}` : undefined} />;
}
