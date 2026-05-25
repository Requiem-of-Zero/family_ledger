"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-xl border border-border bg-raised-bg px-3 py-2 text-sm font-semibold text-primary-text hover:border-border-hover"
    >
      {isDark ? "Light" : "Dark"}
    </button>
  );
}
