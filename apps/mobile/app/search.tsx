import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import type { ArticleSummary } from '../src/api/client';
import { queries } from '../src/api/queries';
import {
  ArticleCard,
  Container,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SectionHeader,
  Typography,
} from '../src/components';
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  MAX_SEARCH_LENGTH,
  MIN_SEARCH_LENGTH,
  normalizeSearch,
  saveRecentSearches,
} from '../src/search/recentSearches';
import { useTheme } from '../src/theme';
import { analytics } from '../src/analytics';

const DEBOUNCE_MS = 400;

export default function SearchScreen() {
  const t = useTheme();
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const initial = normalizeSearch(typeof q === 'string' ? q : '');
  const [input, setInput] = useState(initial);
  const [term, setTerm] = useState(initial);
  const [recent, setRecent] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trackedSearch = useRef('');

  useEffect(() => {
    void loadRecentSearches().then(setRecent);
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    const normalized = normalizeSearch(input);
    timer.current = setTimeout(() => setTerm(normalized), DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [input]);

  const valid =
    term.length >= MIN_SEARCH_LENGTH && term.length <= MAX_SEARCH_LENGTH;
  const search = useInfiniteQuery(queries.searchInfinite(valid ? term : ''));
  const results = useMemo(() => {
    const unique = new Map<string, ArticleSummary>();
    for (const page of search.data?.pages ?? [])
      for (const article of page.items) unique.set(article.id, article);
    return [...unique.values()];
  }, [search.data]);

  useEffect(() => {
    // A completed search belongs in history even when it returns no matches;
    // this keeps history aligned with the searches the user actually made.
    if (!valid || !search.data) return;
    if (trackedSearch.current !== term) {
      trackedSearch.current = term;
      analytics.track('search_completed', {
        query_length: Array.from(term).length,
        result_count: results.length,
      });
    }
    setRecent((current) => {
      const next = addRecentSearch(current, term);
      void saveRecentSearches(next);
      return next;
    });
  }, [results.length, search.data, valid, term]);

  const chooseRecent = useCallback((value: string) => {
    clearTimeout(timer.current);
    setInput(value);
    setTerm(value);
  }, []);
  const loadMore = useCallback(() => {
    if (search.hasNextPage && !search.isFetchingNextPage)
      void search.fetchNextPage();
  }, [search]);
  const tooShort = term.length > 0 && term.length < MIN_SEARCH_LENGTH;

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: t.colors.border,
            borderRadius: t.radius.md,
            backgroundColor: t.colors.surface,
            paddingHorizontal: t.spacing.sm,
          }}
        >
          <Ionicons name="search-outline" size={20} color={t.colors.inkMuted} />
          <TextInput
            accessibilityLabel="Search news"
            value={input}
            onChangeText={setInput}
            autoFocus
            maxLength={MAX_SEARCH_LENGTH + 20}
            placeholder="Search news"
            placeholderTextColor={t.colors.inkMuted}
            returnKeyType="search"
            onSubmitEditing={() => {
              clearTimeout(timer.current);
              setTerm(normalizeSearch(input));
            }}
            style={{
              flex: 1,
              minHeight: 48,
              paddingHorizontal: t.spacing.sm,
              color: t.colors.ink,
              fontFamily: t.typography.fontFamily,
              fontSize: 16,
            }}
          />
          {input ? (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => {
                setInput('');
                setTerm('');
              }}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={t.colors.inkMuted}
              />
            </Pressable>
          ) : null}
        </View>

        {!term && recent.length ? (
          <View style={{ marginTop: t.spacing.md }}>
            <SectionHeader
              title="Recent searches"
              action={
                <Pressable
                  onPress={() => {
                    setRecent([]);
                    void clearRecentSearches();
                  }}
                >
                  <Typography variant="label" color={t.colors.brand}>
                    Clear all
                  </Typography>
                </Pressable>
              }
            />
            {recent.map((item) => (
              <Pressable
                key={item}
                onPress={() => chooseRecent(item)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Typography>{item}</Typography>
              </Pressable>
            ))}
          </View>
        ) : null}

        {tooShort ? (
          <Typography
            color={t.colors.inkMuted}
            style={{ marginTop: t.spacing.md }}
          >
            Enter at least {MIN_SEARCH_LENGTH} characters.
          </Typography>
        ) : null}
        {term.length > MAX_SEARCH_LENGTH ? (
          <Typography
            accessibilityRole="alert"
            color={t.colors.danger}
            style={{ marginTop: t.spacing.md }}
          >
            Searches can contain at most {MAX_SEARCH_LENGTH} characters.
          </Typography>
        ) : null}
        {valid && search.isPending ? (
          <View style={{ gap: t.spacing.md, marginTop: t.spacing.lg }}>
            <LoadingSkeleton height={110} />
            <LoadingSkeleton height={110} />
          </View>
        ) : null}
        {valid && search.isError && !search.data ? (
          <ErrorState
            message="Search is unavailable. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void search.refetch()}
          />
        ) : null}
        {valid && !search.isPending && (!search.isError || search.data) ? (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            style={{ marginTop: t.spacing.sm }}
            contentContainerStyle={{
              gap: t.spacing.md,
              paddingBottom: t.spacing.xxl,
            }}
            ListHeaderComponent={
              search.isError && search.data ? (
                <Typography
                  accessibilityRole="alert"
                  variant="caption"
                  color={t.colors.danger}
                >
                  Offline — showing cached results.
                </Typography>
              ) : null
            }
            renderItem={({ item }) => (
              <ArticleCard
                title={item.titleMy?.trim() || item.title}
                summary={item.summaryMy?.trim() || item.summary}
                category={
                  item.categoryNameMy ||
                  item.categoryName ||
                  item.categorySlug ||
                  'News'
                }
                onPress={() =>
                  router.push({
                    pathname: '/article/[slug]',
                    params: { slug: item.id, entryPoint: 'search' },
                  })
                }
              />
            )}
            ListEmptyComponent={
              <EmptyState
                title="No results"
                message={`No stories matched “${term}”.`}
              />
            }
            ListFooterComponent={
              search.isFetchingNextPage ? (
                <LoadingSkeleton height={100} />
              ) : null
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            keyboardShouldPersistTaps="handled"
          />
        ) : null}
      </KeyboardAvoidingView>
    </Container>
  );
}
