'use client';
import AppProvider from '@atlaskit/app-provider';

export default function AdsProvider({ children }: { children: React.ReactNode }) {
  // defaultColorMode: 'auto' lets Atlaskit follow prefers-color-scheme initially;
  // <AtlaskitThemeBridge/> then keeps it in sync with next-themes when the user
  // switches via the toggle.
  return <AppProvider defaultColorMode="auto">{children}</AppProvider>;
}
