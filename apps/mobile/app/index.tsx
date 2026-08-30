import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import type { Category } from '@toneyarthi/types';

const categoryAccent = {
  local: '#31523A',
} satisfies Partial<Record<Category, string>>;

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>TONE YAR THI</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          တုန်းရာသီ
        </Text>
        <Text style={styles.subtitle}>မြန်မာဘာသာနဲ့ သင့်နေ့စဉ်အသံအဖော်</Text>
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>မင်္ဂလာပါ</Text>
          <Text style={styles.cardTitle}>စတင်ဖို့ အဆင်သင့်ဖြစ်ပါပြီ</Text>
          <Text style={styles.cardBody}>
            နောက်ဆုံးရ အကြောင်းအရာတွေကို မြန်မာလို ဖတ်ရှုနားဆင်နိုင်မယ့် နေရာပါ။
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F3E8',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#D9E8D1',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  badgeText: {
    color: '#31523A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: 28,
    color: '#20372A',
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 66,
  },
  subtitle: {
    marginTop: 8,
    color: '#5D6B61',
    fontSize: 18,
    lineHeight: 32,
  },
  card: {
    marginTop: 48,
    borderRadius: 28,
    backgroundColor: categoryAccent.local,
    padding: 28,
  },
  cardEyebrow: {
    color: '#CFE2C6',
    fontSize: 15,
    lineHeight: 26,
  },
  cardTitle: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 39,
  },
  cardBody: {
    marginTop: 14,
    color: '#E7EEE9',
    fontSize: 16,
    lineHeight: 30,
  },
});
