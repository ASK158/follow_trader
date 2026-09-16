"use client";

import { useSyncExternalStore } from "react";

type ThemeMode = "system" | "light" | "dark";

const modes: ThemeMode[] = ["system", "light", "dark"];
const labels: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};
const icons: Record<ThemeMode, string> = { system: "◐", light: "☀", dark: "☾" };
const themeChangeEvent = "sigma-theme-change";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = mode;
  root.style.colorScheme = resolvedTheme;
}

function getThemeSnapshot(): ThemeMode {
  const storedMode = localStorage.getItem("sigma-theme");
  return isThemeMode(storedMode) ? storedMode : "system";
}

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleThemeChange = () => onStoreChange();
  const handleSystemChange = () => {
    if (getThemeSnapshot() === "system") applyTheme("system");
    onStoreChange();
  };
  window.addEventListener("storage", handleThemeChange);
  window.addEventListener(themeChangeEvent, handleThemeChange);
  media.addEventListener("change", handleSystemChange);
  return () => {
    window.removeEventListener("storage", handleThemeChange);
    window.removeEventListener(themeChangeEvent, handleThemeChange);
    media.removeEventListener("change", handleSystemChange);
  };
}

export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const mode = useSyncExternalStore<ThemeMode>(subscribeToTheme, getThemeSnapshot, () => "system");

  function selectNextMode() {
    const nextMode = modes[(modes.indexOf(mode) + 1) % modes.length];
    localStorage.setItem("sigma-theme", nextMode);
    applyTheme(nextMode);
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <button
      type="button"
      className={`theme-toggle${mobile ? " theme-toggle--mobile" : ""}`}
      onClick={selectNextMode}
      aria-label={`当前为${labels[mode]}，点击切换主题`}
      title={`当前：${labels[mode]}`}
    >
      <span aria-hidden="true">{icons[mode]}</span>
      <b>{labels[mode]}</b>
    </button>
  );
}