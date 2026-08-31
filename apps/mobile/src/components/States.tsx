import { Pressable, View } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '../theme';

function State({
  title,
  message,
  actionLabel,
  onAction,
  error,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  error?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole={error ? 'alert' : undefined}
      style={{
        alignItems: 'center',
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.xxl,
      }}
    >
      <Typography
        variant="heading"
        style={{ textAlign: 'center' }}
        color={error ? t.colors.danger : t.colors.ink}
      >
        {title}
      </Typography>
      <Typography
        color={t.colors.inkMuted}
        style={{ marginTop: t.spacing.xs, textAlign: 'center' }}
      >
        {message}
      </Typography>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => ({
            minHeight: 48,
            justifyContent: 'center',
            marginTop: t.spacing.lg,
            paddingHorizontal: t.spacing.lg,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.brand,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Typography variant="label" color={t.colors.onBrand}>
            {actionLabel}
          </Typography>
        </Pressable>
      ) : null}
    </View>
  );
}
export function ErrorState(props: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <State error title={props.title ?? 'တစ်ခုခု မှားယွင်းနေပါသည်'} {...props} />
  );
}
export function EmptyState(props: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return <State title={props.title ?? 'မတွေ့ရှိသေးပါ'} {...props} />;
}
