/*
  The app's explainer text — what the games are, which command opens which, and
  how the daily cycle and scoreboard cards work.

  One builder feeds both places it appears, so /help and the message posted when
  the app joins a server can't drift apart.
*/

import { GAMES, GAME_MODES } from "./games.ts";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const API_BASE = "https://discord.com/api/v10";

const SITE = "https://www.mapledoro.com";

/** Explainer body. `greeting` opens it when the app has just been added. */
export function helpText(greeting?: string): string {
  return [
    greeting,
    "**MapleDoro Games**: two daily MapleStory puzzles, played right here in Discord.",
    "",
    `**\`${GAMES.skill.command}\` (Mapledle)**`,
    `Guess which class learns the day's skill icon in ${GAMES.skill.maxGuesses} tries. Wrong guesses unlock hints: main stat, then secondary, then weapon. Hard mode asks for the skill's own name instead of the class.`,
    "",
    `**\`${GAMES.bgm.command}\` (BGM Guesser)**`,
    `Hear a MapleStory track and name the area or boss it plays for in ${GAMES.bgm.maxGuesses} tries. One difficulty, no hints.`,
    "",
    "**How it works**",
    "Everyone gets the same puzzle, and both games roll over at 00:00 UTC. They are the same puzzles running on mapledoro.com, so your streak carries across.",
    "Running a command opens the game and posts a scoreboard for this server showing who has finished today, which updates as more people play. Each game keeps its own card. When the day rolls over, the finished board is posted once more as the final result and the next day starts a fresh one.",
    "",
    `\`/help\` brings this back. More MapleStory tools at <${SITE}>. Not affiliated with Nexon.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/** An action row with a Play button per game, reusing the scoreboard cards' ids. */
export function launchButtonRow(): unknown {
  return {
    type: 1, // action row
    components: GAME_MODES.map((mode) => ({
      type: 2,
      style: 1,
      label: GAMES[mode].buttonLabel,
      custom_id: GAMES[mode].launchButtonId,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Welcome message on install                                         */
/* ------------------------------------------------------------------ */

/* Channel types we're willing to post the welcome message in. */
const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;
/* Give up after a few 403s rather than walking every channel in a big server. */
const MAX_CHANNEL_ATTEMPTS = 5;

interface GuildChannel {
  id: string;
  type: number;
  position?: number;
}

/*
  APPLICATION_AUTHORIZED can be delivered more than once for the same install
  (Discord retries until acknowledged). We answer 204 before doing any work, so
  a retry should be rare — this is just belt and braces so a hiccup can't post
  the welcome twice. Short TTL on purpose: a genuine kick-and-re-add later
  should still be greeted.
*/
const WELCOME_DEDUPE_MS = 10 * 60_000;
const welcomed = new Map<string, number>();

function alreadyWelcomed(guildId: string): boolean {
  const now = Date.now();
  for (const [key, at] of welcomed) {
    if (now - at > WELCOME_DEDUPE_MS) welcomed.delete(key);
  }
  if (welcomed.has(guildId)) return true;
  welcomed.set(guildId, now);
  return false;
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/*
  Where to greet. Discord exposes no "channel the bot may speak in" lookup, and
  working it out would mean resolving the bot's roles against every channel's
  overwrites — so we try the server's system channel first (the one it already
  uses for join notices), then the earliest text channels, and let a 403 move us
  on. Bounded so a server that denies us everywhere costs a handful of calls.
*/
async function welcomeCandidates(guildId: string, systemChannelId?: string | null): Promise<string[]> {
  const candidates: string[] = systemChannelId ? [systemChannelId] : [];
  const res = await api("GET", `/guilds/${guildId}/channels`);
  if (res.ok) {
    const channels = (await res.json()) as GuildChannel[];
    channels
      .filter((c) => c.type === GUILD_TEXT || c.type === GUILD_ANNOUNCEMENT)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .forEach((c) => candidates.push(c.id));
  } else {
    console.error(`welcome: channel list failed (${res.status}): ${await res.text()}`);
  }
  return [...new Set(candidates)].slice(0, MAX_CHANNEL_ATTEMPTS);
}

/** Post the explainer in a server that just added the app. Best effort. */
export async function postWelcome(guildId: string, systemChannelId?: string | null): Promise<void> {
  if (!BOT_TOKEN || alreadyWelcomed(guildId)) return;

  const payload = {
    content: helpText("Thanks for adding me!"),
    components: [launchButtonRow()],
  };

  for (const channelId of await welcomeCandidates(guildId, systemChannelId)) {
    const res = await api("POST", `/channels/${channelId}/messages`, payload);
    if (res.ok) return;
    // 403 is the normal "can't speak here" answer; anything else is worth seeing.
    if (res.status !== 403) {
      console.error(`welcome post failed (${res.status}): ${await res.text()}`);
    }
  }
  console.warn(`welcome: no channel in guild ${guildId} accepted the message`);
}
