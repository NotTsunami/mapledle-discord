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

const STORAGE_KEY = "mapledoro_games_v1";

export interface GameResult {
  guesses: string[];
  won: boolean;
  done: boolean;
}

export type GamesStoreSection = "skillGuesser" | "bgmGuesser";

interface GamesStore {
  version: 1;
  skillGuesser?: { results: Record<string, GameResult> };
  bgmGuesser?: { results: Record<string, GameResult> };
  [section: string]: unknown;
}

function readStore(): GamesStore {
  if (typeof window === "undefined") return { version: 1 };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed?.version === 1) return parsed as GamesStore;
  } catch { /* ignore */ }
  return { version: 1 };
}

export function readResults(section: GamesStoreSection): Record<string, GameResult> {
  return readStore()[section]?.results ?? {};
}

export function readResult(section: GamesStoreSection, puzzleNumber: number): GameResult | null {
  return readResults(section)[String(puzzleNumber)] ?? null;
}

export function writeResult(
  section: GamesStoreSection,
  puzzleNumber: number,
  result: GameResult,
): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  const results = { ...store[section]?.results, [String(puzzleNumber)]: result };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, [section]: { results } }));
  } catch { /* ignore */ }
}

/** Clears one game's saved results (and with them its stats), today's progress included. */
export function wipeResults(section: GamesStoreSection): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, [section]: { results: {} } }));
  } catch { /* ignore */ }
}

export interface GameStats {
  played: number;
  /** Whole percent, 0-100. */
  winRate: number;
  /** Average guesses across wins, or null before the first win. */
  avgGuesses: number | null;
  /** Wins by guess count (index i = i+1 guesses), last index = losses. */
  distribution: number[];
}

export function computeStats(section: GamesStoreSection, maxGuesses: number): GameStats {
  const results = Object.values(readResults(section)).filter((r) => r.done);
  const distribution = Array.from({ length: maxGuesses + 1 }, () => 0);
  let wins = 0;
  let winGuessTotal = 0;
  for (const r of results) {
    if (r.won) {
      wins += 1;
      winGuessTotal += r.guesses.length;
      distribution[Math.min(r.guesses.length, maxGuesses) - 1] += 1;
    } else {
      distribution[maxGuesses] += 1;
    }
  }
  return {
    played: results.length,
    winRate: results.length > 0 ? Math.round((wins / results.length) * 100) : 0,
    avgGuesses: wins > 0 ? winGuessTotal / wins : null,
    distribution,
  };
}
