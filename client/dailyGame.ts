/*
  Logic shared by the daily guessing games (Mapledle, BGM Guesser): the result
  each game stores per puzzle, the stats derived from those results, and the UTC
  day clock that turns a game's epoch into puzzle numbers.
*/

export interface GuessResult {
  guesses: string[];
  won: boolean;
  done: boolean;
}

export const EMPTY_RESULT: GuessResult = { guesses: [], won: false, done: false };

/**
 * `prev` with `guess` scored against `answer`. Returns `prev` itself when the
 * game is already over or the guess repeats, so callers can skip the write.
 */
export function applyGuess(
  prev: GuessResult,
  guess: string,
  answer: string,
  maxGuesses: number,
): GuessResult {
  if (prev.done || prev.guesses.includes(guess)) return prev;
  const guesses = [...prev.guesses, guess];
  const won = guess === answer;
  return { guesses, won, done: won || guesses.length >= maxGuesses };
}

export interface GuessStats {
  played: number;
  /** Whole percent, 0-100. */
  winRate: number;
  /** Average guesses across wins, or null before the first win. */
  avgGuesses: number | null;
  /** Wins by guess count (index i = i+1 guesses), last index = losses. */
  distribution: number[];
}

/** Stats over finished results; in-progress ones (`done: false`) are ignored. */
export function computeGuessStats(results: GuessResult[], maxGuesses: number): GuessStats {
  const finished = results.filter((r) => r.done);
  const distribution = Array.from({ length: maxGuesses + 1 }, () => 0);
  let wins = 0;
  let winGuessTotal = 0;
  for (const r of finished) {
    if (r.won) {
      wins += 1;
      winGuessTotal += r.guesses.length;
      distribution[Math.min(r.guesses.length, maxGuesses) - 1] += 1;
    } else {
      distribution[maxGuesses] += 1;
    }
  }
  return {
    played: finished.length,
    winRate: finished.length > 0 ? Math.round((wins / finished.length) * 100) : 0,
    avgGuesses: wins > 0 ? winGuessTotal / wins : null,
    distribution,
  };
}

export interface PuzzleClock {
  currentPuzzleNumber(nowMs?: number): number;
  /** UTC midnight (epoch ms) a given puzzle number went live. */
  puzzleDateMs(puzzleNumber: number): number;
  /** Milliseconds until the next 00:00:00 UTC rollover. */
  msUntilNextPuzzle(nowMs?: number): number;
}

const DAY_MS = 86_400_000;

/** Puzzle numbering for a game whose puzzle #1 ran on the UTC day of `epochUtcMs`. */
export function makePuzzleClock(epochUtcMs: number): PuzzleClock {
  return {
    currentPuzzleNumber: (nowMs = Date.now()) =>
      Math.max(1, Math.floor((nowMs - epochUtcMs) / DAY_MS) + 1),
    puzzleDateMs: (puzzleNumber) => epochUtcMs + (puzzleNumber - 1) * DAY_MS,
    msUntilNextPuzzle: (nowMs = Date.now()) => DAY_MS - ((nowMs - epochUtcMs) % DAY_MS),
  };
}
