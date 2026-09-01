import { View, useWindowDimensions, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export function Container({
  children,
  style,
  edges = ['top', 'right', 'bottom', 'left'],
  ...props
}: ViewProps & { edges?: Edge[] }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const gutter = width >= 768 ? theme.spacing.lg : theme.spacing.md;
  return (
    <SafeAreaView
      edges={edges}
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
    >
      <View
        {...props}
        style={[
          {
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
            flex: 1,
            paddingHorizontal: gutter,
          },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
