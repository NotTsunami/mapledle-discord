/*
  Port of mapledoro's SkillGuesserWorkspace for the Discord Activity.
  Differences from the web version: no next/link back-navigation (the activity
  is single-purpose), no SSR mount gate, an optional "Playing as" line for the
  authenticated Discord user, settings/help dialogs, a header difficulty toggle
  (hard mode asks for the skill name instead of the class), and Wordle-style
  rich presence updates.
*/

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ActionButton } from "../components/ActionButton";
import { reportGameResult, updateGameActivity } from "../discord";
import type { ActivitySettings } from "../settings";
import { toolStyles, type AppTheme } from "../theme";
import { SKILL_GUESSER_CLASSES, findSkillGuesserClass } from "./classes";
import {
  MAX_GUESSES,
  allSkillNames,
  currentPuzzleNumber,
  getPuzzle,
  msUntilNextPuzzle,
  type SkillGuesserPuzzle,
} from "./puzzles";
import HelpDialog from "./HelpDialog";
import PuzzleSkillIcon from "./PuzzleSkillIcon";
import ResultsDialog from "./ResultsDialog";
import SettingsDialog from "./SettingsDialog";
import {
  readSkillGuesserResult,
  writeSkillGuesserResult,
  type SkillGuesserResult,
} from "./storage";

const HIT_GREEN = "#2d8a2d";
const MISS_RED = "#c44040";

/* ------------------------------------------------------------------ */
/*  Guess picker (searchable combobox over the answer pool)            */
/* ------------------------------------------------------------------ */

function GuessPicker({
  theme,
  options,
  search,
  guessed,
  placeholder,
  ariaLabel,
  emptyLabel,
  onSearchChange,
  onStage,
  onSubmit,
}: {
  theme: AppTheme;
  options: string[];
  search: string;
  guessed: Set<string>;
  placeholder: string;
  ariaLabel: string;
  emptyLabel: string;
  onSearchChange: (v: string) => void;
  onStage: (name: string) => void;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
    top: "100%",
    left: 0,
    right: 0,
    maxHeight: 240,
    overflowY: "auto",
    background: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    zIndex: 10,
    marginTop: 4,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
  };

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 220 }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="sg-guess-listbox"
        aria-label={ariaLabel}
        value={search}
        placeholder={placeholder}
        className="tool-input"
        onChange={(e) => {
          onSearchChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ ...toolStyles(theme).inputStyle, width: "100%", height: 40, boxSizing: "border-box" }}
      />
      {open && (
        <div id="sg-guess-listbox" role="listbox" style={menuStyle}>
          {filtered.length === 0 && (
            <div style={{ padding: 12, fontSize: "0.8rem", color: theme.muted, textAlign: "center" }}>
              {emptyLabel}
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
                className="sg-option"
                disabled={used}
                onClick={() => pick(name)}
                style={{
                  display: "block",
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "7px 12px",
                  font: "inherit",
                  textAlign: "left",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: used ? theme.muted : theme.text,
                  textDecoration: used ? "line-through" : "none",
                  cursor: used ? "not-allowed" : "pointer",
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Guess slots + hints                                                */
/* ------------------------------------------------------------------ */

function GuessSlots({
  theme,
  guesses,
  answer,
}: {
  theme: AppTheme;
  guesses: string[];
  answer: string;
}) {
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      {Array.from({ length: MAX_GUESSES }, (_, i) => {
        const guess = guesses[i];
        const correct = guess === answer;
        const filled: CSSProperties = guess
          ? {
              border: `1px solid ${correct ? HIT_GREEN : MISS_RED}`,
              background: theme.panel,
              color: theme.text,
            }
          : {
              border: `1px dashed ${theme.border}`,
              background: theme.timerBg,
              color: theme.muted,
            };
        return (
          <div
            key={i}
            style={{
              ...filled,
              borderRadius: 10,
              padding: "0.4rem 0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              minHeight: 24,
            }}
          >
            {guess ? (
              <>
                <span aria-hidden="true" style={{ color: correct ? HIT_GREEN : MISS_RED, fontWeight: 800 }}>
                  {correct ? "✓" : "✗"}
                </span>
                <span>{guess}</span>
              </>
            ) : (
              <span style={{ fontSize: "0.78rem" }}>Guess {i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HintCards({
  theme,
  puzzle,
  failedCount,
}: {
  theme: AppTheme;
  puzzle: SkillGuesserPuzzle;
  failedCount: number;
}) {
  const cls = findSkillGuesserClass(puzzle.className);
  if (!cls) return null;
  const hints = [
    { label: "Main Stat", value: cls.mainStat, unlockAfter: 2 },
    { label: "Secondary", value: cls.secondary, unlockAfter: 3 },
    { label: "Main Weapon", value: cls.weapon, unlockAfter: 4 },
  ];
  return (
    <div className="sg-hints" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem" }}>
      {hints.map((h) => {
        const unlocked = failedCount >= h.unlockAfter;
        return (
          <div
            key={h.label}
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "0.5rem 0.75rem",
              background: unlocked ? theme.panel : theme.timerBg,
              opacity: unlocked ? 1 : 0.75,
            }}
          >
            <div className="tool-field-label" style={{ color: theme.muted }}>
              {h.label}
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: unlocked ? theme.text : theme.muted }}>
              {unlocked ? h.value : `\u{1F512} After ${h.unlockAfter} misses`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Game board                                                         */
/* ------------------------------------------------------------------ */

function GameBoard({
  theme,
  puzzleNumber,
  hardMode,
  onStarted,
}: {
  theme: AppTheme;
  puzzleNumber: number;
  hardMode: boolean;
  onStarted: () => void;
}) {
  const puzzle = useMemo(() => getPuzzle(puzzleNumber), [puzzleNumber]);
  const styles = toolStyles(theme);
  const [result, setResult] = useState<SkillGuesserResult>(
    () => readSkillGuesserResult(puzzleNumber) ?? { guesses: [], won: false, done: false },
  );
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Hard mode scores against the skill name (picked from the skill pool);
  // normal mode scores against the class name. Everything downstream — guess
  // slots, squares, scoreboard marks, share text — keys off this one answer.
  const answer = hardMode ? puzzle.skillName : puzzle.className;
  const options = useMemo(
    () => (hardMode ? allSkillNames() : SKILL_GUESSER_CLASSES.map((c) => c.name)),
    [hardMode],
  );

  const guessed = useMemo(() => new Set(result.guesses), [result.guesses]);
  const failedCount = result.guesses.filter((g) => g !== answer).length;

  // Wordle-style rich presence: board so far + which guess + session time.
  useEffect(() => {
    updateGameActivity({
      puzzleNumber,
      squares: result.guesses.map((g) => (g === answer ? "🟩" : "🟥")).join(""),
      guessCount: result.guesses.length,
      maxGuesses: MAX_GUESSES,
      done: result.done,
      won: result.won,
    });
  }, [puzzleNumber, answer, result]);

  function handleSubmit(name?: string) {
    const guess = name ?? staged;
    if (!guess || result.done || guessed.has(guess)) return;
    setStaged(null);
    setSearch("");
    setResult((prev) => {
      if (prev.done || prev.guesses.includes(guess)) return prev;
      const guesses = [...prev.guesses, guess];
      const won = guess === answer;
      const next = { guesses, won, done: won || guesses.length >= MAX_GUESSES };
      writeSkillGuesserResult(puzzleNumber, next);
      return next;
    });
    // Today's puzzle now has progress; let the workspace lock the mode toggle.
    onStarted();
    const finished = guess === answer || result.guesses.length + 1 >= MAX_GUESSES;
    if (finished) {
      // Feed the guild scoreboard card exactly once, at the finishing guess.
      const marks = [...result.guesses, guess].map((g) => g === answer);
      reportGameResult(puzzleNumber, guess === answer, marks);
      setTimeout(() => setDialogOpen(true), 700);
    }
  }

  return (
    <>
      <div className="fade-in panel-card" style={styles.sectionPanel}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", marginBottom: "0.85rem" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 14,
              border: `1px solid ${theme.border}`,
              background: theme.timerBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <PuzzleSkillIcon
              puzzle={puzzle}
              size={64}
              alt="Mystery skill icon"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text }}>
            {hardMode ? "What is this skill called?" : "Which class learns this skill?"}
          </div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted }}>
            {result.done
              ? hardMode
                ? `The skill was ${puzzle.skillName} — ${puzzle.className}`
                : `The answer was ${puzzle.className} — ${puzzle.skillName}`
              : `${MAX_GUESSES - result.guesses.length} of ${MAX_GUESSES} guesses remaining${hardMode ? " · Hard Mode" : ""}`}
          </div>
        </div>

        {result.done ? (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.85rem" }}>
            <ActionButton theme={theme} label="View Results" onClick={() => setDialogOpen(true)} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
            <GuessPicker
              theme={theme}
              options={options}
              search={search}
              guessed={guessed}
              placeholder={hardMode ? "Search skills…" : "Search classes…"}
              ariaLabel={hardMode ? "Guess a skill" : "Guess a class"}
              emptyLabel={hardMode ? "No skills found" : "No classes found"}
              onSearchChange={(v) => {
                setSearch(v);
                setStaged(null);
              }}
              onStage={(name) => {
                setStaged(name);
                setSearch(name);
              }}
              onSubmit={handleSubmit}
            />
            <ActionButton
              theme={theme}
              label="Guess"
              onClick={() => handleSubmit()}
              disabled={staged === null || guessed.has(staged)}
              style={{ height: 40, padding: "0 22px" }}
            />
          </div>
        )}

        <div style={{ display: "grid", gap: "0.8rem" }}>
          <GuessSlots theme={theme} guesses={result.guesses} answer={answer} />
          <HintCards theme={theme} puzzle={puzzle} failedCount={failedCount} />
        </div>
      </div>

      {dialogOpen && (
        <ResultsDialog
          theme={theme}
          puzzleNumber={puzzleNumber}
          puzzle={puzzle}
          result={result}
          answer={answer}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                          */
/* ------------------------------------------------------------------ */

function HeaderIconButton({
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

/** Segmented Normal / Hard selector that sits in the header, left of the icons. */
function ModeToggle({
  theme,
  hardMode,
  disabled,
  onChange,
}: {
  theme: AppTheme;
  hardMode: boolean;
  disabled: boolean;
  onChange: (hard: boolean) => void;
}) {
  const options: { hard: boolean; label: string }[] = [
    { hard: false, label: "Normal" },
    { hard: true, label: "Hard" },
  ];
  return (
    <div
      role="group"
      aria-label="Difficulty"
      title={disabled ? "Finish today's puzzle to switch difficulty" : undefined}
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
        const active = o.hard === hardMode;
        return (
          <button
            key={o.label}
            type="button"
            className="tool-btn"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => !active && onChange(o.hard)}
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

export default function SkillGuesserWorkspace({
  theme,
  playerName,
  settings,
  onUpdateSettings,
}: {
  theme: AppTheme;
  playerName?: string | null;
  settings: ActivitySettings;
  onUpdateSettings: (patch: Partial<ActivitySettings>) => void;
}) {
  const [puzzleNumber, setPuzzleNumber] = useState(() => currentPuzzleNumber());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Bumped when stats are wiped so the board remounts from empty storage.
  const [resetTick, setResetTick] = useState(0);
  // Bumped after each guess so `started` re-reads storage and locks the toggle.
  const [progressTick, setProgressTick] = useState(0);

  // Once today's puzzle has any guesses, lock the difficulty toggle: the stored
  // guesses are scored against one answer key (skill vs class), so switching
  // mid-game would mismatch every prior guess. It frees up on the next puzzle.
  const started = useMemo(
    () => (readSkillGuesserResult(puzzleNumber)?.guesses.length ?? 0) > 0,
    [puzzleNumber, resetTick, progressTick],
  );

  // Move to the next puzzle when the UTC day rolls over while the activity is open.
  useEffect(() => {
    const t = setTimeout(() => setPuzzleNumber(currentPuzzleNumber()), msUntilNextPuzzle() + 250);
    return () => clearTimeout(t);
  }, [puzzleNumber]);

  return (
    <div className="page-content">
      <div className="tool-container" style={{ maxWidth: 560 }}>
        <style>{`.sg-option:hover:not(:disabled) { background: ${theme.accentSoft}; }
@media (max-width: 560px) { .sg-hints { grid-template-columns: 1fr !important; } }`}</style>
        <div
          className="tool-header"
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}
        >
          <div>
            <div className="tool-header-title" style={{ color: theme.text }}>
              Mapledle #{puzzleNumber} - A MapleDoro Game
            </div>
            <div className="tool-header-desc" style={{ color: theme.muted }}>
              Guess which class learns the daily skill in {MAX_GUESSES} tries.
              {playerName ? (
                <>
                  {" "}
                  Playing as <span style={{ color: theme.accentText, fontWeight: 700 }}>{playerName}</span>.
                </>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem" }}>
            <ModeToggle
              theme={theme}
              hardMode={settings.hardMode}
              disabled={started}
              onChange={(hard) => onUpdateSettings({ hardMode: hard })}
            />
            <HeaderIconButton theme={theme} label="How to play" onClick={() => setHelpOpen(true)}>
              ?
            </HeaderIconButton>
            <HeaderIconButton theme={theme} label="Settings" onClick={() => setSettingsOpen(true)}>
              ⚙
            </HeaderIconButton>
          </div>
        </div>

        <GameBoard
          key={`${puzzleNumber}:${resetTick}:${settings.hardMode ? "h" : "n"}`}
          theme={theme}
          puzzleNumber={puzzleNumber}
          hardMode={settings.hardMode}
          onStarted={() => setProgressTick((n) => n + 1)}
        />

        {settingsOpen && (
          <SettingsDialog
            theme={theme}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            onStatsWiped={() => setResetTick((n) => n + 1)}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {helpOpen && <HelpDialog theme={theme} onClose={() => setHelpOpen(false)} />}
      </div>
    </div>
  );
}
