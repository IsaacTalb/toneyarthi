import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

export type TypographyVariant =
  'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

export function Typography({
  variant = 'body',
  color,
  style,
  ...props
}: TextProps & { variant?: TypographyVariant; color?: string }) {
  const theme = useTheme();
  return (
    <Text
      allowFontScaling
      {...props}
      style={[
        {
          color: color ?? theme.colors.ink,
          fontFamily: theme.typography.fontFamily,
        },
        theme.typography.scale[variant] as TextStyle,
        style,
      ]}
    />
  );
}
