/*
  Port of mapledoro's SkillGuesserWorkspace for the Discord Activity. The
  shared chrome (header, dialogs, rollover, guess picker, results) lives in
  ../DailyGameWorkspace and friends; this file keeps only what is Mapledle's:
  the icon prompt, the hint cards, and hard mode.

  Hard mode deliberately differs from the website. There, Hard unlocks after
  Normal is finished and each day has a result per mode. Here it is a header
  toggle picked before the first guess (hard mode asks for the skill name
  instead of the class), locked for the rest of the day once the player has
  guessed, and each puzzle has a single result.
*/

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { SegmentedToggle } from "../components/HeaderControls";
import { EMPTY_RESULT, applyGuess } from "../dailyGame";
import DailyGameWorkspace, { useGamePresence } from "../DailyGameWorkspace";
import { reportGameResult } from "../discord";
import { GAME_META, type GameMode } from "../games";
import { GuessControls } from "../GuessControls";
import ResultsDialog from "../ResultsDialog";
import type { ActivitySettings } from "../settings";
import { GuessSlots } from "../shared-ui";
import { toolStyles, type AppTheme } from "../theme";
import { SKILL_GUESSER_CLASSES, findSkillGuesserClass } from "./classes";
import {
  MAX_GUESSES,
  PUZZLE_CLOCK,
  allSkillNames,
  getPuzzle,
  type SkillGuesserPuzzle,
} from "./puzzles";
import PuzzleSkillIcon from "./PuzzleSkillIcon";
import {
  computeSkillGuesserStats,
  readSkillGuesserResult,
  wipeSkillGuesserData,
  writeSkillGuesserResult,
} from "./storage";

const BASE_PATH = "/games/skill-guesser";

const iconFrame: CSSProperties = {
  width: 84,
  height: 84,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

/* ------------------------------------------------------------------ */
/*  Hints                                                              */
/* ------------------------------------------------------------------ */

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
      <style>{`@media (max-width: 560px) { .sg-hints { grid-template-columns: 1fr !important; } }`}</style>
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
/*  Single puzzle                                                      */
/* ------------------------------------------------------------------ */

function PuzzleView({
  theme,
  puzzleNumber,
  hardMode,
  onProgress,
}: {
  theme: AppTheme;
  puzzleNumber: number;
  hardMode: boolean;
  /** Whether today's puzzle has any guesses yet; the workspace locks the difficulty toggle on it. */
  onProgress: (started: boolean) => void;
}) {
  const puzzle = useMemo(() => getPuzzle(puzzleNumber), [puzzleNumber]);
  const styles = toolStyles(theme);
  const [result, setResult] = useState(() => readSkillGuesserResult(puzzleNumber) ?? EMPTY_RESULT);
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

  useGamePresence("skill", puzzleNumber, answer, result, MAX_GUESSES);

  // The stored guesses are scored against one answer key (skill vs class), so
  // switching difficulty mid-game would mismatch every prior guess.
  useEffect(() => onProgress(result.guesses.length > 0), [result, onProgress]);

  function handleSubmit(guess: string) {
    const next = applyGuess(result, guess, answer, MAX_GUESSES);
    if (next === result) return;
    writeSkillGuesserResult(puzzleNumber, next);
    setResult(next);
    if (next.done) {
      // Feed the guild scoreboard card exactly once, at the finishing guess.
      reportGameResult("skill", puzzleNumber, next.won, next.guesses.map((g) => g === answer), hardMode);
      setTimeout(() => setDialogOpen(true), 700);
    }
  }

  return (
    <>
      <div className="fade-in panel-card" style={styles.sectionPanel}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", marginBottom: "0.85rem" }}>
          <div style={{ ...iconFrame, border: `1px solid ${theme.border}`, background: theme.timerBg }}>
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
                ? `The skill was ${puzzle.skillName} (${puzzle.className})`
                : `The answer was ${puzzle.className} (${puzzle.skillName})`
              : `${MAX_GUESSES - result.guesses.length} of ${MAX_GUESSES} guesses remaining${hardMode ? " · Hard Mode" : ""}`}
          </div>
        </div>

        <GuessControls
          theme={theme}
          done={result.done}
          options={options}
          placeholder={hardMode ? "Search skills…" : "Search classes…"}
          ariaLabel={hardMode ? "Guess a skill" : "Guess a class"}
          guessed={guessed}
          onSubmit={handleSubmit}
          onViewResults={() => setDialogOpen(true)}
        />

        <div style={{ display: "grid", gap: "0.8rem" }}>
          <GuessSlots theme={theme} guesses={result.guesses} answer={answer} maxGuesses={MAX_GUESSES} />
          <HintCards theme={theme} puzzle={puzzle} failedCount={failedCount} />
        </div>
      </div>

      {dialogOpen && (
        <ResultsDialog
          theme={theme}
          gameName={GAME_META.skill.title}
          basePath={BASE_PATH}
          puzzleNumber={puzzleNumber}
          modeTag={hardMode ? " (Hard)" : ""}
          answer={answer}
          result={result}
          maxGuesses={MAX_GUESSES}
          clock={PUZZLE_CLOCK}
          stats={computeSkillGuesserStats()}
          revealIcon={
            <PuzzleSkillIcon
              puzzle={puzzle}
              size={44}
              alt={puzzle.skillName}
              style={{ imageRendering: "pixelated" }}
            />
          }
          revealHeading={puzzle.className}
          revealSubheading={puzzle.skillName}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                          */
/* ------------------------------------------------------------------ */

export default function SkillGuesserWorkspace({
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
  // Once today's puzzle has any guesses, the difficulty toggle locks until the
  // next puzzle (the puzzle view reports this fresh whenever it mounts).
  const [started, setStarted] = useState(false);

  return (
    <DailyGameWorkspace
      theme={theme}
      mode="skill"
      playerName={playerName}
      description={`Guess which class learns the daily skill in ${MAX_GUESSES} tries.`}
      clock={PUZZLE_CLOCK}
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      onChangeMode={onChangeMode}
      onWipe={wipeSkillGuesserData}
      headerControls={
        <SegmentedToggle
          theme={theme}
          groupLabel="Difficulty"
          value={settings.hardMode ? "hard" : "normal"}
          options={[
            { value: "normal", label: "Normal" },
            { value: "hard", label: "Hard" },
          ]}
          disabled={started}
          disabledTitle="Finish today's puzzle to switch difficulty"
          onChange={(v) => onUpdateSettings({ hardMode: v === "hard" })}
        />
      }
      help={
        <>
          <div>
            Guess which MapleStory class learns the daily skill in {MAX_GUESSES} tries. Wrong guesses
            unlock hints: the class&apos;s main stat after 2 misses, its secondary stat after 3, and its
            weapon after 4. A new puzzle arrives every day at 00:00 UTC.
          </div>
          <div>
            Switch to <strong>Hard</strong> in the header to name the skill itself instead of the class.
            Pick your difficulty before your first guess: it locks in for the day once you start.
          </div>
        </>
      }
    >
      {(puzzleNumber) => (
        // Keyed by difficulty so the board re-reads its answer pool when it changes.
        <PuzzleView
          key={settings.hardMode ? "hard" : "normal"}
          theme={theme}
          puzzleNumber={puzzleNumber}
          hardMode={settings.hardMode}
          onProgress={setStarted}
        />
      )}
    </DailyGameWorkspace>
  );
}
