/*
  The pill-shaped controls that sit in the top-right of both game headers: the
  round help/settings buttons and the segmented toggles (which game, and — in
  Mapledle — which difficulty).
*/

import type { ReactNode } from "react";
import type { AppTheme } from "../theme";

export function HeaderIconButton({
  theme,
  label,
  onClick,
  children,
}: {
  theme: AppTheme;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="tool-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        color: theme.muted,
        fontSize: "0.95rem",
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/** Segmented selector matching the header icon buttons' height and radius. */
export function SegmentedToggle<T extends string>({
  theme,
  groupLabel,
  value,
  options,
  disabled = false,
  disabledTitle,
  onChange,
}: {
  theme: AppTheme;
  groupLabel: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  disabledTitle?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      title={disabled ? disabledTitle : undefined}
      style={{
        display: "flex",
        height: 34,
        padding: 2,
        borderRadius: 17,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        opacity: disabled ? 0.55 : 1,
        flexShrink: 0,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className="tool-btn"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => !active && onChange(o.value)}
            style={{
              border: "none",
              borderRadius: 15,
              padding: "0 0.7rem",
              fontSize: "0.72rem",
              fontWeight: 800,
              cursor: disabled ? "not-allowed" : "pointer",
              background: active ? theme.accentSoft : "transparent",
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
