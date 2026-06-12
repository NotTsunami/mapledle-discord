/*
  Trimmed port of mapledoro's theming (src/components/themes.ts +
  src/features/tools/tool-styles.ts): the Default 🍁 accent over the light and
  dark bases. The AppTheme shape is kept identical so the game components port
  verbatim.
*/

import type { CSSProperties } from "react";

export interface AppTheme {
  name: string;
  emoji: string;
  bg: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  sidebar: string;
  sidebarAccent: string;
  timerBg: string;
  badge: string;
  badgeText: string;
}

const LIGHT_THEME: AppTheme = {
  name: "Default",
  emoji: "\u{1F341}",
  bg: "#faf8f5",
  panel: "#ffffff",
  border: "#ede8e0",
  text: "#1c1814",
  muted: "#8a7f75",
  accent: "#d4622a",
  accentSoft: "#fdf0ea",
  accentText: "#c45520",
  sidebar: "#faf8f5",
  sidebarAccent: "#d4622a",
  timerBg: "#faf8f5",
  badge: "#f0e8e0",
  badgeText: "#7a5a40",
};

const DARK_THEME: AppTheme = {
  name: "Default",
  emoji: "\u{1F341}",
  bg: "#101014",
  panel: "#1a1a22",
  border: "#2a2a34",
  text: "#e0ddd8",
  muted: "#807a85",
  accent: "#d4622a",
  accentSoft: "#2a1a0e",
  accentText: "#e89a50",
  sidebar: "#131318",
  sidebarAccent: "#d4622a",
  timerBg: "#141418",
  badge: "#242428",
  badgeText: "#908890",
};

export type ThemeMode = "light" | "dark";

/** Discord defaults to dark; follow the OS preference when it says light. */
export function systemThemeMode(): ThemeMode {
  const prefersLight =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === "light" ? LIGHT_THEME : DARK_THEME;
}

export interface ToolStyles {
  sectionPanel: CSSProperties;
  inputStyle: CSSProperties;
  dialogBtnStyle: CSSProperties;
  dialogPrimaryBtnStyle: CSSProperties;
}

export function toolStyles(theme: AppTheme): ToolStyles {
  return {
    sectionPanel: {
      background: theme.panel,
      border: `1px solid ${theme.border}`,
      padding: "1rem 1.25rem",
      marginBottom: "0.75rem",
    },
    // Dynamic theme colors only; shape comes from the .tool-input class.
    inputStyle: {
      background: theme.timerBg,
      borderColor: theme.border,
      color: theme.text,
    },
    // Dialog action buttons (colors only; shape comes from .tool-dialog-btn).
    dialogBtnStyle: {
      color: theme.muted,
      background: theme.timerBg,
      borderColor: theme.border,
    },
    dialogPrimaryBtnStyle: {
      color: theme.accentText,
      background: theme.accentSoft,
      borderColor: theme.accent,
    },
  };
}
