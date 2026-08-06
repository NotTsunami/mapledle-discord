/*
  The two daily games the activity hosts. Both roll over at 00:00 UTC, but they
  started on different days, so each keeps its own puzzle numbering, guess count
  and scoreboard card (see server/games.ts, which mirrors this).
*/

export type GameMode = "skill" | "bgm";

export const GAME_MODES: GameMode[] = ["skill", "bgm"];

export function isGameMode(value: unknown): value is GameMode {
  return value === "skill" || value === "bgm";
}

export interface GameMeta {
  /** Full name, used in headings and share text. */
  title: string;
  /** Short label for the header's game switcher. */
  shortLabel: string;
  /** Slash command that launches straight into this game. */
  command: string;
}

export const GAME_META: Record<GameMode, GameMeta> = {
  skill: { title: "Mapledle", shortLabel: "Skill", command: "/skill" },
  bgm: { title: "BGM Guesser", shortLabel: "BGM", command: "/bgm" },
};
