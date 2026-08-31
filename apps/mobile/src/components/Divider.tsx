import { View, type ViewProps } from 'react-native';
import { useTheme } from '../theme';
export function Divider({ style, ...props }: ViewProps) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...props}
      style={[{ height: 1, backgroundColor: t.colors.border }, style]}
    />
  );
}
