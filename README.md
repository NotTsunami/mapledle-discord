# Mapledle — Discord Activity

MapleDoro's two daily guessing games as an
[embedded Discord Activity](https://docs.discord.com/developers/activities/overview):

- **[Mapledle](https://www.mapledoro.com/games/skill-guesser)** (`/skill`) —
  guess which MapleStory class learns the shown skill icon in 5 tries, with an
  optional hard mode that asks for the skill's own name.
- **[BGM Guesser](https://www.mapledoro.com/games/bgm-guesser)** (`/bgm`) —
  hear a MapleStory track and name the area or boss it plays for in 3 tries.
  One difficulty, no hard mode.

Both get a new puzzle every day at 00:00 UTC, in lockstep with the web
versions. They number their puzzles separately, because they launched on
different days. `/help` explains all of this in-channel, and the app posts the
same explainer when it's added to a server.

```
Discord client ──iframe──▶ <app id>.discordsays.com (activity proxy)
                              │  /            ──▶ your domain     ──▶ this server (client bundle + /api/token)
                              │  /.proxy/haku ──▶ your media host ──▶ skill icons, area marks, BGM tracks
```

## How it works

- **`client/`** — Vite + React 19 + TypeScript. The game components are a port
  of the MapleDoro website's skill-guesser and bgm-guesser features
  (next/image, next/link, and the SSR mount gate removed; everything else kept
  as close to verbatim as possible). Fonts are self-hosted via `@fontsource`
  because Discord's CSP blocks Google Fonts inside the activity iframe.
- **`server/`** — Express 5. Serves the built bundle and exposes
  `POST /api/token` (also at `/.proxy/api/token`), which exchanges the OAuth2
  authorization code from `sdk.commands.authorize()` for an access token using
  the client secret. Runs as untranspiled TypeScript on **Node 24+** (native
  type stripping) — no build step for the server.
- **Slash commands and the join message** — `/interactions` handles `/skill`,
  `/bgm`, `/help` and the cards' Play buttons. `/webhook-events` is a second,
  separately-configured Discord endpoint that receives `APPLICATION_AUTHORIZED`;
  an interactions-only app has no gateway connection and so never sees
  `GUILD_CREATE`, making this the only way it learns it was added to a server.
  Both endpoints verify the same Ed25519 signature but answer their PINGs
  differently, hence two routes. `server/messages.ts` builds the explainer once
  for both `/help` and the join message.
- **Embed detection** — inside Discord the iframe URL carries a `frame_id`
  query param; without it (local dev, direct visit) the SDK handshake is
  skipped and the game runs anonymously.
- **Media** — skill icons, world-map area marks and BGM tracks are loaded from
  a separate host you provide (see DEPLOYMENT.md §6). Inside Discord they are
  fetched through the `/haku` URL mapping (`/.proxy/haku/...`) because the
  iframe's CSP blocks external hosts; outside Discord the host is hit directly
  (set `VITE_RESOURCE_BASE`, see `client/resource.ts`).
- **Results** — stored in `localStorage` under `mapledoro_games_v1`, same
  shape as the web version, one section per game.

### Picking a game

A `LAUNCH_ACTIVITY` interaction response carries no payload, so `/skill` and
`/bgm` can't hand the choice to the iframe directly. Three signals decide which
game opens, in order:

1. `custom_id` on an [activity
   link](https://docs.discord.com/developers/activities/development-guides/growth-and-referrals)
   (`https://discord.com/activities/<app id>?custom_id=bgm`).
2. The server's pending-mode note: when it answers `/skill`, `/bgm`, or a
   scoreboard card's Play button, it records the game against the user for five
   minutes, and the client claims it via `POST /api/launch-mode` right after
   the SDK handshake.
3. Otherwise the last game that player was in.

The App Launcher's Entry Point command sets none of these, so it lands on (3).
Either way the header has a **Skill / BGM** switcher.

## Development

Requires **Node.js v24+**.

```sh
npm install
cp .env.example .env     # fill in VITE_DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET

npm run dev:server       # Express on :3000 (token exchange)
npm run dev              # Vite on :5173, proxies /api -> :3000
```

Open <http://localhost:5173> to play outside Discord. To test inside Discord,
tunnel the Vite port and point your dev app's root URL mapping at it:

```sh
cloudflared tunnel --url http://localhost:5173
```

See [DEPLOYMENT.md](DEPLOYMENT.md) §9 for the full dev loop (use a separate
Discord app for development so the production URL mapping stays untouched).

`npm run build` typechecks and bundles the client into `dist/`;
`npm start` serves it.

## Keeping the puzzles in sync with the website

These files are copied **verbatim** from the MapleDoro website's game features
and must stay in sync — each game's daily puzzle number and answer are derived
from them, and a drift would give Discord players a different puzzle than the
website:

- `client/skill-guesser/classes.ts`
- `client/skill-guesser/puzzles.ts` (the `EPOCH_UTC_MS` / `XOR_KEY` pair)
- `client/skill-guesser/puzzle-data.generated.ts` (auto-generated — never edit
  by hand)
- `client/bgm-guesser/puzzles.ts` (same epoch/key pairing)
- `client/bgm-guesser/puzzle-data.generated.ts` (auto-generated — never edit
  by hand)

`server/games.ts` repeats each game's epoch and guess count so the scoreboard
cards number and size themselves correctly; update it alongside the puzzle
files. The two `storage.ts` modules are activity-specific (they share
`client/games-store.ts`) and don't need re-copying.

After re-copying, rebuild and redeploy (DEPLOYMENT.md §8).
