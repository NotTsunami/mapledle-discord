# Mapledle Discord Activity — Deployment Guide

Deploy the activity on any Docker host, exposed through your own domain via a
Cloudflare Tunnel so the host's IP is never published. Discord then embeds it
through its activity proxy. This guide uses `mapledle.example.com` as the
placeholder — substitute your domain throughout.

```
Discord client ──iframe──▶ <app id>.discordsays.com (Discord activity proxy)
       /             │
       └──────▶ Cloudflare edge ──tunnel──▶ cloudflared ──http──▶ activity (:3000)
                (your domain)                (container)           client bundle + /api/token
       /.proxy/haku
       └──────▶ your icon host ──▶ skill icon images (see §6)
```

- The activity container is **never** published to the LAN or the internet —
  only the internal Docker network reaches it. `cloudflared` makes an
  **outbound-only** connection to Cloudflare: no port-forwarding, no exposed IP.
- One compose project: `activity` + `cloudflared`, with its own tunnel token.
- A tunnel isn't mandatory — any setup that serves the container over HTTPS on
  your domain works (reverse proxy, PaaS, etc.). Sections §4–§5 assume the
  tunnel; the Discord-side configuration is the same regardless.

---

## 1. Prerequisites

- A Docker host with **Docker Compose**.
- A domain added to your **Cloudflare** account (zone active, nameservers on
  Cloudflare) — or any other way to serve the container over HTTPS.
- A Discord account with access to the
  [Developer Portal](https://discord.com/developers/applications).
- A host serving the skill icon images (see §6 — set this up first if you
  don't have one).

---

## 2. Create and configure the Discord application

1. [Developer Portal](https://discord.com/developers/applications) → **New
   Application** → name it (e.g. `Mapledle`).
2. **OAuth2** tab:
   - Copy the **Client ID** → this is `VITE_DISCORD_CLIENT_ID`.
   - **Reset Secret** → copy the **Client Secret** → this is
     `DISCORD_CLIENT_SECRET`. Treat it like a password.
   - Under **Redirects**, add `https://mapledle.example.com` (a registered
     redirect is required for `authorize()` even though the embedded flow
     never navigates to it).
3. **Activities → Settings** (left sidebar): check **Enable Activities**.
   Discord auto-creates a default **Entry Point command** ("Launch") that
   opens the activity from the App Launcher. (It gets switched to
   `APP_HANDLER` mode later for the scoreboard launch card — see §5b.)
4. **Activities → URL Mappings** — this is how Discord's proxy reaches your
   servers (targets are bare domains, no scheme):

   | Prefix  | Target                 | Purpose                                     |
   |---------|------------------------|---------------------------------------------|
   | `/`     | `mapledle.example.com` | The activity itself (client + `/api/token`) |
   | `/haku` | your icon host         | Skill icon images (§6)                      |

   Inside the iframe the client fetches icons from `/.proxy/haku/...`;
   Discord's proxy forwards that to the mapped host. (The `/haku` prefix name
   is hardcoded in `client/resource.ts` — rename it in both places if you
   prefer something else.)

> **Unverified-app limits:** while the app is unverified it can be installed
> anywhere via its install link, but the activity is only *launchable* by your
> team's developers and **App Testers** (Developer Portal → your app → App
> Testers — invite each person and have them accept), and only in servers with
> **fewer than 25 members** or in DMs/group DMs. Lifting those limits (and
> App Discovery listing) requires Discord's verification process.

---

## 3. Get the project onto the host

```bash
cd ~
git clone <this repo>
cd mapledoro-discord-activity
```

---

## 4. Create the Cloudflare Tunnel

A **remotely-managed (token) tunnel**, one per compose stack:

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** →
   **Create a tunnel** → **Cloudflared**.
2. Name it (e.g. `mapledle-activity`) → **Save**.
3. Copy the **tunnel token** (the long string after `--token`). Don't run the
   shown command — Compose runs `cloudflared` for you. Save it for §5.
4. **Public Hostname** tab → **Add a public hostname**:
   - **Subdomain / Domain:** your activity hostname
   - **Type:** `HTTP`
   - **URL:** `activity:3000`  ← the Compose service name and internal port
   - Save.

Cloudflare auto-creates the proxied DNS record — your origin IP is never in
DNS.

---

## 5. Configure environment and start

```bash
cd ~/mapledoro-discord-activity
cp .env.example .env
nano .env
```

Set in `.env`:

```bash
VITE_DISCORD_CLIENT_ID=<Client ID from §2.2>
DISCORD_CLIENT_SECRET=<Client Secret from §2.2>
TUNNEL_TOKEN=<token from §4.3>
VITE_RESOURCE_BASE=<icon host base URL from §6, e.g. https://icons.example.com>
```

Build and launch:

```bash
docker compose up -d --build
docker compose ps                      # activity + cloudflared both "running"
docker compose logs -f cloudflared     # look for "Registered tunnel connection"
```

The client ID and `VITE_RESOURCE_BASE` are baked into the client bundle at
**build** time, so changing either later requires
`docker compose up -d --build` again.

---

## 5b. Scoreboard launch card (optional)

By default Discord posts its stock "started a game / Join" card when the
activity launches. With this set up, the app instead posts a generated
Wordle-style scoreboard image (today's finishers in that server + a **Play**
button) and edits it as more results come in. At the UTC day rollover the
finished board is re-posted as a new "final results" message, and the first
result for the next puzzle starts a fresh card instead of touching the old
one. A `/start` slash command (registered in step 2) launches the activity
the same way as the Entry Point command.

1. Add to `.env` on the host:

   ```bash
   DISCORD_PUBLIC_KEY=<Developer Portal → General Information → Public Key>
   DISCORD_BOT_TOKEN=<Developer Portal → Bot → Token>
   ```

   then `docker compose up -d` (recreate; a plain `restart` does not re-read
   `.env`). The boot log warns if either is missing.

2. Switch the Entry Point command to `APP_HANDLER` and register the `/start`
   slash command (one-time, from any machine with the repo and a `.env`
   containing `DISCORD_BOT_TOKEN`):

   ```bash
   npm run configure-entry-point
   ```

3. Developer Portal → **General Information** → **Interactions Endpoint
   URL**: `https://mapledle.example.com/interactions`. Discord PINGs the
   endpoint when you save, so the new server must already be deployed
   (step 1). Restart your Discord client (Ctrl+R) afterwards — clients cache
   commands.

4. The bot must be a member of the server with **Send Messages** in the
   launch channel. If launching logs `scoreboard post failed (403)`, invite
   it: `https://discord.com/oauth2/authorize?client_id=<client id>&scope=bot`.

Scoreboard data (results + posted message ids) persists in the
`activity-data` volume; days older than yesterday are pruned automatically.
Preview the card layout locally with `node scripts/preview-scoreboard.mjs`.

---

## 6. Skill icon host

The client doesn't bundle the skill icon images — it loads them from a host
you provide. `client/resource.ts` builds URLs as:

```
{base}/api/img/{type}/{id}/icon.png
```

where `{type}` is `skill`, `erda-skill`, or `hexa-skill` and `{id}` is the
skill id from `client/skill-guesser/puzzle-data.generated.ts`. Outside Discord
the base is `VITE_RESOURCE_BASE`; inside Discord it's always the `/haku` URL
mapping (§2.4), which must point at the same host. Two options:

### Option A — host your own icon CDN

Serve the icons as static files under the path layout above from any static
host (Cloudflare Pages/R2, S3 + CloudFront, nginx, a small container behind
its own tunnel — anything). Extract the icons from the game data with the
usual community tooling, or export them from an existing source such as
maplestory.io.

Requirements:

- **CORS** — respond with `Access-Control-Allow-Origin` for your activity
  origin (`https://mapledle.example.com`), since direct visits load icons
  cross-origin.
- **Hotlink protection** — if your host/WAF restricts referers, allow your
  activity domain **and** `discordsays.com` (requests inside Discord carry the
  proxy's referer).
- Put a CDN/edge cache in front if you can; the images are tiny and immutable.

### Option B — use a public API (maplestory.io)

[maplestory.io](https://maplestory.io) serves skill icons directly, e.g.:

```
https://maplestory.io/api/GMS/{version}/skill/{skillId}/icon
```

Its URL shape differs from what `resourceImageUrl()` in `client/resource.ts`
produces, so adapt that function (strip the zero-padding from the ids if
needed, and map all three resource types onto the API's routes). Then set the
`/haku` URL mapping target to `maplestory.io`. Keep in mind it's a free
community service — availability and rate limits aren't guaranteed, so prefer
Option A for anything with real traffic.

---

## 7. Verify

From any machine:

```bash
# Health (through the tunnel)
curl -s https://mapledle.example.com/healthz ; echo          # -> "ok"

# The app shell
curl -s -o /dev/null -w "%{http_code}\n" https://mapledle.example.com/   # -> 200

# Origin IP hidden
dig +short mapledle.example.com   # -> Cloudflare anycast IPs, NOT your origin IP

# CORS on the icon host for the activity origin
curl -sI -H "Origin: https://mapledle.example.com" \
  https://<icon host>/api/img/skill/0001227/icon.png | grep -i access-control-allow-origin
# -> access-control-allow-origin: https://mapledle.example.com
```

In Discord (a server where the app is installed): open a voice channel or the
App Launcher → find the app → **Launch**. The game should load, show
"Playing as *your name*", and render the daily skill icon.

Visiting your domain directly in a browser also works — the game just runs
without the Discord handshake.

---

## 8. Updating

### App code / puzzle data

After pulling new code or puzzle data (see README "Keeping the puzzle in
sync"):

```bash
cd ~/mapledoro-discord-activity
git pull
docker compose up -d --build
```

### Rotating the client secret

Reset it in the Developer Portal → update `.env` →
`docker compose up -d` (no rebuild needed; the secret is runtime-only).

---

## 9. Local development

Use a **separate Discord application** for dev so you never repoint the
production URL mapping.

```sh
npm install
cp .env.example .env        # dev app's client id + secret
npm run dev:server          # Express on :3000
npm run dev                 # Vite on :5173 (proxies /api -> :3000)
```

- **Outside Discord:** open <http://localhost:5173> — the SDK handshake is
  skipped automatically.
- **Inside Discord:** expose Vite with a quick tunnel and map the dev app's
  root to it:

  ```sh
  cloudflared tunnel --url http://localhost:5173
  ```

  Copy the printed `https://<random>.trycloudflare.com` host into the dev
  app's `/` URL mapping (plus the same `/haku` → icon host mapping), then
  launch the activity in Discord. The quick-tunnel hostname changes on every
  run, so expect to re-paste it.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Activity shows Discord's "blocked" page or never loads | Root URL mapping missing/wrong (must be `/` → your activity domain), or Activities not enabled (§2.3). |
| 502 from your domain | `activity` container unhealthy or the public hostname URL isn't `activity:3000`. `docker compose logs activity`. |
| `cloudflared` logs `no ingress rules` | Public hostname not configured on the tunnel (§4.4). |
| Stuck on "Connecting to Discord…" | Token exchange failing — check `docker compose logs activity` for `Token exchange failed`; usually a wrong `DISCORD_CLIENT_SECRET` or missing OAuth2 redirect (§2.2). |
| `authorize()` rejects / consent popup errors | No redirect URI registered on the OAuth2 tab (§2.2), or client ID mismatch between bundle and app (rebuild after changing it). |
| Skill icons broken **inside** Discord only | `/haku` URL mapping missing (§2.4) — direct requests to external hosts are CSP-blocked in the iframe. |
| Skill icons broken everywhere | Icon host down, wrong `VITE_RESOURCE_BASE` (rebuild after changing it), or hotlink/CORS rules blocking the activity domain / `discordsays.com` referers (§6). |
| Icons 404 through `/.proxy/haku` but fine on the icon host | URL mapping target has a scheme or path — it must be the bare domain. |
| Discord-side `blocked:csp` console errors | Some resource is fetched from an external host without a URL mapping; route it through a `/.proxy/<prefix>` mapping. |
| Wrong/different puzzle vs the website | `puzzles.ts` epoch/key or `puzzle-data.generated.ts` drifted from the website — re-sync (README) and redeploy. |
| No scoreboard card on launch, nothing in logs | Interaction never reached the server: Interactions Endpoint URL not set (§5b.3), Entry Point command still `DISCORD_LAUNCH_ACTIVITY` (§5b.2), or a stale client (Ctrl+R). A working launch logs `entry-point launch: …`. |
| `scoreboard post failed (403)` in logs | Bot not in the server or no Send Messages in that channel (§5b.4). |
| Portal rejects the Interactions Endpoint URL | Old server still deployed (no `/interactions` route) or `DISCORD_PUBLIC_KEY` missing/wrong in `.env` — the save-time PING must return signed PONG. |
