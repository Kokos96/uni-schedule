import { useEffect, useState } from 'react';
import { ThemeMode } from '../types';

export type ResolvedTheme = 'dark' | 'light';

const DARK_THEME_COLOR = '#242522';
const LIGHT_THEME_COLOR = '#F2F0EB';

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function updateThemeColorMeta(theme: ThemeMode, resolvedTheme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;

  const activeColor = resolvedTheme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  const metaTags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');

  if (metaTags.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = activeColor;
    document.head.appendChild(meta);
    return;
  }

  metaTags.forEach((meta) => {
    if (theme === 'system') {
      const media = meta.getAttribute('media') ?? '';
      if (media.includes('light')) {
        meta.content = LIGHT_THEME_COLOR;
      } else if (media.includes('dark')) {
        meta.content = DARK_THEME_COLOR;
      } else {
        meta.content = activeColor;
      }
    } else {
      meta.content = activeColor;
    }
  });
}

export interface UseThemeResult {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
}

/**
 * Sync user theme preference ('dark' | 'light' | 'system') to documentElement
 * (`data-theme`, `.dark` class, `colorScheme`) and `<meta name="theme-color">`.
 */
export const useTheme = (theme: ThemeMode = 'dark'): UseThemeResult => {
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(getSystemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;

    updateThemeColorMeta(theme, resolvedTheme);
  }, [theme, resolvedTheme]);

  return {
    theme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
  };
};
