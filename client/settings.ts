/*
  localStorage store for activity-local settings (theme override, hard mode,
  and which game the player was last in). Separate key from the game results
  store so "wipe stats" can clear results without touching preferences.
*/

import { isGameMode, type GameMode } from "./games";
import type { ThemeMode } from "./theme";

const STORAGE_KEY = "mapledoro_activity_settings_v1";

export interface ActivitySettings {
  /** Explicit theme choice; null follows the OS preference. */
  themeMode: ThemeMode | null;
  /** Mapledle only — the BGM Guesser has a single difficulty. */
  hardMode: boolean;
  /** Fallback game for launches that carry no mode (e.g. the App Launcher). */
  lastMode: GameMode;
}

function defaults(): ActivitySettings {
  return { themeMode: null, hardMode: false, lastMode: "skill" };
}

export function readSettings(): ActivitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ActivitySettings>;
      return {
        themeMode: parsed.themeMode === "light" || parsed.themeMode === "dark" ? parsed.themeMode : null,
        hardMode: parsed.hardMode === true,
        lastMode: isGameMode(parsed.lastMode) ? parsed.lastMode : "skill",
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
