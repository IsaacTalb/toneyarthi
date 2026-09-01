import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Container, Typography } from '../src/components';
import { PLAYBACK_RATES, usePlayback } from '../src/playback';
import { useTheme } from '../src/theme';
import { usePolicyImageUrl } from '../src/dataPolicy';

const clock = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export default function PlayerScreen() {
  const playback = usePlayback();
  const router = useRouter();
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const trackWidth = useRef(0);
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const item = playback.item;
  const artworkUrl = usePolicyImageUrl(item?.artworkUri);
  const hasMedia = Boolean(item?.uri);
  const canSeek =
    hasMedia && playback.duration > 0 && playback.phase !== 'loading';
  const busy = playback.phase === 'loading' || playback.phase === 'buffering';
  const playing =
    playback.phase === 'playing' || playback.phase === 'buffering';
  const progress = canSeek
    ? Math.min(Math.max(playback.position / playback.duration, 0), 1)
    : 0;
  const compactLandscape = width > height && height < 500;

  const seekFromX = (x: number) => {
    if (!canSeek || trackWidth.current <= 0) return;
    void playback.seek((x / trackWidth.current) * playback.duration);
  };
  const adjustSeek = (direction: 'increment' | 'decrement') => {
    if (!canSeek) return;
    void playback.seek(
      playback.position + (direction === 'increment' ? 15 : -15),
    );
  };

  return (
    <Container style={styles.shell}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ပလေယာ ပိတ်မည်"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-down" size={27} color={t.colors.ink} />
        </Pressable>
        <Typography variant="label">ယခု နားဆင်နေသည်</Typography>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: t.spacing.xl },
          compactLandscape && styles.landscapeContent,
        ]}
      >
        <View
          style={[
            styles.artworkWrap,
            { backgroundColor: t.colors.brandSoft },
            compactLandscape && styles.landscapeArtwork,
          ]}
        >
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              accessibilityLabel={`${item.title} သတင်းဓာတ်ပုံ`}
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              style={styles.artwork}
            />
          ) : (
            <Ionicons name="headset" size={64} color={t.colors.brand} />
          )}
        </View>

        <View style={[styles.playerColumn, { gap: t.spacing.lg }]}>
          <View style={{ gap: t.spacing.xs }}>
            <Typography variant="label" color={t.colors.brand}>
              {[item?.category, item?.source].filter(Boolean).join('  ·  ') ||
                'အမျိုးအစားနှင့် သတင်းရင်းမြစ် မရှိသေးပါ'}
            </Typography>
            <Typography accessibilityRole="header" variant="display">
              {item?.title ?? 'နားဆင်ရန် သတင်း မရွေးရသေးပါ'}
            </Typography>
            {item?.artist ? (
              <Typography color={t.colors.inkMuted}>{item.artist}</Typography>
            ) : null}
          </View>

          {playback.error ? (
            <View
              accessibilityRole="alert"
              style={[styles.notice, { backgroundColor: t.colors.dangerSoft }]}
            >
              <Ionicons name="alert-circle" size={20} color={t.colors.danger} />
              <Typography color={t.colors.danger} style={styles.noticeText}>
                အသံဖွင့်၍ မရပါ။ {playback.error}
              </Typography>
            </View>
          ) : busy ? (
            <View accessibilityRole="progressbar" style={styles.status}>
              <ActivityIndicator color={t.colors.brand} />
              <Typography color={t.colors.inkMuted}>
                {playback.phase === 'loading'
                  ? 'အသံကို ပြင်ဆင်နေသည်…'
                  : 'အသံကို ကြိုတင်ရယူနေသည်…'}
              </Typography>
            </View>
          ) : null}

          <View style={{ gap: t.spacing.sm }}>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="အသံ အချိန်ရွှေ့ရန်"
              accessibilityHint="တိုးရန် သို့မဟုတ် လျှော့ရန် လက်ဟန်ကို အသုံးပြုပါ"
              accessibilityState={{ disabled: !canSeek }}
              accessibilityValue={{
                min: 0,
                max: Math.floor(playback.duration),
                now: Math.floor(playback.position),
                text: `${clock(playback.position)}၊ စုစုပေါင်း ${clock(playback.duration)}`,
              }}
              accessibilityActions={[
                { name: 'increment', label: '၁၅ စက္ကန့် ရှေ့သို့' },
                { name: 'decrement', label: '၁၅ စက္ကန့် နောက်သို့' },
              ]}
              disabled={!canSeek}
              onAccessibilityAction={(event) =>
                adjustSeek(
                  event.nativeEvent.actionName as 'increment' | 'decrement',
                )
              }
              onLayout={(event: LayoutChangeEvent) => {
                trackWidth.current = event.nativeEvent.layout.width;
              }}
              onPress={(event) => seekFromX(event.nativeEvent.locationX)}
              style={styles.seekTouch}
            >
              <View
                style={[
                  styles.track,
                  { backgroundColor: t.colors.surfaceMuted },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor: t.colors.brand,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.thumb,
                    {
                      left: `${progress * 100}%`,
                      backgroundColor: canSeek
                        ? t.colors.brand
                        : t.colors.inkMuted,
                    },
                  ]}
                />
              </View>
            </Pressable>
            <View accessible={false} style={styles.timeRow}>
              <Typography variant="caption">
                {clock(playback.position)}
              </Typography>
              <Typography variant="caption" color={t.colors.inkMuted}>
                −{clock(Math.max(playback.duration - playback.position, 0))} ·{' '}
                {clock(playback.duration)}
              </Typography>
            </View>
          </View>

          <View style={styles.transport}>
            <Control
              icon="play-back"
              label="၁၅ စက္ကန့် နောက်သို့"
              disabled={!canSeek}
              onPress={playback.skipBack}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'ခေတ္တရပ်မည်' : 'ဖွင့်မည်'}
              accessibilityState={{
                disabled: !hasMedia || playback.phase === 'loading',
              }}
              disabled={!hasMedia || playback.phase === 'loading'}
              onPress={() =>
                void (playing ? playback.pause() : playback.play())
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              {busy ? (
                <View
                  style={[
                    styles.mainControl,
                    { backgroundColor: t.colors.brand },
                  ]}
                >
                  <ActivityIndicator color={t.colors.onBrand} />
                </View>
              ) : (
                <Ionicons
                  name={playing ? 'pause-circle' : 'play-circle'}
                  size={76}
                  color={hasMedia ? t.colors.brand : t.colors.inkMuted}
                />
              )}
            </Pressable>
            <Control
              icon="play-forward"
              label="၁၅ စက္ကန့် ရှေ့သို့"
              disabled={!canSeek}
              onPress={playback.skipForward}
            />
          </View>

          <View
            style={styles.rates}
            accessibilityLabel="ဖွင့်နှုန်း ရွေးချယ်ရန်"
            accessibilityRole="radiogroup"
          >
            {PLAYBACK_RATES.map((rate) => (
              <Pressable
                key={rate}
                accessibilityRole="radio"
                accessibilityLabel={`${rate} ဆ နှုန်း`}
                accessibilityState={{
                  selected: playback.rate === rate,
                  disabled: !hasMedia,
                }}
                disabled={!hasMedia}
                onPress={() => void playback.setRate(rate)}
                style={[
                  styles.rate,
                  {
                    borderColor:
                      playback.rate === rate ? t.colors.brand : t.colors.border,
                    backgroundColor:
                      playback.rate === rate
                        ? t.colors.brandSoft
                        : t.colors.surface,
                  },
                ]}
              >
                <Typography variant="label">{rate}×</Typography>
              </Pressable>
            ))}
          </View>

          <View style={[styles.actions, { borderTopColor: t.colors.border }]}>
            <Action
              icon={saved ? 'bookmark' : 'bookmark-outline'}
              label={saved ? 'သိမ်းပြီး' : 'သိမ်းမည်'}
              active={saved}
              disabled={!item?.id}
              onPress={() => setSaved(!saved)}
            />
            <Action
              icon="download-outline"
              label="ဒေါင်းလုဒ်"
              disabled={!item?.uri}
              onPress={() =>
                item?.uri &&
                void Linking.openURL(item.uri).catch(() =>
                  Alert.alert('ဒေါင်းလုဒ် မရပါ'),
                )
              }
            />
            <Action
              icon={queued ? 'list' : 'list-outline'}
              label={queued ? 'တန်းစီပြီး' : 'တန်းစီမည်'}
              active={queued}
              disabled={!item?.id}
              onPress={() => setQueued(!queued)}
            />
          </View>
        </View>
      </ScrollView>
    </Container>
  );
}

function Control({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      })}
    >
      <Ionicons name={icon} size={34} color={t.colors.ink} />
    </Pressable>
  );
}

function Action({
  icon,
  label,
  active = false,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 },
      ]}
    >
      <Ionicons
        name={icon}
        size={23}
        color={active ? t.colors.brand : t.colors.ink}
      />
      <Typography
        variant="caption"
        color={active ? t.colors.brand : t.colors.ink}
      >
        {label}
      </Typography>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { paddingHorizontal: 16 },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { gap: 24, alignItems: 'center' },
  landscapeContent: { flexDirection: 'row', alignItems: 'flex-start' },
  artworkWrap: {
    width: '100%',
    maxWidth: 440,
    aspectRatio: 16 / 10,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeArtwork: { width: '40%', marginTop: 8 },
  artwork: { width: '100%', height: '100%' },
  playerColumn: { width: '100%', maxWidth: 560, flex: 1, minWidth: 0 },
  notice: {
    padding: 12,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  noticeText: { flex: 1 },
  status: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekTouch: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 999 },
  fill: { height: '100%', borderRadius: 999 },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    top: -7,
    marginLeft: -10,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
  },
  mainControl: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
  rates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  rate: {
    minWidth: 52,
    minHeight: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
  action: {
    minWidth: 78,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
