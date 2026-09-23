'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';

/**
 * Compact icon-only theme toggle for placement in the top navbar.
 * Clicking cycles Light → Dark → System.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — server renders the same fallback icon.
  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 4, border: 'none',
          background: 'transparent', cursor: 'pointer', color: 'var(--trella-text-subtle)',
        }}
      >
        <Sun size={16} />
      </button>
    );
  }

  const cycle = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const current = (theme as 'light' | 'dark' | 'system') ?? 'system';
    const next = order[(order.indexOf(current) + 1) % order.length];
    setTheme(next);
  };

  const icon =
    theme === 'system'
      ? <Monitor size={16} />
      : resolvedTheme === 'dark'
        ? <Moon size={16} />
        : <Sun size={16} />;

  const label =
    theme === 'system' ? 'Theme: System (click to change)' :
    resolvedTheme === 'dark' ? 'Theme: Dark (click to change)' :
    'Theme: Light (click to change)';

  return (
    <button
      onClick={cycle}
      aria-label={label}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 4, border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: 'var(--trella-text-subtle)',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--trella-surface-hover)';
        e.currentTarget.style.color = 'var(--trella-text)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--trella-text-subtle)';
      }}
    >
      {icon}
    </button>
  );
}

/**
 * Full radio-style picker for Settings menus — Light / Dark / System.
 */
export function ThemeMenu({ onSelect }: { onSelect?: () => void }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const options: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }> = [
    { value: 'light', label: 'Light', icon: <Sun size={14} /> },
    { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
    { value: 'system', label: 'System', icon: <Monitor size={14} /> },
  ];

  const currentTheme = mounted ? (theme ?? 'system') : 'system';

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        padding: '6px 12px 4px',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: 'var(--trella-text-subtlest)',
      }}>
        Theme
      </div>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => { setTheme(o.value); onSelect?.(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '8px 12px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, textAlign: 'left',
            color: 'var(--trella-text)',
            fontWeight: currentTheme === o.value ? 600 : 400,
            backgroundColor: currentTheme === o.value ? 'var(--trella-surface-selected)' : 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--trella-surface-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = currentTheme === o.value ? 'var(--trella-surface-selected)' : 'transparent')}
        >
          <span style={{ color: 'var(--trella-text-subtle)', display: 'flex' }}>{o.icon}</span>
          {o.label}
          {currentTheme === o.value && (
            <span style={{ marginLeft: 'auto', color: 'var(--trella-brand)', fontSize: 14 }}>✓</span>
          )}
        </button>
      ))}
    </div>
  );
}
