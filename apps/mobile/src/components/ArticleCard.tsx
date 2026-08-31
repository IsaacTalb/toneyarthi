import { Pressable, type PressableProps } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '../theme';

export function ArticleCard({
  title,
  summary,
  category,
  meta,
  ...props
}: Omit<PressableProps, 'children'> & {
  title: string;
  summary?: string;
  category: string;
  meta?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category}: ${title}`}
      {...props}
      style={({ pressed }) => [
        {
          minHeight: 44,
          borderRadius: t.radius.lg,
          padding: t.spacing.lg,
          backgroundColor: t.colors.surface,
          borderWidth: 1,
          borderColor: t.colors.border,
          opacity: pressed ? 0.78 : 1,
        },
        t.elevation.card,
        typeof props.style === 'function'
          ? props.style({ pressed })
          : props.style,
      ]}
    >
      <Typography
        variant="caption"
        color={t.colors.brand}
        style={{ fontWeight: '700' }}
      >
        {category}
      </Typography>
      <Typography variant="heading" style={{ marginTop: t.spacing.xs }}>
        {title}
      </Typography>
      {summary ? (
        <Typography
          color={t.colors.inkMuted}
          numberOfLines={3}
          style={{ marginTop: t.spacing.xs }}
        >
          {summary}
        </Typography>
      ) : null}
      {meta ? (
        <Typography
          variant="caption"
          color={t.colors.inkMuted}
          style={{ marginTop: t.spacing.md }}
        >
          {meta}
        </Typography>
      ) : null}
    </Pressable>
  );
}
