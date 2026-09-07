import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { cn } from '../lib/utils';

type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'forge-theme';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  } catch {
    // Storage unavailable
  }

  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export type ThemeToggleProps = {
  surface?: 'landing' | 'app';
  className?: string;
};

export function ThemeToggle({ surface = 'landing', className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.dataset.theme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable
    }
  }, [isDark, theme]);

  const surfaceClasses =
    surface === 'app'
      ? 'border border-border bg-card text-card-foreground hover:bg-muted'
      : 'border border-white/20 bg-white/8 text-white hover:border-white/40 hover:bg-white/14';

  return (
    <button
      type="button"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'group inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        surfaceClasses,
        className
      )}
    >
      {isDark ? (
        <SunIcon
          className="h-4 w-4 transition-transform group-hover:rotate-12"
          aria-hidden="true"
        />
      ) : (
        <MoonIcon
          className="h-4 w-4 transition-transform group-hover:-rotate-12"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
