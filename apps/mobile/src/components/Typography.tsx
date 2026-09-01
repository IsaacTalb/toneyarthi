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
      // `simple` delegates breaks to the glyph run and is more reliable for
      // Myanmar text than Android's Latin-oriented balanced strategies.
      textBreakStrategy="simple"
      lineBreakStrategyIOS="standard"
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
