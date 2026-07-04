'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { setGlobalTheme } from '@atlaskit/tokens';

/**
 * Syncs `next-themes` (which drives Tailwind's `.dark` class + our
 * `--trella-*` CSS variables) with `@atlaskit/tokens`, so Atlaskit
 * components repaint alongside our custom styles when the user toggles.
 */
function AtlaskitThemeBridge() {
  const { resolvedTheme, theme } = useTheme();

  React.useEffect(() => {
    const mode: 'light' | 'dark' | 'auto' =
      theme === 'system' ? 'auto' : ((resolvedTheme as 'light' | 'dark') ?? 'light');
    setGlobalTheme({ colorMode: mode, light: 'light', dark: 'dark' }).catch(() => {
      // setGlobalTheme can throw when tokens aren't yet mounted; safe to swallow.
    });
  }, [resolvedTheme, theme]);

  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AtlaskitThemeBridge />
      {children}
    </NextThemesProvider>
  );
}
