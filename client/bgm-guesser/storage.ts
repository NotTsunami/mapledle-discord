/*
  BGM Guesser's slice of the shared `mapledoro_games_v1` store; the Skill
  Guesser keeps its results in the same blob under its own section (see
  ../games-store.ts).
*/

import {
  computeStats,
  readResult,
  wipeResults,
  writeResult,
  type GameResult,
  type GameStats,
} from "../games-store";
import { MAX_GUESSES } from "./puzzles";

export type BgmGuesserResult = GameResult;
export type BgmGuesserStats = GameStats;

export function readBgmGuesserResult(puzzleNumber: number): BgmGuesserResult | null {
  return readResult("bgmGuesser", puzzleNumber);
}

export function writeBgmGuesserResult(puzzleNumber: number, result: BgmGuesserResult): void {
  writeResult("bgmGuesser", puzzleNumber, result);
}

export function wipeBgmGuesserData(): void {
  wipeResults("bgmGuesser");
}

export function computeBgmGuesserStats(): BgmGuesserStats {
  return computeStats("bgmGuesser", MAX_GUESSES);
}
