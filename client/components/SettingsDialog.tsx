/*
  Shared settings dialog for both games. "Wipe Stats" clears only the game it
  was opened from — the two games keep separate result histories, so wiping
  BGM Guesser stats shouldn't take Mapledle's with it.
*/

import { useState, type CSSProperties, type ReactNode } from "react";
import ModalShell from "./ModalShell";
import { systemThemeMode, toolStyles, type AppTheme, type ThemeMode } from "../theme";
import type { ActivitySettings } from "../settings";

function SettingRow({
  theme,
  label,
  description,
  control,
}: {
  theme: AppTheme;
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", justifyContent: "space-between" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 800, color: theme.text }}>{label}</div>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted, lineHeight: 1.45 }}>
          {description}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function PillToggle<T extends string>({
  theme,
  value,
  options,
  onChange,
}: {
  theme: AppTheme;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const base: CSSProperties = {
    padding: "0.35rem 0.85rem",
    borderRadius: 8,
    border: "1px solid",
    fontSize: "0.78rem",
    fontWeight: 800,
  };
  return (
    <div style={{ display: "flex", gap: "0.35rem" }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className="tool-btn"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              ...base,
              background: active ? theme.accentSoft : theme.timerBg,
              borderColor: active ? theme.accent : theme.border,
              color: active ? theme.accentText : theme.muted,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsDialog({
  theme,
  settings,
  gameTitle,
  onUpdateSettings,
  onWipe,
  onClose,
}: {
  theme: AppTheme;
  settings: ActivitySettings;
  /** Named in the wipe copy so it's clear which game's history goes. */
  gameTitle: string;
  onUpdateSettings: (patch: Partial<ActivitySettings>) => void;
  /** Clears this game's stored results; the dialog handles the confirm step. */
  onWipe: () => void;
  onClose: () => void;
}) {
  const styles = toolStyles(theme);
  const [wipeStage, setWipeStage] = useState<"idle" | "confirm" | "wiped">("idle");
  const themeMode: ThemeMode = settings.themeMode ?? systemThemeMode();

  function handleWipe() {
    onWipe();
    setWipeStage("wiped");
  }

  return (
    <ModalShell
      theme={theme}
      ariaLabel="Settings"
      onClose={onClose}
      style={{ width: "min(380px, calc(100% - 2rem))", padding: "1.5rem" }}
    >
      <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", color: theme.text, marginBottom: "1.1rem" }}>
        Settings
      </div>

      <div style={{ display: "grid", gap: "1.1rem" }}>
        <SettingRow
          theme={theme}
          label="Theme"
          description="Switch between light and dark mode."
          control={
            <PillToggle
              theme={theme}
              value={themeMode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(mode) => onUpdateSettings({ themeMode: mode })}
            />
          }
        />

        <SettingRow
          theme={theme}
          label="Wipe Stats"
          description={
            wipeStage === "confirm"
              ? `This permanently clears all ${gameTitle} results, including today's progress. Are you sure?`
              : `Permanently clear all saved ${gameTitle} results and stats on this device.`
          }
          control={
            wipeStage === "wiped" ? (
              <span style={{ fontSize: "0.78rem", fontWeight: 800, color: theme.muted }}>Wiped ✓</span>
            ) : wipeStage === "confirm" ? (
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button
                  type="button"
                  className="tool-btn tool-dialog-btn"
                  onClick={handleWipe}
                  style={{ color: "#fff", background: "#c44040", borderColor: "#c44040" }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="tool-btn tool-dialog-btn"
                  onClick={() => setWipeStage("idle")}
                  style={styles.dialogBtnStyle}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="tool-btn tool-dialog-btn"
                onClick={() => setWipeStage("confirm")}
                style={{ color: "#c44040", background: theme.timerBg, borderColor: "#c44040" }}
              >
                Wipe
              </button>
            )
          }
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.4rem" }}>
        <button type="button" className="tool-btn tool-dialog-btn" onClick={onClose} style={styles.dialogBtnStyle}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}
