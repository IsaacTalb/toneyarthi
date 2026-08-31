import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  Share,
  View,
} from 'react-native';
import type { ArticleSummary } from '../../src/api/client';
import { queries } from '../../src/api/queries';
import { articlePublicUrl, validatedHttpsUrl } from '../../src/articleLinks';
import {
  ArticleCard,
  Container,
  ErrorState,
  LoadingSkeleton,
  Typography,
} from '../../src/components';
import { useTheme } from '../../src/theme';
import { usePlayback } from '../../src/playback';

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('my-MM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const Action = ({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) => {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        backgroundColor: active ? t.colors.brand : t.colors.brandSoft,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? t.colors.onBrand : t.colors.brand}
      />
      <Typography
        variant="label"
        color={active ? t.colors.onBrand : t.colors.brand}
      >
        {label}
      </Typography>
    </Pressable>
  );
};

const RelatedStory = memo(function RelatedStory({
  story,
  onOpen,
}: {
  story: ArticleSummary;
  onOpen: (slug: string) => void;
}) {
  return (
    <ArticleCard
      title={story.titleMy?.trim() || story.title}
      summary={story.summaryMy?.trim() || story.summary}
      category={story.categoryNameMy?.trim() || story.categoryName || 'သတင်း'}
      meta={formatDate(story.publishedAt)}
      onPress={() => onOpen(story.id)}
    />
  );
});

function ArticleSkeleton() {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md, paddingTop: t.spacing.md }}>
      <LoadingSkeleton width="30%" height={20} />
      <LoadingSkeleton height={86} />
      <LoadingSkeleton height={220} style={{ borderRadius: t.radius.lg }} />
      <LoadingSkeleton height={180} />
    </View>
  );
}

export default function ArticleScreen() {
  const t = useTheme();
  const router = useRouter();
  const playback = usePlayback();
  const { slug = '' } = useLocalSearchParams<{ slug?: string }>();
  const articleSlug = Array.isArray(slug) ? slug[0] : slug;
  const article = useQuery({
    ...queries.article(articleSlug),
    enabled: Boolean(articleSlug),
  });
  const categorySlug = article.data?.categorySlug ?? '';
  const related = useQuery({
    ...queries.categoryFeed(categorySlug, { limit: 4 }),
    enabled: Boolean(categorySlug),
  });
  // This state is the UI integration point for the local saved-article store.
  // Replace the setter with the durable store adapter when offline storage lands.
  const [isSaved, setIsSaved] = useState(false);

  const paragraphs = useMemo(
    () =>
      (article.data?.bodyMy?.trim() || article.data?.body || '')
        .split(/\n\s*\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    [article.data],
  );
  const relatedStories = useMemo(
    () =>
      related.data?.items
        .filter((item) => item.id !== article.data?.id)
        .slice(0, 3) ?? [],
    [article.data?.id, related.data],
  );
  const openStory = useCallback(
    (nextSlug: string) =>
      router.push(`/article/${encodeURIComponent(nextSlug)}`),
    [router],
  );

  if (article.isPending) {
    return (
      <Container>
        <ArticleSkeleton />
      </Container>
    );
  }
  if (article.isError || !article.data) {
    return (
      <Container>
        <ErrorState
          message="ဤသတင်းကို မရယူနိုင်သေးပါ။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ဆေးပါ။"
          actionLabel="ထပ်ကြိုးစားမည်"
          onAction={() => void article.refetch()}
        />
      </Container>
    );
  }

  const data = article.data;
  const title = data.titleMy?.trim() || data.title;
  const summary = data.summaryMy?.trim() || data.summary;
  const category =
    data.categoryNameMy?.trim() ||
    data.categoryName ||
    data.categorySlug ||
    'သတင်း';
  const publicUrl = articlePublicUrl(articleSlug);
  const shareArticle = () => {
    void Share.share({
      title,
      message: `${title}\n${publicUrl}`,
      url: publicUrl,
    }).catch(() => Alert.alert('မျှဝေ၍ မရပါ', 'ခဏအကြာတွင် ထပ်ကြိုးစားပါ။'));
  };
  const playAudio = () => {
    if (!data.audioUrl) return;
    void playback.load({
      id: data.id,
      uri: data.audioUrl,
      title,
      artist: data.author,
      artworkUri: data.imageUrl,
      category,
      source: data.sources?.[0]?.name,
    });
    router.push({ pathname: '/player', params: { articleId: data.id } });
  };
  const openSource = async (url: string) => {
    const safeUrl = validatedHttpsUrl(url);
    if (!safeUrl || !(await Linking.canOpenURL(safeUrl))) {
      Alert.alert('လင့်ခ်ကို ဖွင့်၍ မရပါ', 'လုံခြုံသော HTTPS လင့်ခ်မဟုတ်ပါ။');
      return;
    }
    await Linking.openURL(safeUrl);
  };

  return (
    <Container edges={['left', 'right']} style={{ paddingHorizontal: 0 }}>
      <Stack.Screen options={{ title: category }} />
      <FlatList
        data={paragraphs}
        keyExtractor={(_, index) => `paragraph-${index}`}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: t.spacing.xxl }}
        renderItem={({ item }) => (
          <Typography
            selectable
            style={{
              paddingHorizontal: t.spacing.md,
              marginBottom: t.spacing.md,
              lineHeight: 30,
            }}
          >
            {item}
          </Typography>
        )}
        ListHeaderComponent={
          <View
            accessibilityLabel="သတင်းအချက်အလက်"
            style={{ gap: t.spacing.md, paddingBottom: t.spacing.lg }}
          >
            <View
              style={{
                paddingHorizontal: t.spacing.md,
                gap: t.spacing.sm,
                paddingTop: t.spacing.md,
              }}
            >
              <Typography variant="label" color={t.colors.brand}>
                {category}
              </Typography>
              <Typography accessibilityRole="header" variant="title">
                {title}
              </Typography>
              <Typography color={t.colors.inkMuted}>{summary}</Typography>
              <Typography variant="caption" color={t.colors.inkMuted}>
                {data.author ? `${data.author} · ` : ''}
                {formatDate(data.publishedAt)}
              </Typography>
            </View>
            {data.imageUrl ? (
              <Image
                source={{ uri: data.imageUrl, cache: 'force-cache' }}
                accessibilityLabel={`${title} သတင်းဓာတ်ပုံ`}
                resizeMode="cover"
                resizeMethod="resize"
                style={{
                  width: '100%',
                  aspectRatio: 16 / 9,
                  backgroundColor: t.colors.surfaceMuted,
                }}
              />
            ) : (
              <View
                accessibilityLabel="သတင်းဓာတ်ပုံ မရှိပါ"
                style={{
                  height: 190,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.colors.brandSoft,
                }}
              >
                <Ionicons
                  name="newspaper-outline"
                  size={52}
                  color={t.colors.brand}
                />
              </View>
            )}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: t.spacing.xs,
                paddingHorizontal: t.spacing.md,
              }}
            >
              {data.audioUrl ? (
                <Action
                  icon="headset-outline"
                  label="နားထောင်မည်"
                  onPress={playAudio}
                />
              ) : null}
              <Action
                icon={isSaved ? 'bookmark' : 'bookmark-outline'}
                label={isSaved ? 'သိမ်းပြီး' : 'သိမ်းမည်'}
                active={isSaved}
                onPress={() => setIsSaved((value) => !value)}
              />
              <Action
                icon="share-social-outline"
                label="မျှဝေမည်"
                onPress={shareArticle}
              />
            </View>
          </View>
        }
        ListFooterComponent={
          <View
            style={{
              gap: t.spacing.md,
              paddingHorizontal: t.spacing.md,
              paddingTop: t.spacing.lg,
            }}
          >
            {data.sources?.length ? (
              <View
                accessibilityLabel="သတင်းရင်းမြစ်များ"
                style={{ gap: t.spacing.sm }}
              >
                <Typography accessibilityRole="header" variant="heading">
                  သတင်းရင်းမြစ်
                </Typography>
                <Typography color={t.colors.inkMuted}>
                  မူရင်းသတင်းဌာနများကို အောက်ပါလင့်ခ်များမှ ဖတ်ရှုနိုင်ပါသည်။
                </Typography>
                {data.sources.map((source, index) => (
                  <Pressable
                    key={`${source.url}-${index}`}
                    accessibilityRole="link"
                    onPress={() => void openSource(source.url)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.xs,
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <Typography
                      variant="label"
                      color={t.colors.brand}
                      style={{ flex: 1 }}
                    >
                      {source.name}
                    </Typography>
                    <Ionicons
                      name="open-outline"
                      size={18}
                      color={t.colors.brand}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {relatedStories.length ? (
              <View
                accessibilityLabel="ဆက်စပ်သတင်းများ"
                style={{ gap: t.spacing.md, paddingTop: t.spacing.lg }}
              >
                <Typography accessibilityRole="header" variant="heading">
                  ဆက်စပ်သတင်းများ
                </Typography>
                {relatedStories.map((story) => (
                  <RelatedStory
                    key={story.id}
                    story={story}
                    onOpen={openStory}
                  />
                ))}
              </View>
            ) : null}
          </View>
        }
      />
    </Container>
  );
}
