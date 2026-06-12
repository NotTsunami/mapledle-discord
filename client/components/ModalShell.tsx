import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { AppTheme } from "../theme";

/** Native <dialog>-based modal shell (port of mapledoro's ModalShell): opens
 *  via showModal() on mount, so focus trapping and Escape come for free;
 *  closes on backdrop click or cancel. */
export default function ModalShell({
  theme,
  ariaLabel,
  onClose,
  className,
  style,
  children,
}: {
  theme: AppTheme;
  ariaLabel: string;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Mounted fresh per session, so open once on mount. Backdrop click-to-close
  // is a pointer-only convenience (keyboard users dismiss via Escape/cancel).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    const onBackdropClick = (e: MouseEvent) => {
      if (e.target === dlg) onClose();
    };
    dlg.addEventListener("click", onBackdropClick);
    return () => dlg.removeEventListener("click", onBackdropClick);
  }, [onClose]);

  const baseStyle: CSSProperties = {
    padding: 0,
    background: theme.panel,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    boxShadow: "0 16px 48px rgba(0,0,0,0.24)",
  };

  return (
    <dialog
      ref={dialogRef}
      className={className ? `modal-shell ${className}` : "modal-shell"}
      aria-label={ariaLabel}
      onCancel={onClose}
      style={{ ...baseStyle, ...style }}
    >
      <style>{`dialog.modal-shell::backdrop { background: rgba(15, 23, 42, 0.42); }`}</style>
      {children}
    </dialog>
  );
}
