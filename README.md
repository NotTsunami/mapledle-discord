# Mapledle — Discord Activity

[Mapledle](https://www.mapledoro.com/games/skill-guesser), MapleDoro's daily
skill-guessing game, as an [embedded Discord Activity](https://docs.discord.com/developers/activities/overview):
guess which MapleStory class learns the shown skill icon in 5 tries. A new
puzzle arrives every day at 00:00 UTC, in lockstep with the web version.

```
Discord client ──iframe──▶ <app id>.discordsays.com (activity proxy)
                              │  /            ──▶ your domain     ──▶ this server (client bundle + /api/token)
                              │  /.proxy/haku ──▶ your icon host  ──▶ skill icon images
```

## How it works

- **`client/`** — Vite + React 19 + TypeScript. The game components are a port
  of the MapleDoro website's skill-guesser feature (next/image, next/link, and
  the SSR mount gate removed; everything else kept as close to verbatim as
  possible). Fonts are self-hosted via `@fontsource` because Discord's CSP
  blocks Google Fonts inside the activity iframe.
- **`server/`** — Express 5. Serves the built bundle and exposes
  `POST /api/token` (also at `/.proxy/api/token`), which exchanges the OAuth2
  authorization code from `sdk.commands.authorize()` for an access token using
  the client secret. Runs as untranspiled TypeScript on **Node 24+** (native
  type stripping) — no build step for the server.
- **Embed detection** — inside Discord the iframe URL carries a `frame_id`
  query param; without it (local dev, direct visit) the SDK handshake is
  skipped and the game runs anonymously.
- **Images** — skill icons are loaded from a separate static image host you
  provide (see DEPLOYMENT.md §6 for options, including
  [maplestory.io](https://maplestory.io)). Inside Discord they are fetched
  through the `/haku` URL mapping (`/.proxy/haku/...`) because the iframe's
  CSP blocks external hosts; outside Discord the host is hit directly (set
  `VITE_RESOURCE_BASE`, see `client/resource.ts`).
- **Results** — stored in `localStorage` under `mapledoro_games_v1`, same
  shape as the web version.

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

## Keeping the puzzle in sync with the website

These files are copied **verbatim** from the MapleDoro website's
skill-guesser feature and must stay in sync — the daily puzzle number and
answer are derived from them, and a drift would give Discord players a
different puzzle than the website:

- `client/skill-guesser/classes.ts`
- `client/skill-guesser/puzzles.ts` (the `EPOCH_UTC_MS` / `XOR_KEY` pair)
- `client/skill-guesser/puzzle-data.generated.ts` (auto-generated — never edit
  by hand)
- `client/skill-guesser/storage.ts`

After re-copying, rebuild and redeploy (DEPLOYMENT.md §8).
