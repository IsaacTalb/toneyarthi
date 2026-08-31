import { Pressable, Switch, View } from 'react-native';
import { Container, Typography } from '../src/components';
import { useTheme } from '../src/theme';
import { useNotifications } from '../src/notifications';

export default function SettingsScreen() {
  const t = useTheme();
  const notifications = useNotifications();
  return (
    <Container edges={['left', 'right']} style={{ paddingTop: t.spacing.lg }}>
      <View style={{ gap: t.spacing.md }}>
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
        <View
          style={{
            padding: t.spacing.md,
            gap: t.spacing.md,
            borderRadius: t.radius.md,
            backgroundColor: t.colors.surface,
          }}
        >
          <Typography variant="label">အသိပေးချက်များ</Typography>
          {notifications.permission !== 'granted' && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void notifications.requestPermission()}
              style={{ paddingVertical: t.spacing.sm }}
            >
              <Typography color={t.colors.accent}>
                အသိပေးချက်များ ဖွင့်မည်
              </Typography>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Typography style={{ flex: 1 }}>Breaking news</Typography>
            <Switch
              value={notifications.preferences.breakingNews}
              onValueChange={(breakingNews) =>
                void notifications.updatePreferences({
                  ...notifications.preferences,
                  breakingNews,
                })
              }
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Typography style={{ flex: 1 }}>Briefings</Typography>
            <Switch
              value={notifications.preferences.briefings}
              onValueChange={(briefings) =>
                void notifications.updatePreferences({
                  ...notifications.preferences,
                  briefings,
                })
              }
            />
          </View>
          <Typography variant="caption" color={t.colors.inkMuted}>
            အမျိုးအစားများကို မူလအတိုင်း ပိတ်ထားသည်။ ရွေးချယ်ထားသော
            အကြောင်းအရာများသာ ပို့ပါမည်။
          </Typography>
        </View>
      </View>
    </Container>
  );
}
