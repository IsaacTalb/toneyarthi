import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useBookmarks, type BookmarkSnapshot } from '../../src/bookmarks';
import {
  ArticleCard,
  Container,
  EmptyState,
  LoadingSkeleton,
  Typography,
} from '../../src/components';
import { useTheme } from '../../src/theme';

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

function isStale(item: BookmarkSnapshot) {
  const updated = Date.parse(item.snapshotUpdatedAt);
  return !Number.isFinite(updated) || Date.now() - updated > STALE_AFTER_MS;
}

function formatDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('my-MM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export default function SavedScreen() {
  const t = useTheme();
  const router = useRouter();
  const { bookmarks, ready, remove } = useBookmarks();

  return (
    <Container style={{ paddingHorizontal: 0 }}>
      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: t.spacing.md,
          gap: t.spacing.md,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={{ gap: t.spacing.xs, marginBottom: t.spacing.sm }}>
            <Typography accessibilityRole="header" variant="title">
              သိမ်းထားသော သတင်းများ
            </Typography>
            <Typography color={t.colors.inkMuted}>
              အင်တာနက်မရှိချိန်တွင်လည်း သိမ်းထားသော အကျဉ်းချုပ်ကို
              ဖတ်နိုင်ပါသည်။
            </Typography>
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <EmptyState
              title="သိမ်းထားသော သတင်း မရှိသေးပါ"
              message="နောက်မှဖတ်ရန် သတင်းတစ်ပုဒ်မှ စာညှပ်ပုံကို နှိပ်ပြီး သိမ်းနိုင်ပါသည်။"
              actionLabel="သတင်းများ ရှာမည်"
              onAction={() => router.push('/explore')}
            />
          ) : (
            <View style={{ gap: t.spacing.md }}>
              <LoadingSkeleton height={150} />
              <LoadingSkeleton height={150} />
            </View>
          )
        }
        renderItem={({ item }) => {
          const stale = isStale(item);
          return (
            <View style={{ gap: t.spacing.xs }}>
              <ArticleCard
                title={item.title}
                summary={item.summary}
                category={item.category}
                meta={formatDate(item.publishedAt)}
                onPress={() =>
                  router.push(`/article/${encodeURIComponent(item.slug)}`)
                }
              />
              <View
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: t.spacing.xs,
                }}
              >
                <Typography variant="caption" color={t.colors.inkMuted}>
                  {stale
                    ? 'အော့ဖ်လိုင်းမိတ္တူဟောင်း · ဖွင့်လျှင် အသစ်ပြန်ရယူမည်'
                    : 'အော့ဖ်လိုင်းအကျဉ်းချုပ် ရရှိနိုင်သည်'}
                </Typography>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} ကို သိမ်းထားသည်မှ ဖယ်ရှားမည်`}
                  hitSlop={8}
                  onPress={() => void remove(item.id)}
                  style={({ pressed }) => ({
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={t.colors.danger}
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </Container>
  );
}
