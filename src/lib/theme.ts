/** 全站主题注册表：新增主题时在这里登记，切换按钮与防闪烁脚本都会自动跟随。 */
export type ThemeColorScheme = "light" | "dark";

/** 全部合法主题值（与主题 CSS 选择器一一对应；颜色变量统一在 src/app/theme-tokens.css 定义） */
export type ThemeValue = "light" | "dark" | "midnight" | "celadon";

export type ThemeDefinition = {
  /** 写入 <html data-theme> 的值，需与主题 CSS 文件中的选择器保持一致 */
  value: ThemeValue;
  label: string;
  icon: string;
  /** 原生 color-scheme 与 <html data-theme-mode>，暗色系主题为 "dark" */
  colorScheme: ThemeColorScheme;
};

export const THEMES: readonly ThemeDefinition[] = [
  { value: "light", label: "浅色模式", icon: "☀", colorScheme: "light" },
  { value: "dark", label: "深色模式", icon: "☾", colorScheme: "dark" },
  { value: "midnight", label: "深海蓝模式", icon: "◐", colorScheme: "dark" },
  { value: "celadon", label: "青瓷绿模式", icon: "❖", colorScheme: "light" },
] as const;

export const DEFAULT_THEME_VALUE = "light";

/** localStorage 键与跨组件同步事件名（沿用历史命名，避免清空用户已保存的偏好）。 */
export const THEME_STORAGE_KEY = "sigma-theme";
export const THEME_CHANGE_EVENT = "sigma-theme-change";

export function isThemeValue(value: string | null | undefined): value is ThemeValue {
  return typeof value === "string" && THEMES.some((theme) => theme.value === value);
}

export function getTheme(value: string | null | undefined): ThemeDefinition {
  return THEMES.find((theme) => theme.value === value) ?? THEMES[0];
}
