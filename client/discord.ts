/*
  Discord Embedded App SDK setup.

  Inside Discord the activity is served from <client_id>.discordsays.com with a
  `frame_id` query param; that's the embed signal. Outside Discord (local dev,
  direct browser visit to mapledoro.app) the SDK handshake would hang, so we
  skip it and run the game unauthenticated.
*/

import { DiscordSDK } from "@discord/embedded-app-sdk";

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

/**
 * Reports a finished puzzle so the player appears on the guild's scoreboard
 * card (the message the server posts/edits in the launch channel). Fire and
 * forget; no-op outside a guild voice/text context.
 */
export function reportGameResult(
  puzzleNumber: number,
  won: boolean,
  hardMode: boolean,
  marks: boolean[],
): void {
  if (!activeSdk || !authUser) return;
  const { guildId, channelId } = activeSdk;
  if (!guildId || !channelId) return;
  fetch("/.proxy/api/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
  puzzleNumber: number;
  /** Wordle-style row of the guesses made so far, e.g. "🟥🟩". */
  squares: string;
  guessCount: number;
  maxGuesses: number;
  done: boolean;
  won: boolean;
}

/**
 * Rich presence: instead of the bare "playing Skill Guesser" card, show the
 * Wordle-style board, which guess the player is on, and session time elapsed.
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
        details: board ? `Mapledle #${a.puzzleNumber} ${board}` : `Mapledle #${a.puzzleNumber}`,
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
