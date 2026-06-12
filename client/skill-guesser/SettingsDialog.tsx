import { useState, type CSSProperties, type ReactNode } from "react";
import ModalShell from "../components/ModalShell";
import { systemThemeMode, toolStyles, type AppTheme, type ThemeMode } from "../theme";
import type { ActivitySettings } from "../settings";
import { wipeSkillGuesserData } from "./storage";

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
  onUpdateSettings,
  onStatsWiped,
  onClose,
}: {
  theme: AppTheme;
  settings: ActivitySettings;
  onUpdateSettings: (patch: Partial<ActivitySettings>) => void;
  onStatsWiped: () => void;
  onClose: () => void;
}) {
  const styles = toolStyles(theme);
  const [wipeStage, setWipeStage] = useState<"idle" | "confirm" | "wiped">("idle");
  const themeMode: ThemeMode = settings.themeMode ?? systemThemeMode();

  function handleWipe() {
    wipeSkillGuesserData();
    setWipeStage("wiped");
    onStatsWiped();
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
          label="Hard Mode"
          description="The skill icon starts blurred and sharpens with each guess, only fully clear on your last try."
          control={
            <PillToggle
              theme={theme}
              value={settings.hardMode ? "on" : "off"}
              options={[
                { value: "off", label: "Off" },
                { value: "on", label: "On" },
              ]}
              onChange={(v) => onUpdateSettings({ hardMode: v === "on" })}
            />
          }
        />

        <SettingRow
          theme={theme}
          label="Wipe Stats"
          description={
            wipeStage === "confirm"
              ? "This permanently clears all results, including today's progress. Are you sure?"
              : "Permanently clear all saved results and stats on this device."
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
