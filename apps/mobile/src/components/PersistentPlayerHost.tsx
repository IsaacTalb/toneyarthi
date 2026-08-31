import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaybackController, usePlaybackSelector } from '../playback';
import { useTheme } from '../theme';
import { Typography } from './Typography';

export const MINI_PLAYER_HEIGHT = 68;

function MiniProgress() {
  const position = usePlaybackSelector((state) => state.position);
  const duration = usePlaybackSelector((state) => state.duration);
  const t = useTheme();
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  return (
    <View style={[styles.track, { backgroundColor: t.colors.surfaceMuted }]}>
      <View
        testID="mini-player-progress"
        style={{
          width: `${progress * 100}%`,
          height: '100%',
          backgroundColor: t.colors.brand,
        }}
      />
    </View>
  );
}

function MiniToggle() {
  const phase = usePlaybackSelector((state) => state.phase);
  const controller = usePlaybackController();
  const t = useTheme();
  const playing = phase === 'playing';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'ခေတ္တရပ်မည်' : 'ဖွင့်မည်'}
      disabled={phase === 'loading'}
      hitSlop={10}
      onPress={(event) => {
        event.stopPropagation();
        void (playing ? controller.pause() : controller.play());
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <Ionicons
        name={playing ? 'pause-circle' : 'play-circle'}
        size={42}
        color={t.colors.brand}
      />
    </Pressable>
  );
}

/** Persistent root overlay; its small children independently observe live ticks. */
export function PersistentPlayerHost() {
  const selectedItem = usePlaybackSelector((state) => state.item);
  const [presentedItem, setPresentedItem] = useState(selectedItem);
  const [reduceMotion, setReduceMotion] = useState(false);
  const animation = useRef(new Animated.Value(selectedItem ? 1 : 0)).current;
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const onTabs = segments[0] === '(tabs)';
  const onFullPlayer = segments[0] === 'player';

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (selectedItem) setPresentedItem(selectedItem);
    const target = selectedItem && !onFullPlayer ? 1 : 0;
    Animated.timing(animation, {
      toValue: target,
      duration: reduceMotion ? 0 : t.motion.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && target === 0 && !selectedItem) setPresentedItem(null);
    });
  }, [animation, onFullPlayer, reduceMotion, selectedItem, t.motion.standard]);

  if (!presentedItem || onFullPlayer) return null;
  const tabBarHeight = onTabs ? (Platform.OS === 'ios' ? 49 : 56) : 0;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.position,
        {
          bottom: insets.bottom + tabBarHeight + t.spacing.xs,
          opacity: animation,
          transform: [
            {
              translateY: animation.interpolate({
                inputRange: [0, 1],
                outputRange: [reduceMotion ? 0 : 8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${presentedItem.title}၊ ပလေယာအပြည့် ဖွင့်မည်`}
        onPress={() => router.push('/player')}
        style={[
          styles.card,
          t.elevation.card,
          { backgroundColor: t.colors.surface, borderColor: t.colors.border },
        ]}
      >
        {presentedItem.artworkUri ? (
          <Image
            source={{ uri: presentedItem.artworkUri }}
            accessibilityIgnoresInvertColors
            style={styles.artwork}
          />
        ) : (
          <View
            style={[
              styles.artwork,
              styles.placeholder,
              { backgroundColor: t.colors.brandSoft },
            ]}
          >
            <Ionicons
              name="newspaper-outline"
              size={24}
              color={t.colors.brand}
            />
          </View>
        )}
        <View style={styles.copy}>
          <Typography
            variant="caption"
            color={t.colors.inkMuted}
            numberOfLines={1}
          >
            ယခု နားဆင်နေသည်
          </Typography>
          <Typography variant="label" numberOfLines={1}>
            {presentedItem.title}
          </Typography>
        </View>
        <MiniToggle />
        <MiniProgress />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  card: {
    height: MINI_PLAYER_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  artwork: { width: 48, height: 48, borderRadius: 9 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  track: { position: 'absolute', height: 2, left: 0, right: 0, bottom: 0 },
});
