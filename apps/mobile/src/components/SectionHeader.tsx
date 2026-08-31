import { View } from 'react-native';
import type { ReactNode } from 'react';
import { Typography } from './Typography';
import { useTheme } from '../theme';
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.spacing.sm,
      }}
    >
      <Typography
        accessibilityRole="header"
        variant="heading"
        style={{ flex: 1 }}
      >
        {title}
      </Typography>
      {action}
    </View>
  );
}
