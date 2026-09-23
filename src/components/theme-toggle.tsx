"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_VALUE,
  THEMES,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  getTheme,
  isThemeValue,
} from "@/lib/theme";

function applyTheme(value: string) {
  const theme = getTheme(value);
  const root = document.documentElement;
  root.dataset.theme = theme.value;
  root.dataset.themeMode = theme.colorScheme;
  root.style.colorScheme = theme.colorScheme;
}

function getThemeSnapshot(): string {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeValue(stored)) return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return DEFAULT_THEME_VALUE;
}

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleThemeChange = () => onStoreChange();
  const handleSystemChange = () => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!isThemeValue(stored)) {
      applyTheme(media.matches ? "dark" : DEFAULT_THEME_VALUE);
      onStoreChange();
    }
  };
  window.addEventListener("storage", handleThemeChange);
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  media.addEventListener("change", handleSystemChange);
  return () => {
    window.removeEventListener("storage", handleThemeChange);
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    media.removeEventListener("change", handleSystemChange);
  };
}

/** 「界面主题」按钮组：全部主题并排展示，当前项高亮（页脚与移动端菜单共用）。 */
export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const current = useSyncExternalStore<string>(subscribeToTheme, getThemeSnapshot, () => DEFAULT_THEME_VALUE);

  function selectTheme(value: string) {
    if (value === current) return;
    localStorage.setItem(THEME_STORAGE_KEY, value);
    applyTheme(value);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <span className={`theme-switch${mobile ? " theme-switch--mobile" : ""}`} role="group" aria-label="界面主题">
      {THEMES.map((theme) => {
        const active = theme.value === current;
        return (
          <button
            key={theme.value}
            type="button"
            className={`theme-toggle${mobile ? " theme-toggle--mobile" : ""}${active ? " is-active" : ""}`}
            aria-pressed={active}
            aria-label={active ? `当前为${theme.label}` : `切换到${theme.label}`}
            title={theme.label}
            onClick={() => selectTheme(theme.value)}
          >
            <span aria-hidden="true">{theme.icon}</span>
            <b>{theme.label}</b>
          </button>
        );
      })}
    </span>
  );
}
