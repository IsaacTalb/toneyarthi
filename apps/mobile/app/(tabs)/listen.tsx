import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ArticleSummary } from '../../src/api/client';
import { api, queries } from '../../src/api/queries';
import { Container, ErrorState, Typography } from '../../src/components';
import { resolvePlayableArticles, usePlayback } from '../../src/playback';
import { useTheme } from '../../src/theme';

const LIMIT = 12;

export default function ListenScreen() {
  const t = useTheme();
  const router = useRouter();
  const playback = usePlayback();
  const [starting, setStarting] = useState<string | null>(null);
  const morning = useQuery(
    queries.playlist('morning-briefing', { limit: LIMIT }),
  );
  const latest = useQuery(queries.audio({ limit: LIMIT }));
  // The audio response already contains category metadata. Deriving these
  // shelves locally avoids a categories request followed by four feed
  // requests, and guarantees every displayed row is directly playable.
  const sections = useMemo(() => {
    const latestItems = latest.data?.items ?? [];
    const groups = new Map<
      string,
      { title: string; items: ArticleSummary[] }
    >();
    for (const item of latestItems) {
      const key = item.categorySlug ?? 'news';
      const group = groups.get(key) ?? {
        title:
          item.categoryNameMy?.trim() || item.categoryName?.trim() || 'သတင်း',
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    }
    return [
      {
        key: 'morning',
        title: 'Morning Briefing',
        items: morning.data?.items ?? [],
        pending: morning.isPending,
      },
      {
        key: 'latest',
        title: 'Latest Audio News',
        items: latestItems,
        pending: latest.isPending,
      },
      ...[...groups.entries()].slice(0, 4).map(([key, group]) => ({
        key,
        title: group.title,
        items: group.items,
        pending: latest.isPending,
      })),
    ];
  }, [latest.data, latest.isPending, morning.data, morning.isPending]);

  const start = async (key: string, items: ArticleSummary[], index = 0) => {
    setStarting(key);
    const queue = await resolvePlayableArticles(items, api.article);
    setStarting(null);
    if (!queue.length) return;
    const selectedId = items[index]?.id;
    const selectedIndex = queue.findIndex((item) => item.id === selectedId);
    await playback.replaceQueue(queue, selectedIndex < 0 ? 0 : selectedIndex);
    router.push('/player');
  };

  if (morning.isError && latest.isError)
    return (
      <Container>
        <ErrorState
          message="နားဆင်စရာများကို မရယူနိုင်သေးပါ။"
          actionLabel="ထပ်ကြိုးစားမည်"
          onAction={() =>
            void Promise.all([morning.refetch(), latest.refetch()])
          }
        />
      </Container>
    );

  return (
    <Container edges={['left', 'right']} style={{ paddingHorizontal: 0 }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: t.spacing.md, gap: t.spacing.xl },
        ]}
      >
        <View>
          <Typography accessibilityRole="header" variant="title">
            နားဆင်ရန်
          </Typography>
          <Typography color={t.colors.inkMuted}>
            သတင်းအစီအစဉ်များနှင့် အသံသတင်းများ
          </Typography>
        </View>
        {sections.map((section) => (
          <View key={section.key} style={{ gap: t.spacing.sm }}>
            <View style={styles.heading}>
              <Typography accessibilityRole="header" variant="heading">
                {section.title}
              </Typography>
              {section.items.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${section.title} အားလုံးဖွင့်မည်`}
                  onPress={() => void start(section.key, section.items)}
                >
                  <Ionicons
                    name="play-circle"
                    size={34}
                    color={t.colors.brand}
                  />
                </Pressable>
              ) : null}
            </View>
            {section.pending ? (
              <ActivityIndicator color={t.colors.brand} />
            ) : section.items.length ? (
              section.items.slice(0, 4).map((item, index) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.titleMy?.trim() || item.title}
                  accessibilityHint="အသံသတင်းကို ဖွင့်မည်"
                  accessibilityState={{ busy: starting === section.key }}
                  onPress={() => void start(section.key, section.items, index)}
                  style={[
                    styles.row,
                    {
                      backgroundColor: t.colors.surface,
                      borderColor: t.colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={item.audioUrl ? 'volume-medium' : 'newspaper-outline'}
                    size={22}
                    color={t.colors.brand}
                  />
                  <View style={{ flex: 1 }}>
                    <Typography variant="label" numberOfLines={2}>
                      {item.titleMy?.trim() || item.title}
                    </Typography>
                    <Typography variant="caption" color={t.colors.inkMuted}>
                      {item.categoryNameMy?.trim() ||
                        item.categoryName ||
                        'အသံသတင်း'}
                    </Typography>
                  </View>
                  {starting === section.key ? (
                    <ActivityIndicator size="small" color={t.colors.brand} />
                  ) : (
                    <Ionicons name="play" size={18} color={t.colors.ink} />
                  )}
                </Pressable>
              ))
            ) : (
              <Typography color={t.colors.inkMuted}>
                နားဆင်စရာ မရှိသေးပါ။
              </Typography>
            )}
          </View>
        ))}
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 80 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
});
