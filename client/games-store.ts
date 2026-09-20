/*
  Shared localStorage blob for game results (`mapledoro_games_v1`, mirroring
  globalToolsStore's shape/versioning).

  Both games keep their own section under this one key. Every write reads the
  whole store and writes it back, so each game preserves the other's section --
  keep it that way rather than rebuilding the object from known keys, which is
  how the website's two storage modules share the same key.

  The activity stays on `version: 1` where the website is on 2. The two never
  share an origin, so there's nothing to be compatible with, and bumping it
  would throw away the results of everyone who has already played here.
*/

import type { GuessResult } from "./dailyGame";

const STORAGE_KEY = "mapledoro_games_v1";

export type GamesStoreSection = "skillGuesser" | "bgmGuesser";

interface GamesStore {
  version: 1;
  skillGuesser?: { results: Record<string, GuessResult> };
  bgmGuesser?: { results: Record<string, GuessResult> };
  [section: string]: unknown;
}

function readStore(): GamesStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed?.version === 1) return parsed as GamesStore;
  } catch { /* ignore */ }
  return { version: 1 };
}

export function readResults(section: GamesStoreSection): Record<string, GuessResult> {
  return readStore()[section]?.results ?? {};
}

export function readResult(section: GamesStoreSection, puzzleNumber: number): GuessResult | null {
  return readResults(section)[String(puzzleNumber)] ?? null;
}

export function writeResult(
  section: GamesStoreSection,
  puzzleNumber: number,
  result: GuessResult,
): void {
  const store = readStore();
  const results = { ...store[section]?.results, [String(puzzleNumber)]: result };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, [section]: { results } }));
  } catch { /* ignore */ }
}

/** Clears one game's saved results (and with them its stats), today's progress included. */
export function wipeResults(section: GamesStoreSection): void {
  const store = readStore();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, [section]: { results: {} } }));
  } catch { /* ignore */ }
}
