/*
  Port of mapledoro's BgmGuesserWorkspace for the Discord Activity. The shared
  chrome (header, dialogs, rollover, guess picker, results) lives in
  ../DailyGameWorkspace and friends; this file keeps only the audio player and
  the area/boss mark icons.

  There is no hard mode: the BGM Guesser has a single difficulty.
*/

import { useMemo, useState } from "react";
import MarkIcon from "../components/MarkIcon";
import { EMPTY_RESULT, applyGuess } from "../dailyGame";
import DailyGameWorkspace, { useGamePresence } from "../DailyGameWorkspace";
import { reportGameResult } from "../discord";
import { GAME_META, type GameMode } from "../games";
import { GuessControls } from "../GuessControls";
import ResultsDialog from "../ResultsDialog";
import type { ActivitySettings } from "../settings";
import { GuessSlots } from "../shared-ui";
import { toolStyles, type AppTheme } from "../theme";
import BgmPlayer from "./BgmPlayer";
import {
  BGM_GUESSER_ANSWERS,
  MAX_GUESSES,
  PUZZLE_CLOCK,
  findBgmGuesserAnswer,
  getPuzzle,
} from "./puzzles";
import {
  computeBgmGuesserStats,
  readBgmGuesserResult,
  wipeBgmGuesserData,
  writeBgmGuesserResult,
} from "./storage";

const BASE_PATH = "/games/bgm-guesser";

const ANSWER_NAMES = BGM_GUESSER_ANSWERS.map((a) => a.name);

function AnswerMark({ name, size }: { name: string; size: number }) {
  const answer = findBgmGuesserAnswer(name);
  if (!answer) return null;
  return <MarkIcon id={answer.mark} size={size} style={{ imageRendering: "pixelated" }} />;
}

/* ------------------------------------------------------------------ */
/*  Single puzzle                                                      */
/* ------------------------------------------------------------------ */

function PuzzleView({ theme, puzzleNumber }: { theme: AppTheme; puzzleNumber: number }) {
  const puzzle = useMemo(() => getPuzzle(puzzleNumber), [puzzleNumber]);
  const styles = toolStyles(theme);
  const [result, setResult] = useState(() => readBgmGuesserResult(puzzleNumber) ?? EMPTY_RESULT);
  const [dialogOpen, setDialogOpen] = useState(false);

  const guessed = useMemo(() => new Set(result.guesses), [result.guesses]);

  useGamePresence("bgm", puzzleNumber, puzzle.answer, result, MAX_GUESSES);

  function handleSubmit(guess: string) {
    const next = applyGuess(result, guess, puzzle.answer, MAX_GUESSES);
    if (next === result) return;
    writeBgmGuesserResult(puzzleNumber, next);
    setResult(next);
    if (next.done) {
      // Feed the guild scoreboard card exactly once, at the finishing guess.
      reportGameResult("bgm", puzzleNumber, next.won, next.guesses.map((g) => g === puzzle.answer));
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

        <GuessControls
          theme={theme}
          done={result.done}
          options={ANSWER_NAMES}
          placeholder="Search areas and bosses…"
          ariaLabel="Guess an area or boss"
          guessed={guessed}
          renderOptionIcon={(name) => <AnswerMark name={name} size={30} />}
          onSubmit={handleSubmit}
          onViewResults={() => setDialogOpen(true)}
        />

        <GuessSlots theme={theme} guesses={result.guesses} answer={puzzle.answer} maxGuesses={MAX_GUESSES} />
      </div>

      {dialogOpen && (
        <ResultsDialog
          theme={theme}
          gameName={GAME_META.bgm.title}
          basePath={BASE_PATH}
          puzzleNumber={puzzleNumber}
          answer={puzzle.answer}
          result={result}
          maxGuesses={MAX_GUESSES}
          clock={PUZZLE_CLOCK}
          stats={computeBgmGuesserStats()}
          revealIcon={<AnswerMark name={puzzle.answer} size={44} />}
          revealHeading={puzzle.answer}
          revealSubheading={puzzle.title}
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
  return (
    <DailyGameWorkspace
      theme={theme}
      mode="bgm"
      playerName={playerName}
      description={`Name the area or boss the daily track plays for in ${MAX_GUESSES} tries.`}
      clock={PUZZLE_CLOCK}
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      onChangeMode={onChangeMode}
      onWipe={wipeBgmGuesserData}
      help={
        <>
          <div>
            Listen to the daily MapleStory track and name the area or boss it plays for in{" "}
            {MAX_GUESSES} tries. The track loops, so take as long as you like: scrub and replay it as
            often as you want. A new puzzle arrives every day at 00:00 UTC.
          </div>
          <div>
            Party quest themes answer as the area they sit in, and there are no hints. Every track is
            tied to one concrete place or boss fight.
          </div>
        </>
      }
    >
      {(puzzleNumber) => <PuzzleView theme={theme} puzzleNumber={puzzleNumber} />}
    </DailyGameWorkspace>
  );
}
