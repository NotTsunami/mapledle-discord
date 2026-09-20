/*
  Skill Guesser's slice of the shared `mapledoro_games_v1` store; the BGM
  Guesser keeps its results in the same blob under its own section (see
  ../games-store.ts).

  Unlike the website, which keeps a Normal and a Hard result per puzzle, the
  activity stores one result per puzzle: the difficulty is chosen before the
  first guess and locked for the day.
*/

import { computeGuessStats, type GuessResult, type GuessStats } from "../dailyGame";
import { readResult, readResults, wipeResults, writeResult } from "../games-store";
import { MAX_GUESSES } from "./puzzles";

const SECTION = "skillGuesser";

export function readSkillGuesserResult(puzzleNumber: number): GuessResult | null {
  return readResult(SECTION, puzzleNumber);
}

export function writeSkillGuesserResult(puzzleNumber: number, result: GuessResult): void {
  writeResult(SECTION, puzzleNumber, result);
}

export function wipeSkillGuesserData(): void {
  wipeResults(SECTION);
}

export function computeSkillGuesserStats(): GuessStats {
  return computeGuessStats(Object.values(readResults(SECTION)), MAX_GUESSES);
}
