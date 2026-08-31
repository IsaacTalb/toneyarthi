import { Pressable, View, type PressableProps } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '../theme';

export function CategoryChip({
  label,
  selected = false,
  ...props
}: Omit<PressableProps, 'children'> & { label: string; selected?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      {...props}
      style={({ pressed }) => [
        {
          minHeight: 44,
          justifyContent: 'center',
          opacity: pressed ? 0.72 : 1,
        },
        typeof props.style === 'function'
          ? props.style({ pressed })
          : props.style,
      ]}
    >
      <View
        style={{
          borderRadius: t.radius.pill,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.xs,
          backgroundColor: selected ? t.colors.brand : t.colors.brandSoft,
        }}
      >
        <Typography
          variant="label"
          color={selected ? t.colors.onBrand : t.colors.brand}
        >
          {label}
        </Typography>
      </View>
    </Pressable>
  );
}
