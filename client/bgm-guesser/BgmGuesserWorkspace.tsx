/*
  Port of mapledoro's BgmGuesserWorkspace for the Discord Activity.
  Differences from the web version: no next/link back-navigation, no SSR mount
  gate, no replay arrows (the activity is today-only, like Mapledle here), the
  lifetime stats panel moved into the results dialog, plus an optional
  "Playing as" line, help/settings dialogs, the game switcher, and Wordle-style
  rich presence updates.

  There is no hard mode: the BGM Guesser has a single difficulty.
*/

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ActionButton } from "../components/ActionButton";
import { HeaderIconButton, SegmentedToggle } from "../components/HeaderControls";
import MarkIcon from "../components/MarkIcon";
import SettingsDialog from "../components/SettingsDialog";
import { usePickerCoords } from "../components/usePickerCoords";
import { reportGameResult, updateGameActivity } from "../discord";
import { GAME_META, type GameMode } from "../games";
import type { ActivitySettings } from "../settings";
import { toolStyles, type AppTheme } from "../theme";
import HelpDialog from "./HelpDialog";
import BgmPlayer from "./BgmPlayer";
import ResultsDialog from "./ResultsDialog";
import {
  BGM_GUESSER_ANSWERS,
  MAX_GUESSES,
  currentPuzzleNumber,
  findBgmGuesserAnswer,
  getPuzzle,
  msUntilNextPuzzle,
} from "./puzzles";
import {
  readBgmGuesserResult,
  wipeBgmGuesserData,
  writeBgmGuesserResult,
  type BgmGuesserResult,
} from "./storage";

const HIT_GREEN = "#2d8a2d";
const MISS_RED = "#c44040";

const EMPTY_RESULT: BgmGuesserResult = { guesses: [], won: false, done: false };

const ANSWER_NAMES = BGM_GUESSER_ANSWERS.map((a) => a.name);

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

const guessSlot: CSSProperties = {
  borderRadius: 10,
  padding: "0.5rem 0.85rem",
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  minHeight: 24,
};

/* ------------------------------------------------------------------ */
/*  Guess picker (searchable combobox over the area/boss answer pool)  */
/* ------------------------------------------------------------------ */

function GuessPicker({
  theme,
  search,
  guessed,
  onSearchChange,
  onStage,
  onSubmit,
}: {
  theme: AppTheme;
  search: string;
  guessed: Set<string>;
  onSearchChange: (v: string) => void;
  onStage: (name: string) => void;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Menu width is measured from the input on open rather than fixed, so the portaled
  // popover lines up with the field at every breakpoint.
  const [menuWidth, setMenuWidth] = useState(320);
  // `.panel-card` sets `overflow: hidden`, so an absolutely-positioned menu is clipped by
  // the panel's bottom edge. This panel is short (no hint cards, only 3 guess slots), so
  // the menu never fits inside it — portal it to <body> and position it against the anchor.
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
    if (!q) return ANSWER_NAMES;
    return ANSWER_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [search]);

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
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="bg-guess-listbox"
        aria-label="Guess an area or boss"
        value={search}
        placeholder="Search areas and bosses…"
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
        <div ref={portalRef} id="bg-guess-listbox" role="listbox" style={menuStyle}>
          {filtered.length === 0 && (
            <div style={{ padding: 12, fontSize: "0.8rem", color: theme.muted, textAlign: "center" }}>
              No matches found
            </div>
          )}
          {filtered.map((name) => {
            const used = guessed.has(name);
            const answer = findBgmGuesserAnswer(name);
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={search === name}
                className="bg-option"
                disabled={used}
                onClick={() => pick(name)}
                style={{
                  ...optionBtn,
                  color: used ? theme.muted : theme.text,
                  textDecoration: used ? "line-through" : "none",
                  cursor: used ? "not-allowed" : "pointer",
                }}
              >
                {answer && <MarkIcon id={answer.mark} size={30} style={{ imageRendering: "pixelated" }} />}
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
/*  Guess slots                                                        */
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
    <div style={{ display: "grid", gap: "0.45rem" }}>
      {Array.from({ length: MAX_GUESSES }, (_, i) => {
        const guess = guesses[i];
        const correct = guess === answer;
        const verdict = correct ? HIT_GREEN : MISS_RED;
        const filled: CSSProperties = guess
          ? { border: `1px solid ${verdict}`, background: theme.panel, color: theme.text }
          : { border: `1px dashed ${theme.border}`, background: theme.timerBg, color: theme.muted };
        return (
          <div key={i} style={{ ...filled, ...guessSlot }}>
            {guess ? (
              <>
                <span aria-hidden="true" style={{ color: verdict, fontWeight: 800 }}>
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

/* ------------------------------------------------------------------ */
/*  Game board                                                         */
/* ------------------------------------------------------------------ */

function GameBoard({ theme, puzzleNumber }: { theme: AppTheme; puzzleNumber: number }) {
  const puzzle = useMemo(() => getPuzzle(puzzleNumber), [puzzleNumber]);
  const styles = toolStyles(theme);
  const [result, setResult] = useState(() => readBgmGuesserResult(puzzleNumber) ?? EMPTY_RESULT);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const guessed = useMemo(() => new Set(result.guesses), [result.guesses]);

  // Wordle-style rich presence: board so far + which guess + session time.
  useEffect(() => {
    updateGameActivity({
      game: GAME_META.bgm.title,
      puzzleNumber,
      squares: result.guesses.map((g) => (g === puzzle.answer ? "🟩" : "🟥")).join(""),
      guessCount: result.guesses.length,
      maxGuesses: MAX_GUESSES,
      done: result.done,
      won: result.won,
    });
  }, [puzzleNumber, puzzle.answer, result]);

  function handleSubmit(name?: string) {
    const guess = name ?? staged;
    if (!guess || result.done || guessed.has(guess)) return;
    setStaged(null);
    setSearch("");
    setResult((prev) => {
      if (prev.done || prev.guesses.includes(guess)) return prev;
      const guesses = [...prev.guesses, guess];
      const won = guess === puzzle.answer;
      const next = { guesses, won, done: won || guesses.length >= MAX_GUESSES };
      writeBgmGuesserResult(puzzleNumber, next);
      return next;
    });
    const finished = guess === puzzle.answer || result.guesses.length + 1 >= MAX_GUESSES;
    if (finished) {
      // Feed the guild scoreboard card exactly once, at the finishing guess.
      const marks = [...result.guesses, guess].map((g) => g === puzzle.answer);
      reportGameResult("bgm", puzzleNumber, guess === puzzle.answer, marks);
      setTimeout(() => setDialogOpen(true), 700);
    }
  }

  return (
    <>
      <div className="fade-in panel-card" style={styles.sectionPanel}>
        <div style={{ display: "grid", gap: "0.9rem", marginBottom: "1.1rem" }}>
          <BgmPlayer theme={theme} group={puzzle.group} track={puzzle.track} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: theme.text }}>
              Which area or boss plays this music?
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: theme.muted, marginTop: "0.15rem" }}>
              {result.done
                ? `The answer was ${puzzle.answer} (${puzzle.title})`
                : `${MAX_GUESSES - result.guesses.length} of ${MAX_GUESSES} guesses remaining`}
            </div>
          </div>
        </div>

        {result.done ? (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.1rem" }}>
            <ActionButton theme={theme} label="View Results" onClick={() => setDialogOpen(true)} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem", flexWrap: "wrap" }}>
            <GuessPicker
              theme={theme}
              search={search}
              guessed={guessed}
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

        <GuessSlots theme={theme} guesses={result.guesses} answer={puzzle.answer} />
      </div>

      {dialogOpen && (
        <ResultsDialog
          theme={theme}
          puzzleNumber={puzzleNumber}
          puzzle={puzzle}
          result={result}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                          */
/* ------------------------------------------------------------------ */

export default function BgmGuesserWorkspace({
  theme,
  playerName,
  settings,
  onUpdateSettings,
  onChangeMode,
}: {
  theme: AppTheme;
  playerName?: string | null;
  settings: ActivitySettings;
  onUpdateSettings: (patch: Partial<ActivitySettings>) => void;
  onChangeMode: (mode: GameMode) => void;
}) {
  const [puzzleNumber, setPuzzleNumber] = useState(() => currentPuzzleNumber());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Bumped when stats are wiped so the board remounts from empty storage.
  const [resetTick, setResetTick] = useState(0);

  // Move to the next puzzle when the UTC day rolls over while the activity is open.
  useEffect(() => {
    const t = setTimeout(() => setPuzzleNumber(currentPuzzleNumber()), msUntilNextPuzzle() + 250);
    return () => clearTimeout(t);
  }, [puzzleNumber]);

  return (
    <div className="page-content">
      <div className="tool-container" style={{ maxWidth: 560 }}>
        <style>{`.bg-option:hover:not(:disabled) { background: ${theme.accentSoft}; }`}</style>
        <div
          className="tool-header"
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}
        >
          <div>
            <div className="tool-header-title" style={{ color: theme.text }}>
              BGM Guesser #{puzzleNumber} - A MapleDoro Game
            </div>
            <div className="tool-header-desc" style={{ color: theme.muted }}>
              Name the area or boss the daily track plays for in {MAX_GUESSES} tries.
              {playerName ? (
                <>
                  {" "}
                  Playing as <span style={{ color: theme.accentText, fontWeight: 700 }}>{playerName}</span>.
                </>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem" }}>
            <SegmentedToggle
              theme={theme}
              groupLabel="Game"
              value={"bgm" as GameMode}
              options={[
                { value: "skill", label: GAME_META.skill.shortLabel },
                { value: "bgm", label: GAME_META.bgm.shortLabel },
              ]}
              onChange={onChangeMode}
            />
            <HeaderIconButton theme={theme} label="How to play" onClick={() => setHelpOpen(true)}>
              ?
            </HeaderIconButton>
            <HeaderIconButton theme={theme} label="Settings" onClick={() => setSettingsOpen(true)}>
              ⚙
            </HeaderIconButton>
          </div>
        </div>

        <GameBoard key={`${puzzleNumber}:${resetTick}`} theme={theme} puzzleNumber={puzzleNumber} />

        {settingsOpen && (
          <SettingsDialog
            theme={theme}
            settings={settings}
            gameTitle={GAME_META.bgm.title}
            onUpdateSettings={onUpdateSettings}
            onWipe={() => {
              wipeBgmGuesserData();
              setResetTick((n) => n + 1);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {helpOpen && <HelpDialog theme={theme} onClose={() => setHelpOpen(false)} />}
      </div>
    </div>
  );
}
