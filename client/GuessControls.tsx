/*
  Port of mapledoro's games/GuessControls.tsx: the searchable picker over the
  answer pool plus the Guess button, or View Results once the puzzle is done.
*/

import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ActionButton } from "./components/ActionButton";
import { usePickerCoords } from "./components/usePickerCoords";
import { toolStyles, type AppTheme } from "./theme";

const optionBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  width: "100%",
  background: "none",
  border: "none",
  padding: "9px 14px",
  font: "inherit",
  textAlign: "left",
  fontSize: "0.85rem",
  fontWeight: 600,
};

/* ------------------------------------------------------------------ */
/*  Guess picker (searchable combobox over the answer pool)            */
/* ------------------------------------------------------------------ */

function GuessPicker({
  theme,
  options,
  placeholder,
  ariaLabel,
  search,
  guessed,
  renderOptionIcon,
  onSearchChange,
  onStage,
  onSubmit,
}: {
  theme: AppTheme;
  options: string[];
  placeholder: string;
  ariaLabel: string;
  search: string;
  guessed: Set<string>;
  renderOptionIcon?: (name: string) => ReactNode;
  onSearchChange: (v: string) => void;
  onStage: (name: string) => void;
  onSubmit: (name: string) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  // Menu width is measured from the input on open rather than fixed, so the portaled
  // popover lines up with the field at every breakpoint.
  const [menuWidth, setMenuWidth] = useState(320);
  // `.panel-card` sets `overflow: hidden`, so an absolutely-positioned menu is clipped by
  // the panel's bottom edge. The BGM panel is short (no hint cards, only 3 guess slots),
  // so the menu never fits inside it — portal it to <body> and position it against the
  // anchor.
  const { ref, portalRef } = usePickerCoords(open, menuWidth);

  function openMenu() {
    if (ref.current) setMenuWidth(ref.current.offsetWidth);
    setOpen(true);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // The menu is no longer a DOM descendant of the anchor, so check the portal too.
      if (ref.current?.contains(target) || portalRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, portalRef]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((name) => name.toLowerCase().includes(q));
  }, [search, options]);

  function pick(name: string) {
    onStage(name);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exact = filtered.find((name) => name.toLowerCase() === search.trim().toLowerCase());
    if (exact && !guessed.has(exact)) {
      setOpen(false);
      onSubmit(exact);
      return;
    }
    const first = filtered.find((name) => !guessed.has(name));
    if (first) pick(first);
  }

  const menuStyle: CSSProperties = {
    position: "absolute",
    width: menuWidth,
    maxHeight: 300,
    overflowY: "auto",
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    zIndex: 300,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
  };

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 220 }}>
      <style>{`.game-option:hover:not(:disabled) { background: ${theme.accentSoft}; }`}</style>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        value={search}
        placeholder={placeholder}
        className="tool-input"
        onChange={(e) => {
          onSearchChange(e.target.value);
          openMenu();
        }}
        onFocus={openMenu}
        onKeyDown={handleKeyDown}
        style={{ ...toolStyles(theme).inputStyle, width: "100%", height: 40, boxSizing: "border-box" }}
      />
      {open && createPortal(
        <div ref={portalRef} id={listboxId} role="listbox" style={menuStyle}>
          {filtered.length === 0 && (
            <div style={{ padding: 12, fontSize: "0.8rem", color: theme.muted, textAlign: "center" }}>
              No matches found
            </div>
          )}
          {filtered.map((name) => {
            const used = guessed.has(name);
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={search === name}
                className="game-option"
                disabled={used}
                onClick={() => pick(name)}
                style={{
                  ...optionBtn,
                  color: used ? theme.muted : theme.text,
                  textDecoration: used ? "line-through" : "none",
                  cursor: used ? "not-allowed" : "pointer",
                }}
              >
                {renderOptionIcon?.(name)}
                {name}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Guess row: picker + Guess button, or View Results once finished    */
/* ------------------------------------------------------------------ */

/**
 * Owns the half-typed search and the staged (picked but not yet submitted)
 * option. Key it by anything that swaps the answer pool (e.g. game mode) so
 * that state resets with it.
 */
export function GuessControls({
  theme,
  done,
  options,
  placeholder,
  ariaLabel,
  guessed,
  renderOptionIcon,
  onSubmit,
  onViewResults,
}: {
  theme: AppTheme;
  done: boolean;
  options: string[];
  placeholder: string;
  ariaLabel: string;
  guessed: Set<string>;
  renderOptionIcon?: (name: string) => ReactNode;
  onSubmit: (name: string) => void;
  onViewResults: () => void;
}) {
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<string | null>(null);

  function submit(name?: string) {
    const guess = name ?? staged;
    if (!guess || guessed.has(guess)) return;
    setStaged(null);
    setSearch("");
    onSubmit(guess);
  }

  if (done) {
    return (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.1rem" }}>
        <ActionButton theme={theme} label="View Results" onClick={onViewResults} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem", flexWrap: "wrap" }}>
      <GuessPicker
        theme={theme}
        options={options}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        search={search}
        guessed={guessed}
        renderOptionIcon={renderOptionIcon}
        onSearchChange={(v) => {
          setSearch(v);
          setStaged(null);
        }}
        onStage={(name) => {
          setStaged(name);
          setSearch(name);
        }}
        onSubmit={submit}
      />
      <ActionButton
        theme={theme}
        label="Guess"
        onClick={() => submit()}
        disabled={staged === null || guessed.has(staged)}
        style={{ height: 40, padding: "0 22px" }}
      />
    </div>
  );
}
