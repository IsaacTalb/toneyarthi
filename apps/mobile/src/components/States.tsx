import { Pressable, View } from 'react-native';
import { Typography } from './Typography';
import { LoadingSkeleton } from './LoadingSkeleton';
import { useTheme } from '../theme';
import { screenStateContent } from './screenStateContent';
export { screenStateContent, type ScreenStateKind } from './screenStateContent';

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
        flexGrow: 1,
        justifyContent: 'center',
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
    <State
      error
      title={props.title ?? screenStateContent('error').title}
      {...props}
    />
  );
}
export function EmptyState(props: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <State
      title={props.title ?? screenStateContent('empty').title}
      {...props}
    />
  );
}

export function OfflineState(props: {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <State
      title={screenStateContent('offline').title}
      message={props.message ?? screenStateContent('offline').message}
      {...props}
    />
  );
}

export function LoadingState({
  label = screenStateContent('loading').message,
}: {
  label?: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ flex: 1, justifyContent: 'center', gap: t.spacing.md }}
    >
      <LoadingSkeleton height={120} />
      <LoadingSkeleton height={120} />
    </View>
  );
}
