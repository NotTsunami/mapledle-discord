/*
  Express server for the MapleDoro Discord Activity (Mapledle + BGM Guesser).

  Jobs:
  1. POST /api/token — exchange the OAuth2 authorization code from
     sdk.commands.authorize() for an access token (needs the client secret,
     so it must happen server-side).
  2. POST /interactions — Discord interactions endpoint (Ed25519-verified).
     The app's Entry Point command uses handler APP_HANDLER, so launches come
     here, as do the /skill and /bgm commands and the cards' Play buttons: we
     respond LAUNCH_ACTIVITY and post/refresh that game's scoreboard card in
     the channel (see scoreboard.ts). /help answers with the explainer instead.
  3. POST /webhook-events — Discord webhook events (same signature scheme, its
     own Developer Portal setting). Used for APPLICATION_AUTHORIZED, which is
     how the app learns it was added to a server so it can introduce itself.
  4. POST /api/launch-mode — the client claims the game the launch asked for
     (see the pending-mode note below).
  5. POST /api/result — the client reports a finished puzzle so the player
     shows up on their guild's scoreboard card for that game.
  6. Serve the built client bundle from dist/.

  Runs as untranspiled TypeScript via Node 24 type stripping (node server/index.ts).
*/

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import {
  GAMES,
  GAME_MODES,
  currentPuzzleNumber,
  isGameMode,
  modeForLaunchButton,
  type GameMode,
} from "./games.ts";
import { helpText, launchButtonRow, postWelcome } from "./messages.ts";
import {
  postOrUpdateScoreboard,
  scheduleEndOfDayScoreboards,
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
    "DISCORD_PUBLIC_KEY and/or DISCORD_BOT_TOKEN not set. The /interactions and " +
      "/webhook-events endpoints, the scoreboard cards and the join message are " +
      "disabled (see .env.example).",
  );
}

loadStore();
// At each UTC rollover, post the ended day's final scoreboards as new messages.
scheduleEndOfDayScoreboards();

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

const SNOWFLAKE = /^\d{5,25}$/;
const AVATAR_HASH = /^[a-z0-9_]{5,40}$/i;

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
const Callback = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_UPDATE_MESSAGE: 6,
  LAUNCH_ACTIVITY: 12,
} as const;
/** Message flag 1 << 6: only the invoking user sees the reply. */
const EPHEMERAL = 64;

const HELP_COMMAND = "help";

interface Interaction {
  type: number;
  guild_id?: string;
  channel_id?: string;
  channel?: { id?: string };
  member?: { user?: { id?: string } };
  user?: { id?: string };
  data?: { type?: number; name?: string; custom_id?: string };
}

/* ------------------------------------------------------------------ */
/*  Pending launch mode                                                */
/* ------------------------------------------------------------------ */

/*
  A LAUNCH_ACTIVITY response carries no payload, so /skill and /bgm can't tell
  the iframe which game to open. Instead we note the mode against the user who
  triggered the launch and let the client claim it (POST /api/launch-mode) right
  after the SDK handshake. Purely a UI hint with a short life — in memory only,
  and losing it on restart just means the player lands on their last game.
*/
const PENDING_MODE_TTL_MS = 5 * 60_000;
const pendingModes = new Map<string, { mode: GameMode; at: number }>();

function interactionUserId(interaction: Interaction): string | undefined {
  return interaction.member?.user?.id ?? interaction.user?.id;
}

function setPendingMode(interaction: Interaction, mode: GameMode): void {
  const userId = interactionUserId(interaction);
  if (!userId) return;
  const now = Date.now();
  for (const [key, entry] of pendingModes) {
    if (now - entry.at > PENDING_MODE_TTL_MS) pendingModes.delete(key);
  }
  pendingModes.set(userId, { mode, at: now });
}

function handleLaunchMode(req: Request, res: Response): void {
  const userId = (req.body as { userId?: unknown }).userId;
  if (typeof userId !== "string" || !SNOWFLAKE.test(userId)) {
    res.status(400).json({ error: "invalid user id" });
    return;
  }
  const entry = pendingModes.get(userId);
  pendingModes.delete(userId);
  const fresh = entry && Date.now() - entry.at <= PENDING_MODE_TTL_MS;
  res.json({ mode: fresh ? entry.mode : null });
}

/**
  Answer a launch: launch the activity, then drop/refresh that game's card.

  `pinMode` is false for launches that didn't name a game (the App Launcher's
  Entry Point command): those still get a card, but leaving the mode unpinned
  lets the client open whichever game the player was in last.
*/
function launchGame(interaction: Interaction, mode: GameMode, res: Response, pinMode = true): void {
  if (pinMode) setPendingMode(interaction, mode);
  res.json({ type: Callback.LAUNCH_ACTIVITY });
  const channelId = interaction.channel?.id ?? interaction.channel_id;
  if (interaction.guild_id && channelId) {
    void postOrUpdateScoreboard(mode, currentPuzzleNumber(mode), interaction.guild_id, channelId);
  }
}

/** The game a slash command opens, or null if the command doesn't name one. */
function modeForCommand(name: string | undefined): GameMode | null {
  return GAME_MODES.find((mode) => GAMES[mode].command === `/${name}`) ?? null;
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

  switch (interaction.type) {
    case InteractionType.PING:
      res.json({ type: Callback.PONG });
      return;
    case InteractionType.APPLICATION_COMMAND: {
      const name = interaction.data?.name;
      if (name === HELP_COMMAND) {
        // Ephemeral: whoever asked gets the explainer without it landing in
        // the channel. The Play buttons still work from an ephemeral message.
        res.json({
          type: Callback.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: helpText(), components: [launchButtonRow()], flags: EPHEMERAL },
        });
        return;
      }
      // /skill and /bgm name their game; the Entry Point command doesn't, and
      // falls back to Mapledle's card without pinning the player to it.
      const named = modeForCommand(name);
      launchGame(interaction, named ?? "skill", res, named !== null);
      return;
    }
    case InteractionType.MESSAGE_COMPONENT: {
      // Each game's card has its own Play button, so the press names the game.
      const mode = modeForLaunchButton(interaction.data?.custom_id ?? "");
      if (mode) launchGame(interaction, mode, res);
      else res.json({ type: Callback.DEFERRED_UPDATE_MESSAGE });
      return;
    }
    default:
      res.status(400).json({ error: "unsupported interaction type" });
  }
}

/* ------------------------------------------------------------------ */
/*  Webhook events (app added to a server)                             */
/* ------------------------------------------------------------------ */

/*
  Discord's HTTP webhook events, configured separately from the interactions
  endpoint (Developer Portal -> Webhooks) but signed the same way. This is how
  an interactions-only app hears about installs at all: without a gateway
  connection there is no GUILD_CREATE to listen for.

  Discord wants a 204 with an empty body within 3 seconds and retries otherwise,
  so acknowledge first and do the posting afterwards.
*/
const WebhookType = { PING: 0, EVENT: 1 } as const;

interface WebhookEvent {
  type: number;
  event?: {
    type?: string;
    data?: {
      integration_type?: number;
      guild?: { id?: string; system_channel_id?: string | null };
    };
  };
}

function handleWebhookEvent(req: Request, res: Response): void {
  if (!PUBLIC_KEY) {
    res.status(501).json({ error: "webhook events not configured" });
    return;
  }
  const signature = req.get("X-Signature-Ed25519");
  const timestamp = req.get("X-Signature-Timestamp");
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!signature || !timestamp || !rawBody || !verifySignature(signature, timestamp, rawBody)) {
    res.status(401).json({ error: "invalid request signature" });
    return;
  }

  const body = req.body as WebhookEvent;
  // PING and every event type alike: acknowledge, then act.
  res.status(204).end();
  if (body.type !== WebhookType.EVENT) return;
  if (body.event?.type !== "APPLICATION_AUTHORIZED") return;

  // integration_type 1 is a user install — no server to introduce ourselves in.
  const data = body.event.data;
  const guild = data?.guild;
  if (data?.integration_type !== 0 || !guild?.id) return;
  void postWelcome(guild.id, guild.system_channel_id).catch((err: unknown) =>
    console.error("welcome error:", err),
  );
}

/* ------------------------------------------------------------------ */
/*  Result reporting (feeds the scoreboard card)                       */
/* ------------------------------------------------------------------ */

function handleResult(req: Request, res: Response): void {
  const b = req.body as {
    mode?: unknown;
    puzzleNumber?: unknown;
    won?: unknown;
    hardMode?: unknown;
    marks?: unknown;
    guildId?: unknown;
    channelId?: unknown;
    user?: { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown };
  };

  const mode = b.mode;
  if (!isGameMode(mode)) {
    res.status(400).json({ error: "invalid game mode" });
    return;
  }
  const game = GAMES[mode];

  const day = b.puzzleNumber;
  const marks = b.marks;
  const user = b.user;
  const valid =
    typeof day === "number" &&
    Number.isInteger(day) &&
    typeof b.won === "boolean" &&
    typeof b.hardMode === "boolean" &&
    // Only Mapledle has a hard mode; a hard BGM result is a malformed payload.
    (game.hasHardMode || b.hardMode === false) &&
    Array.isArray(marks) &&
    marks.length >= 1 &&
    marks.length <= game.maxGuesses &&
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

  const today = currentPuzzleNumber(mode);
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
    mode,
    day,
    b.guildId as string,
    user.id as string,
    {
      name: name.slice(0, 40),
      avatar: (user.avatar as string | null) ?? null,
      won: b.won as boolean,
      hardMode: b.hardMode as boolean,
      marks: marks as boolean[],
      at: Date.now(),
    },
    today,
  );
  res.json({ ok: true });

  // Include the reporting channel: if it has no card for this day yet (the
  // player launched from an older day's post), a new card is posted there
  // rather than editing the old day's message.
  if (scoreboardEnabled()) {
    void updateGuildScoreboards(mode, day, b.guildId as string, b.channelId as string);
  }
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
app.post("/api/launch-mode", handleLaunchMode);
app.post("/.proxy/api/launch-mode", handleLaunchMode);

// Discord calls these directly (not through the activity proxy). They take
// separate URLs in the Developer Portal and expect different responses to their
// verification PINGs, so they stay separate routes.
app.post("/interactions", handleInteraction);
app.post("/webhook-events", handleWebhookEvent);

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
