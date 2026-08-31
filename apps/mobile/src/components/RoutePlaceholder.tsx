import { Container } from './Container';
import { Typography } from './Typography';
import { useTheme } from '../theme';

export function RoutePlaceholder({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  const theme = useTheme();
  return (
    <Container
      edges={['right', 'bottom', 'left']}
      style={{ paddingTop: theme.spacing.lg }}
    >
      <Typography accessibilityRole="header" variant="title">
        {title}
      </Typography>
      {detail ? (
        <Typography
          color={theme.colors.inkMuted}
          style={{ marginTop: theme.spacing.sm }}
        >
          {detail}
        </Typography>
      ) : null}
    </Container>
  );
}
