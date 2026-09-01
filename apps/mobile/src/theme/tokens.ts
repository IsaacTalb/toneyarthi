import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const palette = {
  ink: '#18251D',
  inkMuted: '#58655D',
  canvas: '#F8F6F0',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEEE8',
  brand: '#315C3D',
  brandSoft: '#DDEBDD',
  border: '#DADDD7',
  danger: '#A33A32',
  dangerSoft: '#FBE8E5',
  onBrand: '#FFFFFF',
  transparent: 'transparent',
} as const;

export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
export const radius = { none: 0, sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const motion = { quick: 120, standard: 220, deliberate: 360 } as const;

// Both platform system stacks include a maintained Burmese Unicode fallback.
export const fontFamily = Platform.select({
  android: 'sans-serif',
  ios: 'System',
  default: 'system-ui, "Noto Sans Myanmar", sans-serif',
});

export const typeScale = {
  display: { fontSize: 36, lineHeight: 54, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 38, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 31, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 28, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 20, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

export const elevation = {
  none: {} satisfies ViewStyle,
  // Borders already separate cards from the canvas. Keeping this token flat
  // avoids a second, inconsistent depth cue (and cheaper GPU work in lists).
  card: {} satisfies ViewStyle,
} as const;

export interface AppTheme {
  isDark: boolean;
  colors: { [Key in keyof typeof palette]: string };
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
  typography: { fontFamily: string | undefined; scale: typeof typeScale };
}

export const lightTheme: AppTheme = {
  isDark: false,
  colors: palette,
  spacing,
  radius,
  elevation,
  motion,
  typography: { fontFamily, scale: typeScale },
} as const;
