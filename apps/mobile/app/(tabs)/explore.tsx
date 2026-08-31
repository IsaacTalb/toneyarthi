import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import type { ArticleSummary } from '../../src/api/client';
import { queries } from '../../src/api/queries';
import {
  ArticleCard,
  CategoryChip,
  Container,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SectionHeader,
  Typography,
} from '../../src/components';
import { useTheme } from '../../src/theme';

const title = (article: ArticleSummary) =>
  article.titleMy?.trim() || article.title;
const summary = (article: ArticleSummary) =>
  article.summaryMy?.trim() || article.summary;

export default function ExploreScreen() {
  const t = useTheme();
  const router = useRouter();
  const [category, setCategory] = useState<string>();
  const categories = useQuery(queries.categories());
  const feed = useInfiniteQuery(queries.exploreFeed(category));
  const articles = useMemo(() => {
    const unique = new Map<string, ArticleSummary>();
    for (const page of feed.data?.pages ?? [])
      for (const article of page.items) unique.set(article.id, article);
    return [...unique.values()];
  }, [feed.data]);
  const selectedName = category
    ? categories.data?.items.find((item) => item.slug === category)?.nameMy ||
      categories.data?.items.find((item) => item.slug === category)?.name
    : 'နောက်ဆုံးရသတင်းများ';
  const loadMore = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);

  if (feed.isPending && !feed.data)
    return (
      <Container>
        <View style={{ gap: t.spacing.md, paddingTop: t.spacing.lg }}>
          <LoadingSkeleton width="45%" height={28} />
          <LoadingSkeleton height={120} />
          <LoadingSkeleton height={120} />
        </View>
      </Container>
    );
  if (feed.isError && !feed.data)
    return (
      <Container>
        <ErrorState
          message="သတင်းများကို မရယူနိုင်ပါ။"
          actionLabel="ထပ်ကြိုးစားမည်"
          onAction={() => void feed.refetch()}
        />
      </Container>
    );

  return (
    <Container edges={['left', 'right']} style={{ paddingHorizontal: 0 }}>
      <FlatList
        data={articles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: t.spacing.md, gap: t.spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: t.spacing.sm }}>
            <SectionHeader title="Explore" />
            <FlatList
              horizontal
              data={categories.data?.items ?? []}
              keyExtractor={(item) => item.slug}
              ListHeaderComponent={
                <CategoryChip
                  label="Latest"
                  selected={!category}
                  onPress={() => setCategory(undefined)}
                />
              }
              renderItem={({ item }) => (
                <CategoryChip
                  label={item.nameMy?.trim() || item.name}
                  selected={category === item.slug}
                  onPress={() => setCategory(item.slug)}
                />
              )}
              contentContainerStyle={{ gap: t.spacing.xs }}
              showsHorizontalScrollIndicator={false}
            />
            <SectionHeader
              title={selectedName ?? 'သတင်းများ'}
              action={
                <Pressable onPress={() => router.push('/search')} hitSlop={8}>
                  <Typography variant="label" color={t.colors.brand}>
                    Search
                  </Typography>
                </Pressable>
              }
            />
            {feed.isError && feed.data ? (
              <Typography
                accessibilityRole="alert"
                variant="caption"
                color={t.colors.danger}
              >
                Offline — သိမ်းထားသော ရလဒ်များကို ပြထားသည်။
              </Typography>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ArticleCard
            title={title(item)}
            summary={summary(item)}
            category={
              item.categoryNameMy ||
              item.categoryName ||
              item.categorySlug ||
              'သတင်း'
            }
            meta={new Date(item.publishedAt).toLocaleDateString()}
            onPress={() =>
              router.push(`/article/${encodeURIComponent(item.id)}`)
            }
          />
        )}
        ListEmptyComponent={<EmptyState message="ဤကဏ္ဍတွင် သတင်းမရှိသေးပါ။" />}
        ListFooterComponent={
          feed.isFetchingNextPage ? <LoadingSkeleton height={100} /> : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => void feed.refetch()}
            tintColor={t.colors.brand}
          />
        }
      />
    </Container>
  );
}
