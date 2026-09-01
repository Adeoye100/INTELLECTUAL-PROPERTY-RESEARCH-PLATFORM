import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "forge-theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  } catch {
    // A private browsing policy may block storage; system preference still works.
  }

  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const isDark = theme === "dark";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.dataset.theme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme still applies for the current page when persistence is unavailable.
    }
  }, [isDark, theme]);

  return (
    <button
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/8 text-white transition hover:border-white/40 hover:bg-white/14"
    >
      {isDark ? (
        <SunIcon
          className="h-[18px] w-[18px] transition-transform group-hover:rotate-12"
          aria-hidden="true"
        />
      ) : (
        <MoonIcon
          className="h-[18px] w-[18px] transition-transform group-hover:-rotate-12"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
