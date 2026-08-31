import { Switch, View } from 'react-native';
import { Container, Typography } from '../src/components';
import { useTheme } from '../src/theme';

export default function SettingsScreen() {
  const t = useTheme();
  return (
    <Container edges={['left', 'right']} style={{ paddingTop: t.spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          padding: t.spacing.md,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
        }}
      >
        <View style={{ flex: 1, gap: t.spacing.xxs }}>
          <Typography variant="label">
            Wi-Fi ဖြင့်သာ အလိုအလျောက် ဒေါင်းလုဒ်လုပ်မည်
          </Typography>
          <Typography variant="caption" color={t.colors.inkMuted}>
            မကြာမီ ရရှိနိုင်မည်
          </Typography>
        </View>
        <Switch
          value={false}
          disabled
          accessibilityLabel="Wi-Fi only automatic downloads, coming soon"
        />
      </View>
    </Container>
  );
}
