import { useLocalSearchParams } from 'expo-router';
import { RoutePlaceholder } from '../../src/components';

export default function ArticleScreen() {
  const { articleId } = useLocalSearchParams<{ articleId: string }>();
  return <RoutePlaceholder title="Article" detail={`Article ID: ${articleId}`} />;
}
