import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import type { ArticleSummary } from '../../src/api/client';
import { queries } from '../../src/api/queries';
import {
  CategoryChip,
  Container,
  EmptyState,
  ErrorState,
  HomeStoryCard,
  LoadingSkeleton,
  SectionHeader,
  Typography,
  type HomeStory,
} from '../../src/components';
import { useTheme } from '../../src/theme';

const compactStory = (article: ArticleSummary): HomeStory => ({
  id: article.id,
  title: article.titleMy?.trim() || article.title,
  summary: article.summaryMy?.trim() || article.summary,
  category:
    article.categoryNameMy?.trim() ||
    article.categoryName?.trim() ||
    article.categorySlug ||
    'သတင်း',
  imageUrl: article.imageUrl,
  publishedLabel: new Intl.DateTimeFormat('my-MM', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(article.publishedAt)),
  hasAudio: Boolean(article.audioUrl),
});

type FeedRow =
  | { kind: 'section'; id: string; title: string }
  | { kind: 'story'; id: string; story: HomeStory };

const StoryRow = memo(function StoryRow({
  story,
  onOpen,
}: {
  story: HomeStory;
  onOpen: (id: string) => void;
}) {
  const onPress = useCallback(() => onOpen(story.id), [onOpen, story.id]);
  return <HomeStoryCard story={story} onPress={onPress} />;
});

function HomeSkeleton() {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md, paddingTop: t.spacing.md }}>
      <LoadingSkeleton width="45%" height={28} />
      <LoadingSkeleton height={206} style={{ borderRadius: t.radius.lg }} />
      <LoadingSkeleton width="40%" height={28} />
      <LoadingSkeleton height={190} style={{ borderRadius: t.radius.lg }} />
    </View>
  );
}

export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const feed = useInfiniteQuery(queries.homeFeed());
  const categories = useQuery(queries.categories());

  // A Map both compacts the UI model and prevents overlapping pages from
  // rendering the same article when the backend feed changes mid-pagination.
  const stories = useMemo(() => {
    const unique = new Map<string, HomeStory>();
    for (const page of feed.data?.pages ?? []) {
      for (const article of page.items) {
        if (!unique.has(article.id))
          unique.set(article.id, compactStory(article));
      }
    }
    return [...unique.values()];
  }, [feed.data]);

  const featured = stories[0];
  const rows = useMemo<FeedRow[]>(() => {
    const remaining = stories.slice(1);
    const latest = remaining.slice(0, 5);
    const result: FeedRow[] = latest.length
      ? [
          {
            kind: 'section',
            id: 'section-latest',
            title: 'နောက်ဆုံးရသတင်းများ',
          },
          ...latest.map((story) => ({
            kind: 'story' as const,
            id: `latest-${story.id}`,
            story,
          })),
        ]
      : [];
    const grouped = new Map<string, HomeStory[]>();
    for (const story of remaining.slice(5)) {
      const group = grouped.get(story.category) ?? [];
      group.push(story);
      grouped.set(story.category, group);
    }
    for (const [category, items] of grouped) {
      result.push({
        kind: 'section',
        id: `section-${category}`,
        title: category,
      });
      result.push(
        ...items.map((story) => ({
          kind: 'story' as const,
          id: `category-${category}-${story.id}`,
          story,
        })),
      );
    }
    return result;
  }, [stories]);

  const openStory = useCallback(
    (id: string) => router.push(`/article/${encodeURIComponent(id)}`),
    [router],
  );
  const refresh = useCallback(() => {
    void Promise.all([feed.refetch(), categories.refetch()]);
  }, [categories, feed]);
  const loadMore = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);
  const renderRow = useCallback(
    ({ item }: { item: FeedRow }) =>
      item.kind === 'section' ? (
        <SectionHeader title={item.title} />
      ) : (
        <StoryRow story={item.story} onOpen={openStory} />
      ),
    [openStory],
  );

  if (feed.isPending && !feed.data) {
    return (
      <Container>
        <HomeSkeleton />
      </Container>
    );
  }
  if (feed.isError && !feed.data) {
    return (
      <Container>
        <ErrorState
          message="သတင်းများကို မရယူနိုင်သေးပါ။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ဆေးပါ။"
          actionLabel="ထပ်ကြိုးစားမည်"
          onAction={() => void feed.refetch()}
        />
      </Container>
    );
  }

  return (
    <Container edges={['left', 'right']} style={{ paddingHorizontal: 0 }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.xxl,
          gap: t.spacing.md,
        }}
        ListHeaderComponent={
          <View style={{ gap: t.spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: t.spacing.sm,
              }}
            >
              <View>
                <Typography variant="caption" color={t.colors.inkMuted}>
                  မင်္ဂလာပါ
                </Typography>
                <Typography accessibilityRole="header" variant="title">
                  တုံ့ရသီ
                </Typography>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search"
                hitSlop={8}
                onPress={() => router.push('/search')}
                style={({ pressed }) => ({
                  padding: t.spacing.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Ionicons
                  name="search-outline"
                  size={24}
                  color={t.colors.ink}
                />
              </Pressable>
            </View>
            {categories.data?.items.length ? (
              <FlatList
                horizontal
                data={categories.data.items}
                keyExtractor={(item) => item.slug}
                renderItem={({ item }) => (
                  <CategoryChip
                    label={item.nameMy?.trim() || item.name}
                    onPress={() => router.push('/explore')}
                  />
                )}
                contentContainerStyle={{ gap: t.spacing.xs }}
                showsHorizontalScrollIndicator={false}
              />
            ) : null}
            {featured ? (
              <>
                <SectionHeader title="အထူးသတင်း" />
                <HomeStoryCard
                  featured
                  story={featured}
                  onPress={() => openStory(featured.id)}
                />
              </>
            ) : null}
            {feed.isError && feed.data ? (
              <Typography
                accessibilityRole="alert"
                variant="caption"
                color={t.colors.danger}
              >
                လတ်တလောအချက်အလက် မရသဖြင့် သိမ်းထားသောသတင်းများကို ပြထားသည်။
              </Typography>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !featured ? (
            <EmptyState message="ဖတ်ရှုရန် သတင်းအသစ် မရှိသေးပါ။" />
          ) : null
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View style={{ paddingTop: t.spacing.lg }}>
              <LoadingSkeleton height={150} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={refresh}
            tintColor={t.colors.brand}
            colors={[t.colors.brand]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.45}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </Container>
  );
}
