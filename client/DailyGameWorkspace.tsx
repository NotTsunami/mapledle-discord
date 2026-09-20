/*
  Shell shared by both daily games, the activity's counterpart to mapledoro's
  games/DailyGameWorkspace. Differences from the web version: no day arrows,
  archive routing or SSR mount gate (the activity is today-only and only ever
  renders in the browser). Instead it owns the header's game switcher, the
  help and settings dialogs, the optional "Playing as" line, the remount after
  "Wipe Stats", and the Wordle-style rich presence hook.
*/

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { HeaderIconButton, SegmentedToggle } from "./components/HeaderControls";
import HelpDialog from "./components/HelpDialog";
import SettingsDialog from "./components/SettingsDialog";
import type { GuessResult, PuzzleClock } from "./dailyGame";
import { updateGameActivity } from "./discord";
import { GAME_META, GAME_MODES, type GameMode } from "./games";
import type { ActivitySettings } from "./settings";
import type { AppTheme } from "./theme";

/** Rich presence: the board so far, which guess the player is on, and session time. */
export function useGamePresence(
  mode: GameMode,
  puzzleNumber: number,
  answer: string,
  result: GuessResult,
  maxGuesses: number,
): void {
  useEffect(() => {
    updateGameActivity({
      game: GAME_META[mode].title,
      puzzleNumber,
      squares: result.guesses.map((g) => (g === answer ? "🟩" : "🟥")).join(""),
      guessCount: result.guesses.length,
      maxGuesses,
      done: result.done,
      won: result.won,
    });
  }, [mode, puzzleNumber, answer, result, maxGuesses]);
}

/**
 * `children` renders the puzzle for the current day. It is remounted when the
 * UTC day rolls over and after the player wipes their stats, so it can read
 * its result from storage once, on mount.
 */
export default function DailyGameWorkspace({
  theme,
  mode,
  playerName,
  description,
  clock,
  settings,
  onUpdateSettings,
  onChangeMode,
  onWipe,
  headerControls,
  help,
  children,
}: {
  theme: AppTheme;
  /** Which game this is; names the heading, the game switcher and the dialogs. */
  mode: GameMode;
  playerName?: string | null;
  description: string;
  clock: PuzzleClock;
  settings: ActivitySettings;
  onUpdateSettings: (patch: Partial<ActivitySettings>) => void;
  onChangeMode: (mode: GameMode) => void;
  /** Clears this game's stored results; the puzzle view remounts afterwards. */
  onWipe: () => void;
  /** Extra header controls, placed between the game switcher and the icon buttons. */
  headerControls?: ReactNode;
  /** The game's rules for the help dialog, one block per paragraph. */
  help: ReactNode;
  children: (puzzleNumber: number) => ReactNode;
}) {
  const [puzzleNumber, setPuzzleNumber] = useState(() => clock.currentPuzzleNumber());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Bumped when stats are wiped so the puzzle view remounts from empty storage.
  const [resetTick, setResetTick] = useState(0);

  // Move to the next puzzle when the UTC day rolls over while the activity is open.
  useEffect(() => {
    const t = setTimeout(() => setPuzzleNumber(clock.currentPuzzleNumber()), clock.msUntilNextPuzzle() + 250);
    return () => clearTimeout(t);
  }, [clock, puzzleNumber]);

  const { title } = GAME_META[mode];

  return (
    <div className="page-content">
      <div className="tool-container" style={{ maxWidth: 560 }}>
        <div
          className="tool-header"
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}
        >
          <div>
            <div className="tool-header-title" style={{ color: theme.text }}>
              {title} #{puzzleNumber} - A MapleDoro Game
            </div>
            <div className="tool-header-desc" style={{ color: theme.muted }}>
              {description}
              {playerName ? (
                <>
                  {" "}
                  Playing as <span style={{ color: theme.accentText, fontWeight: 700 }}>{playerName}</span>.
                </>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <SegmentedToggle
              theme={theme}
              groupLabel="Game"
              value={mode}
              options={GAME_MODES.map((m) => ({ value: m, label: GAME_META[m].shortLabel }))}
              onChange={onChangeMode}
            />
            {headerControls}
            <HeaderIconButton theme={theme} label="How to play" onClick={() => setHelpOpen(true)}>
              ?
            </HeaderIconButton>
            <HeaderIconButton theme={theme} label="Settings" onClick={() => setSettingsOpen(true)}>
              ⚙
            </HeaderIconButton>
          </div>
        </div>

        <Fragment key={`${puzzleNumber}:${resetTick}`}>{children(puzzleNumber)}</Fragment>

        {settingsOpen && (
          <SettingsDialog
            theme={theme}
            settings={settings}
            gameTitle={title}
            onUpdateSettings={onUpdateSettings}
            onWipe={() => {
              onWipe();
              setResetTick((n) => n + 1);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {helpOpen && (
          <HelpDialog theme={theme} gameName={title} onClose={() => setHelpOpen(false)}>
            {help}
          </HelpDialog>
        )}
      </div>
    </div>
  );
}
