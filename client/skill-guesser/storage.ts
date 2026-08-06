/*
  Skill Guesser's slice of the shared `mapledoro_games_v1` store; the BGM
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

export type SkillGuesserResult = GameResult;
export type SkillGuesserStats = GameStats;

export function readSkillGuesserResult(puzzleNumber: number): SkillGuesserResult | null {
  return readResult("skillGuesser", puzzleNumber);
}

export function writeSkillGuesserResult(puzzleNumber: number, result: SkillGuesserResult): void {
  writeResult("skillGuesser", puzzleNumber, result);
}

export function wipeSkillGuesserData(): void {
  wipeResults("skillGuesser");
}

export function computeSkillGuesserStats(): SkillGuesserStats {
  return computeStats("skillGuesser", MAX_GUESSES);
}
