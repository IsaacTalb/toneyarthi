import { Ionicons } from '@expo/vector-icons';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Container, Typography } from '../src/components';
import { useDownloads } from '../src/downloads';
import { useTheme } from '../src/theme';

const sizeLabel = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

export default function DownloadsScreen() {
  const t = useTheme();
  const { records, ready, remove } = useDownloads();
  return (
    <Container edges={['left', 'right']}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingVertical: t.spacing.md,
          gap: t.spacing.sm,
        }}
        ListHeaderComponent={
          records.length ? (
            <Typography
              color={t.colors.inkMuted}
              style={{ marginBottom: t.spacing.sm }}
            >
              အော့ဖ်လိုင်းတွင် နားထောင်နိုင်သော အသံဖိုင်များ
            </Typography>
          ) : null
        }
        ListEmptyComponent={
          <View
            style={{
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingTop: t.spacing.xxl,
            }}
          >
            <Ionicons
              name="cloud-download-outline"
              size={48}
              color={t.colors.brand}
            />
            <Typography variant="heading">
              {ready ? 'ဒေါင်းလုဒ် မရှိသေးပါ' : 'စစ်ဆေးနေသည်…'}
            </Typography>
            {ready ? (
              <Typography
                color={t.colors.inkMuted}
                style={{ textAlign: 'center' }}
              >
                သတင်းစာမျက်နှာမှ အသံဖိုင်များကို သိမ်းနိုင်ပါသည်။
              </Typography>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              padding: t.spacing.md,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.surface,
            }}
          >
            <Ionicons name="musical-note" size={24} color={t.colors.brand} />
            <View style={{ flex: 1 }}>
              <Typography variant="label" numberOfLines={2}>
                {item.title}
              </Typography>
              <Typography variant="caption" color={t.colors.inkMuted}>
                {sizeLabel(item.size)}
              </Typography>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ဒေါင်းလုဒ် ဖျက်မည်"
              hitSlop={10}
              onPress={() =>
                Alert.alert('ဒေါင်းလုဒ် ဖျက်မည်လား', item.title, [
                  { text: 'မဖျက်ပါ', style: 'cancel' },
                  {
                    text: 'ဖျက်မည်',
                    style: 'destructive',
                    onPress: () => void remove(item.id),
                  },
                ])
              }
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={t.colors.danger}
              />
            </Pressable>
          </View>
        )}
      />
    </Container>
  );
}
