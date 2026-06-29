'use client';
import AppProvider from '@atlaskit/app-provider';

export default function AdsProvider({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
