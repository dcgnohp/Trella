'use client';
import AppProvider, { useSetColorMode } from '@atlaskit/app-provider';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

function ColorModeBridge() {
  const { resolvedTheme } = useTheme();
  const setColorMode = useSetColorMode();

  useEffect(() => {
    setColorMode(resolvedTheme === 'dark' ? 'dark' : 'light');
  }, [resolvedTheme, setColorMode]);

  return null;
}

export default function AdsProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider defaultColorMode="light">
      <ColorModeBridge />
      {children}
    </AppProvider>
  );
}
