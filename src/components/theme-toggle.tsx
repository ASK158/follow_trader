"use client";

import { useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark";

const modes: ThemeMode[] = ["light", "dark"];
const labels: Record<ThemeMode, string> = {
  light: "浅色模式",
  dark: "深色模式",
};
const icons: Record<ThemeMode, string> = { light: "☀", dark: "☾" };
const themeChangeEvent = "sigma-theme-change";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.themeMode = mode;
  root.style.colorScheme = mode;
}

function getThemeSnapshot(): ThemeMode {
  const storedMode = localStorage.getItem("sigma-theme");
  if (isThemeMode(storedMode)) return storedMode;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleThemeChange = () => onStoreChange();
  const handleSystemChange = () => {
    const stored = localStorage.getItem("sigma-theme");
    if (!isThemeMode(stored)) {
      applyTheme(media.matches ? "dark" : "light");
      onStoreChange();
    }
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
  const mode = useSyncExternalStore<ThemeMode>(subscribeToTheme, getThemeSnapshot, () => "light");

  function selectNextMode() {
    const nextMode: ThemeMode = mode === "dark" ? "light" : "dark";
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
      title={`当前：${labels[mode]}，点击切换`}
    >
      <span aria-hidden="true">{icons[mode]}</span>
      <b>{labels[mode]}</b>
    </button>
  );
}