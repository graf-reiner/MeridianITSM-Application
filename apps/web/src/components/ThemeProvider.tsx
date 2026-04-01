'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match?.[1];
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = name + '=' + value + ';expires=' + expires + ';path=/;SameSite=Lax';
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

export default function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (initialTheme) return initialTheme;
    const cookie = getCookie('meridian-theme-pref');
    return (cookie as Theme) || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === 'system') return getSystemTheme();
    return theme;
  });

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
    setResolvedTheme(resolved);
    applyTheme(resolved);
    setCookie('meridian-theme-pref', newTheme);
    setCookie('meridian-theme', resolved);

    fetch('/api/v1/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ themePreference: newTheme }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        applyTheme(resolved);
        setCookie('meridian-theme', resolved);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
