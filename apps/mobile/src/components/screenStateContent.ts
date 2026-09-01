export type ScreenStateKind = 'empty' | 'error' | 'offline' | 'loading';

const content = {
  empty: { title: 'မတွေ့ရှိသေးပါ', message: '' },
  error: { title: 'တစ်ခုခု မှားယွင်းနေပါသည်', message: '' },
  offline: {
    title: 'အင်တာနက် မချိတ်ဆက်ထားပါ',
    message: 'ချိတ်ဆက်မှုကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။',
  },
  loading: { title: '', message: 'စစ်ဆေးနေသည်…' },
} as const satisfies Record<
  ScreenStateKind,
  { title: string; message: string }
>;

export const screenStateContent = (kind: ScreenStateKind) => content[kind];
