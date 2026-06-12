/*
  Express server for the MapleDoro Skill Guesser Discord Activity.

  Jobs:
  1. POST /api/token — exchange the OAuth2 authorization code from
     sdk.commands.authorize() for an access token (needs the client secret,
     so it must happen server-side).
  2. POST /interactions — Discord interactions endpoint (Ed25519-verified).
     The app's Entry Point command uses handler APP_HANDLER, so launches come
     here: we respond LAUNCH_ACTIVITY and post/refresh the day's scoreboard
     card in the channel (see scoreboard.ts). The card's Play button lands
     here too.
  3. POST /api/result — the client reports a finished puzzle so the player
     shows up on their guild's scoreboard card.
  4. Serve the built client bundle from dist/.

  Runs as untranspiled TypeScript via Node 24 type stripping (node server/index.ts).
*/

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import {
  LAUNCH_BUTTON_ID,
  MAX_GUESSES,
  currentPuzzleNumber,
  postOrUpdateScoreboard,
  scoreboardEnabled,
  updateGuildScoreboards,
} from "./scoreboard.ts";
import { loadStore, recordResult } from "./store.ts";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing VITE_DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET (see .env.example).");
  process.exit(1);
}
if (!PUBLIC_KEY || !scoreboardEnabled()) {
  console.warn(
    "DISCORD_PUBLIC_KEY and/or DISCORD_BOT_TOKEN not set — the /interactions endpoint and " +
      "scoreboard cards are disabled (see .env.example).",
  );
}

loadStore();

type RawBodyRequest = Request & { rawBody?: Buffer };

const app = express();
// Keep the raw body around: Discord's signature covers the exact bytes.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = buf;
    },
  }),
);

/* ------------------------------------------------------------------ */
/*  OAuth token exchange                                               */
/* ------------------------------------------------------------------ */

async function exchangeToken(req: Request, res: Response): Promise<void> {
  const code = req.body?.code;
  if (typeof code !== "string" || code.length === 0) {
    res.status(400).json({ error: "missing code" });
    return;
  }

  const discordRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!discordRes.ok) {
    const detail = await discordRes.text();
    console.error(`Token exchange failed (${discordRes.status}): ${detail}`);
    res.status(502).json({ error: "token exchange failed" });
    return;
  }

  const { access_token } = (await discordRes.json()) as { access_token: string };
  // Only the access token leaves the server; the refresh token stays out of
  // the client entirely.
  res.json({ access_token });
}

/* ------------------------------------------------------------------ */
/*  Interactions endpoint                                              */
/* ------------------------------------------------------------------ */

// node:crypto wants an SPKI key; this DER prefix wraps a raw Ed25519 key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifySignature(signatureHex: string, timestamp: string, rawBody: Buffer): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(PUBLIC_KEY!, "hex")]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      null,
      Buffer.concat([Buffer.from(timestamp), rawBody]),
      key,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}

// https://discord.com/developers/docs/interactions/receiving-and-responding
const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3 } as const;
const Callback = { PONG: 1, DEFERRED_UPDATE_MESSAGE: 6, LAUNCH_ACTIVITY: 12 } as const;

interface Interaction {
  type: number;
  guild_id?: string;
  channel_id?: string;
  channel?: { id?: string };
  data?: { type?: number; custom_id?: string };
}

function handleInteraction(req: Request, res: Response): void {
  if (!PUBLIC_KEY) {
    res.status(501).json({ error: "interactions not configured" });
    return;
  }
  const signature = req.get("X-Signature-Ed25519");
  const timestamp = req.get("X-Signature-Timestamp");
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!signature || !timestamp || !rawBody || !verifySignature(signature, timestamp, rawBody)) {
    res.status(401).json({ error: "invalid request signature" });
    return;
  }

  const interaction = req.body as Interaction;
  const channelId = interaction.channel?.id ?? interaction.channel_id;

  switch (interaction.type) {
    case InteractionType.PING:
      res.json({ type: Callback.PONG });
      return;
    case InteractionType.APPLICATION_COMMAND:
      // The Entry Point command: launch the activity, then drop/refresh the
      // scoreboard card in the channel it was launched from.
      res.json({ type: Callback.LAUNCH_ACTIVITY });
      if (interaction.guild_id && channelId) {
        void postOrUpdateScoreboard(currentPuzzleNumber(), interaction.guild_id, channelId);
      }
      return;
    case InteractionType.MESSAGE_COMPONENT:
      if (interaction.data?.custom_id === LAUNCH_BUTTON_ID) {
        res.json({ type: Callback.LAUNCH_ACTIVITY });
      } else {
        res.json({ type: Callback.DEFERRED_UPDATE_MESSAGE });
      }
      return;
    default:
      res.status(400).json({ error: "unsupported interaction type" });
  }
}

/* ------------------------------------------------------------------ */
/*  Result reporting (feeds the scoreboard card)                       */
/* ------------------------------------------------------------------ */

const SNOWFLAKE = /^\d{5,25}$/;
const AVATAR_HASH = /^[a-z0-9_]{5,40}$/i;

function handleResult(req: Request, res: Response): void {
  const b = req.body as {
    puzzleNumber?: unknown;
    won?: unknown;
    marks?: unknown;
    guildId?: unknown;
    channelId?: unknown;
    user?: { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown };
  };

  const day = b.puzzleNumber;
  const marks = b.marks;
  const user = b.user;
  const valid =
    typeof day === "number" &&
    Number.isInteger(day) &&
    typeof b.won === "boolean" &&
    Array.isArray(marks) &&
    marks.length >= 1 &&
    marks.length <= MAX_GUESSES &&
    marks.every((m) => typeof m === "boolean") &&
    b.won === marks[marks.length - 1] &&
    typeof b.guildId === "string" &&
    SNOWFLAKE.test(b.guildId) &&
    typeof b.channelId === "string" &&
    SNOWFLAKE.test(b.channelId) &&
    typeof user?.id === "string" &&
    SNOWFLAKE.test(user.id) &&
    typeof user.username === "string" &&
    (user.avatar === null || (typeof user.avatar === "string" && AVATAR_HASH.test(user.avatar)));

  if (!valid) {
    res.status(400).json({ error: "invalid result payload" });
    return;
  }

  const today = currentPuzzleNumber();
  // Accept yesterday's puzzle briefly around the UTC rollover, nothing older.
  if (day > today || day < today - 1) {
    res.status(400).json({ error: "stale puzzle number" });
    return;
  }

  const name =
    typeof user.global_name === "string" && user.global_name.length > 0
      ? user.global_name
      : (user.username as string);

  recordResult(
    day,
    b.guildId as string,
    user.id as string,
    {
      name: name.slice(0, 40),
      avatar: (user.avatar as string | null) ?? null,
      won: b.won as boolean,
      marks: marks as boolean[],
      at: Date.now(),
    },
    today,
  );
  res.json({ ok: true });

  if (scoreboardEnabled()) void updateGuildScoreboards(day, b.guildId as string);
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

// Discord's activity proxy exposes mapped routes under /.proxy/<prefix>; the
// root mapping also serves them bare. Accept both so the client can fetch
// either path.
app.post("/api/token", exchangeToken);
app.post("/.proxy/api/token", exchangeToken);
app.post("/api/result", handleResult);
app.post("/.proxy/api/result", handleResult);

// Discord calls this directly (not through the activity proxy).
app.post("/interactions", handleInteraction);

app.get("/healthz", (_req, res) => {
  res.send("ok");
});

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
app.use(express.static(distDir));
// SPA fallback: every other GET serves the app shell.
app.use((req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`mapledoro-discord-activity listening on :${PORT}`);
});
