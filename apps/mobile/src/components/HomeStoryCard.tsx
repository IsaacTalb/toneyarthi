import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Image, Pressable, View, type PressableProps } from 'react-native';
import { useTheme } from '../theme';
import { Typography } from './Typography';
import { usePolicyImageUrl } from '../dataPolicy';

export type HomeStory = {
  id: string;
  title: string;
  summary?: string;
  category: string;
  imageUrl?: string;
  publishedLabel: string;
  hasAudio: boolean;
};

type Props = Omit<PressableProps, 'children'> & {
  story: HomeStory;
  featured?: boolean;
};

function StoryCard({ story, featured = false, ...props }: Props) {
  const t = useTheme();
  const imageUrl = usePolicyImageUrl(story.imageUrl);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${story.category}: ${story.title}`}
      {...props}
      style={({ pressed }) => [
        {
          overflow: 'hidden',
          borderRadius: t.radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          backgroundColor: t.colors.surface,
          opacity: pressed ? 0.8 : 1,
        },
        t.elevation.card,
        typeof props.style === 'function'
          ? props.style({ pressed })
          : props.style,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl, cache: 'force-cache' }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          resizeMethod="resize"
          style={{ width: '100%', height: featured ? 206 : 152 }}
        />
      ) : (
        <View
          style={{
            height: featured ? 150 : 104,
            backgroundColor: t.colors.brandSoft,
          }}
        />
      )}
      <View style={{ padding: t.spacing.md }}>
        <Typography variant="caption" color={t.colors.brand}>
          {story.category}
        </Typography>
        <Typography
          variant={featured ? 'title' : 'heading'}
          numberOfLines={featured ? 3 : 2}
          style={{ marginTop: t.spacing.xxs }}
        >
          {story.title}
        </Typography>
        {featured && story.summary ? (
          <Typography
            color={t.colors.inkMuted}
            numberOfLines={2}
            style={{ marginTop: t.spacing.xs }}
          >
            {story.summary}
          </Typography>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            marginTop: t.spacing.sm,
          }}
        >
          <Typography variant="caption" color={t.colors.inkMuted}>
            {story.publishedLabel}
          </Typography>
          {story.hasAudio ? (
            <Ionicons
              accessibilityLabel="Audio available"
              name="volume-low-outline"
              size={14}
              color={t.colors.inkMuted}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const HomeStoryCard = memo(StoryCard);
