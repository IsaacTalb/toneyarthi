import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export function Container({
  children,
  style,
  edges = ['top', 'right', 'bottom', 'left'],
  ...props
}: ViewProps & { edges?: Edge[] }) {
  const theme = useTheme();
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
            maxWidth: 680,
            alignSelf: 'center',
            flex: 1,
            paddingHorizontal: theme.spacing.md,
          },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
