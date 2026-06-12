import type { CSSProperties } from "react";
import type { AppTheme } from "../theme";

const actionBtnBase: CSSProperties = {
  padding: "10px 22px",
  borderRadius: "10px",
  border: "1px solid",
  fontFamily: "var(--font-body)",
  fontSize: "0.85rem",
  fontWeight: 800,
  textAlign: "center",
};

/** Solid accent action button (port of mapledoro's shared-ui ActionButton). */
export function ActionButton({
  theme,
  label,
  onClick,
  disabled = false,
  fullWidth = false,
  style,
}: {
  theme: AppTheme;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className="tool-btn"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...actionBtnBase,
        background: theme.accent,
        borderColor: theme.accent,
        color: "#fff",
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {label}
    </button>
  );
}
