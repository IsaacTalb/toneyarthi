import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Container, Typography } from '../src/components';
import { PLAYBACK_RATES, usePlayback } from '../src/playback';
import { useTheme } from '../src/theme';

const clock = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export default function PlayerScreen() {
  const playback = usePlayback();
  const t = useTheme();
  const progress = playback.duration
    ? playback.position / playback.duration
    : 0;
  return (
    <Container style={{ justifyContent: 'center', gap: t.spacing.lg }}>
      <Stack.Screen options={{ headerShown: true, title: 'Now Playing' }} />
      <Typography variant="title">
        {playback.item?.title ?? 'No audio selected'}
      </Typography>
      {playback.error ? (
        <Typography color={t.colors.danger}>{playback.error}</Typography>
      ) : null}
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Playback progress"
        onPress={(event) =>
          playback.seek((event.nativeEvent.locationX / 300) * playback.duration)
        }
        style={{
          height: 12,
          borderRadius: 6,
          backgroundColor: t.colors.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            backgroundColor: t.colors.brand,
          }}
        />
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Typography>{clock(playback.position)}</Typography>
        <Typography>{clock(playback.duration)}</Typography>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: t.spacing.lg,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip back 15 seconds"
          onPress={playback.skipBack}
        >
          <Ionicons name="play-back" size={34} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playback.phase === 'playing' ? 'Pause' : 'Play'}
          onPress={() =>
            void (playback.phase === 'playing'
              ? playback.pause()
              : playback.play())
          }
        >
          <Ionicons
            name={playback.phase === 'playing' ? 'pause-circle' : 'play-circle'}
            size={72}
            color={t.colors.brand}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip forward 15 seconds"
          onPress={playback.skipForward}
        >
          <Ionicons name="play-forward" size={34} />
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: t.spacing.xs,
        }}
      >
        {PLAYBACK_RATES.map((rate) => (
          <Pressable
            key={rate}
            onPress={() => void playback.setRate(rate)}
            style={{
              padding: t.spacing.sm,
              borderRadius: t.radius.pill,
              backgroundColor:
                playback.rate === rate
                  ? t.colors.brandSoft
                  : t.colors.surfaceMuted,
            }}
          >
            <Typography variant="label">{rate}x</Typography>
          </Pressable>
        ))}
      </View>
    </Container>
  );
}
