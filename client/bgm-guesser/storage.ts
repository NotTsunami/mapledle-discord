/*
  BGM Guesser's slice of the shared `mapledoro_games_v1` store; the Skill
  Guesser keeps its results in the same blob under its own section (see
  ../games-store.ts).
*/

import { computeGuessStats, type GuessResult, type GuessStats } from "../dailyGame";
import { readResult, readResults, wipeResults, writeResult } from "../games-store";
import { MAX_GUESSES } from "./puzzles";

const SECTION = "bgmGuesser";

export function readBgmGuesserResult(puzzleNumber: number): GuessResult | null {
  return readResult(SECTION, puzzleNumber);
}

export function writeBgmGuesserResult(puzzleNumber: number, result: GuessResult): void {
  writeResult(SECTION, puzzleNumber, result);
}

export function wipeBgmGuesserData(): void {
  wipeResults(SECTION);
}

export function computeBgmGuesserStats(): GuessStats {
  return computeGuessStats(Object.values(readResults(SECTION)), MAX_GUESSES);
}
