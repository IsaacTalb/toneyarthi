import { ScrollView, View, useWindowDimensions } from 'react-native';
import {
  ArticleCard,
  CategoryChip,
  Container,
  Divider,
  LoadingSkeleton,
  SectionHeader,
  Typography,
} from '../src/components';
import { useTheme } from '../src/theme';

/** A live component gallery: useful at 320–430pt widths and with system text scaling up to 200%. */
export default function HomeScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  return (
    <Container>
      <ScrollView
        contentContainerStyle={{
          paddingTop: t.spacing.lg,
          paddingBottom: t.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Typography
          variant="caption"
          color={t.colors.brand}
          style={{ fontWeight: '700', letterSpacing: 1.2 }}
        >
          TONE YAR THI
        </Typography>
        <Typography
          accessibilityRole="header"
          variant="display"
          style={{ marginTop: t.spacing.xs }}
        >
          မင်္ဂလာပါ
        </Typography>
        <Typography color={t.colors.inkMuted}>
          မြန်မာဘာသာနဲ့ သင့်နေ့စဉ်အသံအဖော်
        </Typography>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: t.spacing.xs,
            paddingVertical: t.spacing.lg,
          }}
        >
          <CategoryChip label="နောက်ဆုံးရ" selected />
          <CategoryChip label="ပြည်တွင်း" />
          <CategoryChip label="နည်းပညာ" />
          <CategoryChip label="အားကစား" />
        </ScrollView>
        <Divider />
        <SectionHeader
          title="ယနေ့အတွက် ရွေးချယ်မှု"
          action={
            <Typography variant="label" color={t.colors.brand}>
              {width < 360 ? 'အားလုံး' : 'အားလုံးကြည့်ရန်'}
            </Typography>
          }
        />
        <View style={{ gap: t.spacing.md }}>
          <ArticleCard
            category="ပြည်တွင်း"
            title="နေ့စဉ်သိသင့်သည့် သတင်းအကျဉ်း"
            summary="အရေးကြီးသတင်းများကို ဖတ်ရလွယ်ကူသော မြန်မာဘာသာဖြင့် စုစည်းတင်ပြထားပါသည်။"
            meta="၅ မိနစ် • ယနေ့"
          />
          <LoadingSkeleton height={120} />
        </View>
      </ScrollView>
    </Container>
  );
}
