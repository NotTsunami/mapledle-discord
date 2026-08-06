/*
  Discord Embedded App SDK setup.

  Inside Discord the activity is served from <client_id>.discordsays.com with a
  `frame_id` query param; that's the embed signal. Outside Discord (local dev,
  direct browser visit to mapledoro.app) the SDK handshake would hang, so we
  skip it and run the game unauthenticated.
*/

import { DiscordSDK } from "@discord/embedded-app-sdk";
import { isGameMode, type GameMode } from "./games";

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

export const isEmbedded = new URLSearchParams(window.location.search).has("frame_id");

/* Rich presence shows time elapsed from this; captured at module load so it
   covers the whole activity session. */
const SESSION_START_MS = Date.now();

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

// Set once the handshake + authentication completes; presence updates and
// external links silently no-op before that (and outside Discord entirely).
let activeSdk: DiscordSDK | null = null;
let authUser: DiscordUser | null = null;

/**
 * ready -> authorize -> server-side token exchange -> authenticate.
 * Returns the authenticated user, or null when running outside Discord.
 */
export async function setupDiscord(): Promise<DiscordUser | null> {
  if (!isEmbedded) return null;

  const sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: "code",
    state: "",
    prompt: "none",
    // rpc.activities.write is required for setActivity (rich presence).
    scope: ["identify", "rpc.activities.write"],
  });

  // Same-origin request through the activity proxy; the server holds the
  // client secret and returns only the access token.
  const res = await fetch("/.proxy/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const { access_token } = (await res.json()) as { access_token: string };

  const auth = await sdk.commands.authenticate({ access_token });
  activeSdk = sdk;
  authUser = auth.user;
  return auth.user;
}

/*
  Which game the launch asked for.

  LAUNCH_ACTIVITY interaction responses carry no payload, so `/skill` and
  `/bgm` can't hand the mode to the iframe directly. Two signals fill the gap:

  1. `custom_id` — set by Discord on activity links
     (https://discord.com/activities/<app id>?custom_id=bgm) and readable before
     the handshake completes.
  2. The server's short-lived pending-mode note, written when it answers the
     slash command or scoreboard button and claimed here by user id.

  Neither is guaranteed (the App Launcher's Entry Point command sets neither), so
  callers fall back to the last game the player was in.
*/
export function launchModeFromCustomId(): GameMode | null {
  const raw = new URLSearchParams(window.location.search).get("custom_id");
  return isGameMode(raw) ? raw : null;
}

/** Claims the pending mode the server recorded for this user, if any. */
export async function fetchLaunchMode(): Promise<GameMode | null> {
  if (!authUser) return null;
  try {
    const res = await fetch("/.proxy/api/launch-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: authUser.id }),
    });
    if (!res.ok) return null;
    const { mode } = (await res.json()) as { mode?: unknown };
    return isGameMode(mode) ? mode : null;
  } catch {
    return null;
  }
}

/**
 * Reports a finished puzzle so the player appears on that game's scoreboard
 * card (the message the server posts/edits in the launch channel). Fire and
 * forget; no-op outside a guild voice/text context.
 */
export function reportGameResult(
  mode: GameMode,
  puzzleNumber: number,
  won: boolean,
  marks: boolean[],
  hardMode = false,
): void {
  if (!activeSdk || !authUser) return;
  const { guildId, channelId } = activeSdk;
  if (!guildId || !channelId) return;
  fetch("/.proxy/api/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      puzzleNumber,
      won,
      hardMode,
      marks,
      guildId,
      channelId,
      user: {
        id: authUser.id,
        username: authUser.username,
        global_name: authUser.global_name ?? null,
        avatar: authUser.avatar ?? null,
      },
    }),
  }).catch((err: unknown) => console.error("result report failed:", err));
}

export interface GameActivity {
  /** Display name of the game being played, e.g. "Mapledle". */
  game: string;
  puzzleNumber: number;
  /** Wordle-style row of the guesses made so far, e.g. "🟥🟩". */
  squares: string;
  guessCount: number;
  maxGuesses: number;
  done: boolean;
  won: boolean;
}

/**
 * Rich presence: instead of the bare "playing Mapledle" card, show which game,
 * the Wordle-style board, which guess the player is on, and session time.
 */
export function updateGameActivity(a: GameActivity): void {
  if (!activeSdk) return;
  const board = a.done ? a.squares : a.squares + "⬜".repeat(a.maxGuesses - a.guessCount);
  const state = a.done
    ? a.won
      ? `Solved in ${a.guessCount}/${a.maxGuesses}`
      : `Out of guesses (X/${a.maxGuesses})`
    : `On guess ${a.guessCount + 1} of ${a.maxGuesses}`;
  activeSdk.commands
    .setActivity({
      activity: {
        type: 0, // Playing
        details: board
          ? `${a.game} #${a.puzzleNumber} ${board}`
          : `${a.game} #${a.puzzleNumber}`,
        state,
        timestamps: { start: SESSION_START_MS },
      },
    })
    .catch((err: unknown) => console.error("setActivity failed:", err));
}

/** Discord's activity iframe blocks plain anchors; route through the SDK. */
export function openExternal(url: string): void {
  if (activeSdk) {
    activeSdk.commands
      .openExternalLink({ url })
      .catch((err: unknown) => console.error("openExternalLink failed:", err));
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
