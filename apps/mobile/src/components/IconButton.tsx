import { Pressable, type PressableProps } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme';

export function IconButton({
  label,
  children,
  size = 48,
  ...props
}: Omit<PressableProps, 'children'> & {
  label: string;
  children: ReactNode;
  size?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      {...props}
      style={({ pressed }) => [
        {
          width: Math.max(44, size),
          height: Math.max(44, size),
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: t.radius.pill,
          backgroundColor: pressed
            ? t.colors.surfaceMuted
            : t.colors.transparent,
        },
        typeof props.style === 'function'
          ? props.style({ pressed })
          : props.style,
      ]}
    >
      {children}
    </Pressable>
  );
}
