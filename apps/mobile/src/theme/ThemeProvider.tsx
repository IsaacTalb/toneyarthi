import { createContext, useContext, type PropsWithChildren } from 'react';
import { lightTheme, type AppTheme } from './tokens';

const ThemeContext = createContext<AppTheme>(lightTheme);

export function ThemeProvider({
  children,
  theme = lightTheme,
}: PropsWithChildren<{ theme?: AppTheme }>) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
