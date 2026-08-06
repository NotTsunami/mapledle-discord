/*
  JSON-file store for the daily per-guild scoreboards behind the custom launch
  cards. Persisted to DATA_DIR (a docker volume in production) so a container
  restart doesn't lose the day's results. Single process, low write volume —
  synchronous atomic writes (tmp + rename) are plenty.

  Each game keeps its own tree: the two run on different epochs, so "day 42"
  means a different date in each, and their cards are separate messages.
*/

import fs from "node:fs";
import path from "node:path";
import { GAME_MODES, type GameMode } from "./games.ts";

export interface PlayerResult {
  /** Display name at the time they finished. */
  name: string;
  /** Avatar hash, or null for the default avatar. */
  avatar: string | null;
  won: boolean;
  /** Mapledle only: solved against the skill name (hard) rather than the class. */
  hardMode: boolean;
  /** Per-guess hit/miss, in order. */
  marks: boolean[];
  /** Finish time (ms epoch), used for row ordering. */
  at: number;
}

export interface GuildDay {
  players: Record<string, PlayerResult>;
  /** Scoreboard message per channel we've posted in: channelId -> messageId. */
  messages: Record<string, string>;
}

/** puzzleNumber -> guildId -> results, for one game. */
type ModeDays = Record<string, Record<string, GuildDay>>;

interface StoreShape {
  version: 2;
  games: Record<GameMode, ModeDays>;
  /** Last day whose end-of-day final scoreboards have been posted, per game. */
  finalizedDay: Partial<Record<GameMode, number>>;
}

const DATA_DIR = process.env.DATA_DIR ?? path.resolve("data");
const FILE = path.join(DATA_DIR, "scoreboards.json");

function emptyStore(): StoreShape {
  return { version: 2, games: { skill: {}, bgm: {} }, finalizedDay: {} };
}

let store: StoreShape = emptyStore();

/*
  A version-1 file (single game, no `games` key) is discarded rather than
  migrated: it only ever holds today and yesterday, so the cost is one duplicate
  card in each channel that already had one when the new build rolled out.
*/
export function loadStore(): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreShape;
    if (parsed?.version === 2 && parsed.games) {
      store = { ...emptyStore(), ...parsed };
      for (const mode of GAME_MODES) store.games[mode] ??= {};
    }
  } catch {
    /* first run or unreadable — start empty */
  }
}

function save(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, FILE);
}

/* Keep yesterday around for UTC-rollover stragglers; drop anything older. */
function prune(mode: GameMode, currentDay: number): void {
  const days = store.games[mode];
  for (const key of Object.keys(days)) {
    if (Number(key) < currentDay - 1) delete days[key];
  }
}

export function getGuildDay(mode: GameMode, day: number, guildId: string): GuildDay | null {
  return store.games[mode][String(day)]?.[guildId] ?? null;
}

/** Every guild with results or cards for the day: guildId -> entry. */
export function getDayGuilds(mode: GameMode, day: number): Record<string, GuildDay> {
  return store.games[mode][String(day)] ?? {};
}

export function getFinalizedDay(mode: GameMode): number {
  return store.finalizedDay[mode] ?? 0;
}

export function setFinalizedDay(mode: GameMode, day: number): void {
  store.finalizedDay[mode] = day;
  save();
}

function ensureGuildDay(mode: GameMode, day: number, guildId: string): GuildDay {
  const days = (store.games[mode][String(day)] ??= {});
  return (days[guildId] ??= { players: {}, messages: {} });
}

export function recordResult(
  mode: GameMode,
  day: number,
  guildId: string,
  userId: string,
  result: PlayerResult,
  currentDay: number,
): void {
  const entry = ensureGuildDay(mode, day, guildId);
  // First finish wins; a re-report (e.g. after wiping stats) doesn't overwrite.
  entry.players[userId] ??= result;
  prune(mode, currentDay);
  save();
}

export function setScoreboardMessage(
  mode: GameMode,
  day: number,
  guildId: string,
  channelId: string,
  messageId: string,
): void {
  ensureGuildDay(mode, day, guildId).messages[channelId] = messageId;
  save();
}

export function clearScoreboardMessage(
  mode: GameMode,
  day: number,
  guildId: string,
  channelId: string,
): void {
  const entry = getGuildDay(mode, day, guildId);
  if (!entry) return;
  delete entry.messages[channelId];
  save();
}
