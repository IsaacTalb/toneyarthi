import { Pressable, View } from 'react-native';
import { Typography } from './Typography';
import { LoadingSkeleton } from './LoadingSkeleton';
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

export function OfflineState(props: {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <State
      title="အင်တာနက် မချိတ်ဆက်ထားပါ"
      message={props.message ?? 'ချိတ်ဆက်မှုကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။'}
      {...props}
    />
  );
}

export function LoadingState({ label = 'စစ်ဆေးနေသည်…' }: { label?: string }) {
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
