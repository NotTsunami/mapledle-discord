/*
  localStorage store for activity-local settings (theme override + hard mode).
  Separate key from the game results store so "wipe stats" can clear results
  without touching preferences.
*/

import type { ThemeMode } from "./theme";

const STORAGE_KEY = "mapledoro_activity_settings_v1";

export interface ActivitySettings {
  /** Explicit theme choice; null follows the OS preference. */
  themeMode: ThemeMode | null;
  hardMode: boolean;
}

function defaults(): ActivitySettings {
  return { themeMode: null, hardMode: false };
}

export function readSettings(): ActivitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ActivitySettings>;
      return {
        themeMode: parsed.themeMode === "light" || parsed.themeMode === "dark" ? parsed.themeMode : null,
        hardMode: parsed.hardMode === true,
      };
    }
  } catch { /* ignore */ }
  return defaults();
}

export function writeSettings(settings: ActivitySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}
