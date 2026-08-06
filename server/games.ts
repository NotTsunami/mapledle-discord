/*
  The two daily games and everything the server needs to tell them apart.

  Both roll over at 00:00 UTC, so a single rollover timer finalizes both, but
  they started on different days and allow a different number of guesses — each
  keeps its own puzzle numbering and its own scoreboard card.

  The epoch/guess values mirror the client (client/{skill,bgm}-guesser/puzzles.ts).
  Drift here means the card is numbered differently from the game it reports on.
*/

export type GameMode = "skill" | "bgm";

export const GAME_MODES: GameMode[] = ["skill", "bgm"];

export function isGameMode(value: unknown): value is GameMode {
  return value === "skill" || value === "bgm";
}

export interface GameConfig {
  /** UTC day of puzzle #1. */
  epochUtcMs: number;
  maxGuesses: number;
  /** Card heading, also the game's name everywhere else. */
  title: string;
  /** Card subtitle while the day is still running. */
  subtitle: string;
  /** Slash command that launches straight into this game. */
  command: string;
  /** Button label on the card. */
  buttonLabel: string;
  /** Message-component custom_id for that button. */
  launchButtonId: string;
  /** Attachment filename (Discord keys the embed off it). */
  filename: string;
  /** Hard mode exists in Mapledle only. */
  hasHardMode: boolean;
}

export const DAY_MS = 86_400_000;

export const GAMES: Record<GameMode, GameConfig> = {
  skill: {
    epochUtcMs: Date.UTC(2026, 5, 11),
    maxGuesses: 5,
    title: "Mapledle",
    subtitle: "Today's results: guess which class learns the skill shown",
    command: "/skill",
    buttonLabel: "Play Mapledle",
    launchButtonId: "launch_skill",
    filename: "mapledle.png",
    hasHardMode: true,
  },
  bgm: {
    epochUtcMs: Date.UTC(2026, 7, 4),
    maxGuesses: 3,
    title: "BGM Guesser",
    subtitle: "Today's results: name the area or boss the daily track plays for",
    command: "/bgm",
    buttonLabel: "Play BGM Guesser",
    launchButtonId: "launch_bgm",
    filename: "bgm-guesser.png",
    hasHardMode: false,
  },
};

/** The mode whose card carries this button, or null if it isn't a launch button. */
export function modeForLaunchButton(customId: string): GameMode | null {
  return GAME_MODES.find((mode) => GAMES[mode].launchButtonId === customId) ?? null;
}

export function currentPuzzleNumber(mode: GameMode, nowMs = Date.now()): number {
  return Math.max(1, Math.floor((nowMs - GAMES[mode].epochUtcMs) / DAY_MS) + 1);
}

/** Milliseconds until the next 00:00:00 UTC rollover (identical for both games). */
export function msUntilNextPuzzle(nowMs = Date.now()): number {
  return DAY_MS - ((nowMs - GAMES.skill.epochUtcMs) % DAY_MS);
}
