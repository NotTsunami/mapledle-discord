/*
  JSON-file store for the daily per-guild scoreboards behind the custom launch
  card. Persisted to DATA_DIR (a docker volume in production) so a container
  restart doesn't lose the day's results. Single process, low write volume —
  synchronous atomic writes (tmp + rename) are plenty.
*/

import fs from "node:fs";
import path from "node:path";

export interface PlayerResult {
  /** Display name at the time they finished. */
  name: string;
  /** Avatar hash, or null for the default avatar. */
  avatar: string | null;
  won: boolean;
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

interface StoreShape {
  version: 1;
  /** puzzleNumber -> guildId -> results. */
  days: Record<string, Record<string, GuildDay>>;
}

const DATA_DIR = process.env.DATA_DIR ?? path.resolve("data");
const FILE = path.join(DATA_DIR, "scoreboards.json");

let store: StoreShape = { version: 1, days: {} };

export function loadStore(): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreShape;
    if (parsed?.version === 1 && parsed.days) store = parsed;
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
function prune(currentDay: number): void {
  for (const key of Object.keys(store.days)) {
    if (Number(key) < currentDay - 1) delete store.days[key];
  }
}

export function getGuildDay(day: number, guildId: string): GuildDay | null {
  return store.days[String(day)]?.[guildId] ?? null;
}

function ensureGuildDay(day: number, guildId: string): GuildDay {
  const days = (store.days[String(day)] ??= {});
  return (days[guildId] ??= { players: {}, messages: {} });
}

export function recordResult(
  day: number,
  guildId: string,
  userId: string,
  result: PlayerResult,
  currentDay: number,
): void {
  const entry = ensureGuildDay(day, guildId);
  // First finish wins; a re-report (e.g. after wiping stats) doesn't overwrite.
  entry.players[userId] ??= result;
  prune(currentDay);
  save();
}

export function setScoreboardMessage(day: number, guildId: string, channelId: string, messageId: string): void {
  ensureGuildDay(day, guildId).messages[channelId] = messageId;
  save();
}

export function clearScoreboardMessage(day: number, guildId: string, channelId: string): void {
  const entry = getGuildDay(day, guildId);
  if (!entry) return;
  delete entry.messages[channelId];
  save();
}
