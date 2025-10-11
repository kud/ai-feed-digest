"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeToggleProps {
  storageKey: string;
}

const LABELS: Record<Theme, string> = {
  light: "Switch to dark theme",
  dark: "Switch to light theme"
};

export function ThemeToggle({ storageKey }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const preferred: Theme = stored === "dark" || stored === "light" ? stored : prefersDark.matches ? "dark" : "light";
    applyTheme(preferred);
    setTheme(preferred);

    const listener = (event: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(storageKey)) {
        const nextTheme: Theme = event.matches ? "dark" : "light";
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }
    };

    prefersDark.addEventListener("change", listener);
    return () => {
      prefersDark.removeEventListener("change", listener);
    };
  }, [storageKey]);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(storageKey, next);
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={LABELS[theme]}>
      <span aria-hidden="true">{theme === "light" ? "🌞" : "🌙"}</span>
      <span className="sr-only">{LABELS[theme]}</span>
    </button>
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.add("theme-transition");
  window.setTimeout(() => {
    root.classList.remove("theme-transition");
  }, 300);
}
