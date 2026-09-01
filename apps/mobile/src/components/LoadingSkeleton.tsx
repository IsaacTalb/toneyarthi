import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';

export function LoadingSkeleton({
  width = '100%',
  height = 18,
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (mounted && !reduced) {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.8,
              duration: t.motion.deliberate,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.45,
              duration: t.motion.deliberate,
              useNativeDriver: true,
            }),
          ]),
        );
        loop.start();
      }
    });
    return () => {
      mounted = false;
      loop?.stop();
    };
  }, [opacity, t.motion.deliberate]);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          {
            width,
            height,
            opacity,
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.surfaceMuted,
          },
          style,
        ]}
      />
    </View>
  );
}
