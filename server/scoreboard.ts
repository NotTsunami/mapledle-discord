/*
  Wordle-style daily scoreboard card.

  When the activity is launched from a channel (entry-point interaction) we
  post a generated PNG showing everyone in the guild who has finished today's
  puzzle — avatar, name, and their guess row — plus a "Play" button that
  re-launches the activity. As more results arrive via POST /api/result, the
  card is edited in place. When the UTC day rolls over, the finished board is
  posted again as a new "final results" message; the next day's results then
  start a fresh card rather than touching the old one (cards are keyed by
  puzzle number).

  Rendering uses @napi-rs/canvas; the guess squares are drawn as rects. Names
  can contain CJK characters and emoji, so the container ships font-dejavu
  (Latin), font-noto-cjk (CJK), and font-noto-emoji (emoji) — see the Dockerfile.
*/

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import {
  clearScoreboardMessage,
  getDayGuilds,
  getFinalizedDay,
  getGuildDay,
  setFinalizedDay,
  setScoreboardMessage,
  type PlayerResult,
} from "./store.ts";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const API_BASE = "https://discord.com/api/v10";

export const LAUNCH_BUTTON_ID = "launch_activity";

/* Mirrors client/skill-guesser/puzzles.ts — puzzle #1 ran on the epoch day. */
const EPOCH_UTC_MS = Date.UTC(2026, 5, 11);
const DAY_MS = 86_400_000;
export const MAX_GUESSES = 5;

export function currentPuzzleNumber(nowMs = Date.now()): number {
  return Math.max(1, Math.floor((nowMs - EPOCH_UTC_MS) / DAY_MS) + 1);
}

/** Milliseconds until the next 00:00:00 UTC rollover (mirrors the client). */
export function msUntilNextPuzzle(nowMs = Date.now()): number {
  return DAY_MS - ((nowMs - EPOCH_UTC_MS) % DAY_MS);
}

export function scoreboardEnabled(): boolean {
  return Boolean(BOT_TOKEN);
}

/* ------------------------------------------------------------------ */
/*  Image rendering                                                    */
/* ------------------------------------------------------------------ */

// Dark-theme palette matching the activity (client/theme.ts).
const C = {
  bg: "#1a1a22",
  rowBg: "#141418",
  border: "#2a2a34",
  text: "#e0ddd8",
  muted: "#807a85",
  accent: "#e89a50",
  hit: "#2d8a2d",
  miss: "#c44040",
};

// CJK and emoji families are listed explicitly so those names pick the right font
// (Han disambiguation, color emoji); every other script (Arabic, Thai, Sinhala, …)
// is covered by font-noto-all and resolves via @napi-rs/canvas's per-glyph fallback
// across loaded system fonts — see the Dockerfile.
const FONT =
  '"DejaVu Sans", "Noto Sans CJK SC", "Noto Sans CJK", "Noto Color Emoji", "Noto Emoji", "Segoe UI", sans-serif';
const WIDTH = 640;
const PAD = 24;
const HEADER_H = 86;
const ROW_H = 52;
const MAX_ROWS = 10;

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/* Small in-memory avatar cache; entries are tiny and reset on redeploy. */
const avatarCache = new Map<string, Promise<Image | null>>();

function avatarUrl(userId: string, hash: string | null): string {
  if (hash) return `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64`;
  const index = Number(BigInt(userId) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function fetchAvatar(userId: string, hash: string | null): Promise<Image | null> {
  const key = `${userId}:${hash ?? ""}`;
  let cached = avatarCache.get(key);
  if (!cached) {
    if (avatarCache.size > 500) avatarCache.clear();
    cached = (async () => {
      try {
        const res = await fetch(avatarUrl(userId, hash));
        if (!res.ok) return null;
        return await loadImage(Buffer.from(await res.arrayBuffer()));
      } catch {
        return null;
      }
    })();
    avatarCache.set(key, cached);
  }
  return cached;
}

function drawAvatar(ctx: SKRSContext2D, img: Image | null, name: string, x: number, y: number, size: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = "#3a3a46";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = C.text;
    ctx.font = `bold ${Math.round(size * 0.5)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((name[0] ?? "?").toUpperCase(), x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
}

/** Small accent pill marking a hard-mode result. Returns its drawn width. */
function drawHardBadge(ctx: SKRSContext2D, x: number, centerY: number): number {
  const label = "HARD";
  ctx.font = `bold 10px ${FONT}`;
  const padX = 6;
  const h = 16;
  const w = ctx.measureText(label).width + padX * 2;
  ctx.fillStyle = C.accent;
  roundRect(ctx, x, centerY - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, centerY + 1);
  return w;
}

function drawGuessRow(ctx: SKRSContext2D, marks: boolean[], rightX: number, centerY: number): void {
  const cell = 22;
  const gap = 5;
  const total = MAX_GUESSES * cell + (MAX_GUESSES - 1) * gap;
  const startX = rightX - total;
  for (let i = 0; i < MAX_GUESSES; i++) {
    const x = startX + i * (cell + gap);
    const mark = marks[i];
    if (mark === undefined) {
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x + 0.75, centerY - cell / 2 + 0.75, cell - 1.5, cell - 1.5, 5);
      ctx.stroke();
    } else {
      ctx.fillStyle = mark ? C.hit : C.miss;
      roundRect(ctx, x, centerY - cell / 2, cell, cell, 5);
      ctx.fill();
    }
  }
}

export interface PlayerRow extends PlayerResult {
  userId: string;
}

/** Exported for scripts/preview-scoreboard.mjs. */
export async function renderScoreboard(day: number, players: PlayerRow[], final = false): Promise<Buffer> {
  const sorted = [...players].sort((a, b) => {
    if (a.won !== b.won) return a.won ? -1 : 1;
    if (a.marks.length !== b.marks.length) return a.marks.length - b.marks.length;
    return a.at - b.at;
  });
  const rows = sorted.slice(0, MAX_ROWS);
  const overflow = sorted.length - rows.length;

  const bodyH = rows.length > 0 ? rows.length * (ROW_H + 8) - 8 : 48;
  const footerH = overflow > 0 ? 30 : 0;
  const height = HEADER_H + bodyH + footerH + PAD;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  // Header
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = C.accent;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText(`Mapledle #${day}`, PAD, 42);
  ctx.fillStyle = C.muted;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(
    final
      ? "Final results — hit Play to take on today's puzzle"
      : "Today's results — guess which class learns the skill shown",
    PAD,
    66,
  );

  if (rows.length === 0) {
    ctx.fillStyle = C.text;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("No results yet — be the first to solve it!", WIDTH / 2, HEADER_H + 26);
    return canvas.encode("png");
  }

  const avatars = await Promise.all(rows.map((p) => fetchAvatar(p.userId, p.avatar)));

  rows.forEach((p, i) => {
    const y = HEADER_H + i * (ROW_H + 8);

    ctx.fillStyle = C.rowBg;
    roundRect(ctx, PAD, y, WIDTH - PAD * 2, ROW_H, 10);
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    roundRect(ctx, PAD + 0.5, y + 0.5, WIDTH - PAD * 2 - 1, ROW_H - 1, 10);
    ctx.stroke();

    drawAvatar(ctx, avatars[i] ?? null, p.name, PAD + 10, y + (ROW_H - 36) / 2, 36);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    ctx.font = `bold 15px ${FONT}`;
    // Reserve room for the HARD badge so a long name can't run into it.
    const nameX = PAD + 58;
    const name = truncate(ctx, p.name, p.hardMode ? 230 : 280);
    ctx.fillText(name, nameX, y + ROW_H / 2 + 1);
    if (p.hardMode) {
      drawHardBadge(ctx, nameX + ctx.measureText(name).width + 8, y + ROW_H / 2);
    }

    const score = p.won ? `${p.marks.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    ctx.textAlign = "right";
    ctx.fillStyle = p.won ? C.text : C.muted;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(score, WIDTH - PAD - 12, y + ROW_H / 2 + 1);

    drawGuessRow(ctx, p.marks, WIDTH - PAD - 56, y + ROW_H / 2);
  });

  if (overflow > 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`+${overflow} more played today`, PAD, HEADER_H + bodyH + 22);
  }

  return canvas.encode("png");
}

/* ------------------------------------------------------------------ */
/*  Discord REST                                                       */
/* ------------------------------------------------------------------ */

function messagePayload(): unknown {
  return {
    components: [
      {
        type: 1, // action row
        components: [
          { type: 2, style: 1, label: "Play Mapledle", custom_id: LAUNCH_BUTTON_ID },
        ],
      },
    ],
    attachments: [{ id: 0, filename: "scoreboard.png" }],
  };
}

async function discordRequest(method: string, path: string, payload: unknown, png: Buffer): Promise<Response> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append("files[0]", new Blob([new Uint8Array(png)], { type: "image/png" }), "scoreboard.png");
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
    body: form,
  });
}

/* Serialize per channel so two quick launches can't double-post a card. */
const channelLocks = new Map<string, Promise<void>>();

function withChannelLock(channelId: string, fn: () => Promise<void>): Promise<void> {
  const prev = channelLocks.get(channelId) ?? Promise.resolve();
  const next = prev.then(fn).catch((err: unknown) => console.error("scoreboard error:", err));
  channelLocks.set(channelId, next);
  return next;
}

function playerRows(day: number, guildId: string): PlayerRow[] {
  const entry = getGuildDay(day, guildId);
  return entry ? Object.entries(entry.players).map(([userId, result]) => ({ userId, ...result })) : [];
}

/** Post the day's card in a channel, or refresh it if one already exists. */
export function postOrUpdateScoreboard(day: number, guildId: string, channelId: string): Promise<void> {
  if (!BOT_TOKEN) return Promise.resolve();
  return withChannelLock(channelId, async () => {
    const png = await renderScoreboard(day, playerRows(day, guildId), day < currentPuzzleNumber());
    const payload = messagePayload();
    const entry = getGuildDay(day, guildId);

    const existing = entry?.messages[channelId];
    if (existing) {
      const res = await discordRequest("PATCH", `/channels/${channelId}/messages/${existing}`, payload, png);
      if (res.ok) return;
      if (res.status !== 404) {
        console.error(`scoreboard edit failed (${res.status}): ${await res.text()}`);
        return;
      }
      // Message was deleted — fall through and post a fresh one.
      clearScoreboardMessage(day, guildId, channelId);
    }

    const res = await discordRequest("POST", `/channels/${channelId}/messages`, payload, png);
    if (!res.ok) {
      // Most commonly missing SEND_MESSAGES permission in that channel.
      console.error(`scoreboard post failed (${res.status}): ${await res.text()}`);
      return;
    }
    const message = (await res.json()) as { id: string };
    setScoreboardMessage(day, guildId, channelId, message.id);
  });
}

/**
  Refresh every channel card this guild has for the day (after a new result).
  `alsoChannelId` — the channel the result came from — gets a fresh post if no
  card exists for the day there yet (e.g. the player launched from a previous
  day's card), instead of editing that old post.
*/
export async function updateGuildScoreboards(day: number, guildId: string, alsoChannelId?: string): Promise<void> {
  const entry = getGuildDay(day, guildId);
  const channels = new Set(entry ? Object.keys(entry.messages) : []);
  if (alsoChannelId) channels.add(alsoChannelId);
  for (const channelId of channels) {
    await postOrUpdateScoreboard(day, guildId, channelId);
  }
}

/*
  End-of-day finalization: when the UTC day rolls over, post each channel's
  finished scoreboard as a NEW message (the play button now launches the next
  puzzle). The new message replaces the old one in the store, so any straggler
  results that arrive in the rollover grace window edit the final post.
*/
export async function postFinalScoreboards(): Promise<void> {
  if (!BOT_TOKEN) return;
  const endedDay = currentPuzzleNumber() - 1;
  if (endedDay < 1 || getFinalizedDay() >= endedDay) return;
  setFinalizedDay(endedDay);

  for (const [guildId, entry] of Object.entries(getDayGuilds(endedDay))) {
    for (const channelId of Object.keys(entry.messages)) {
      await withChannelLock(channelId, async () => {
        const png = await renderScoreboard(endedDay, playerRows(endedDay, guildId), true);
        const res = await discordRequest("POST", `/channels/${channelId}/messages`, messagePayload(), png);
        if (!res.ok) {
          console.error(`final scoreboard post failed (${res.status}): ${await res.text()}`);
          return;
        }
        const message = (await res.json()) as { id: string };
        setScoreboardMessage(endedDay, guildId, channelId, message.id);
      });
    }
  }
}

/** Post finals for any day that ended while we were down, then at every rollover. */
export function scheduleEndOfDayScoreboards(): void {
  if (!BOT_TOKEN) return;
  void postFinalScoreboards();
  // Small buffer past midnight so currentPuzzleNumber() has definitely rolled.
  setTimeout(() => scheduleEndOfDayScoreboards(), msUntilNextPuzzle() + 2000);
}
