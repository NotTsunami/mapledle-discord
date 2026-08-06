/*
  One-time setup:
  1. Switch the app's Entry Point command from DISCORD_LAUNCH_ACTIVITY
     (Discord posts its stock "Join" card) to APP_HANDLER (Discord sends the
     launch interaction to our /interactions endpoint, which launches the
     activity AND posts the custom scoreboard card).
  2. Register the /skill, /bgm and /help slash commands, and remove the old
     single /start command the first two replace.

  Safe to re-run: it only creates what's missing.

  Usage: npm run configure-entry-point   (needs DISCORD_BOT_TOKEN in .env)

  Remember to also set, in the Developer Portal, the Interactions Endpoint URL
  (General Information) to https://<your-activity-host>/interactions and the
  Event Webhooks URL (Webhooks) to https://<your-activity-host>/webhook-events
  with the Application Authorized event enabled. Discord verifies both with a
  PING when you save, so deploy the new server first.
*/

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("Set DISCORD_BOT_TOKEN in .env (Developer Portal -> Bot -> Token).");
  process.exit(1);
}

const API = "https://discord.com/api/v10";
const HEADERS = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

// Entry Point commands are type 4; handler 1 = APP_HANDLER, 2 = DISCORD_LAUNCH_ACTIVITY.
const CHAT_INPUT = 1;
const PRIMARY_ENTRY_POINT = 4;
const APP_HANDLER = 1;

// `skill` and `bgm` are the names the server maps to games (see server/games.ts);
// `help` is answered with the explainer from server/messages.ts.
const COMMANDS = [
  { name: "skill", description: "Play today's Mapledle skill puzzle" },
  { name: "bgm", description: "Play today's BGM Guesser puzzle" },
  { name: "help", description: "How the MapleDoro games work" },
];

// Replaced by the two per-game commands above.
const RETIRED_COMMANDS = ["start"];

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

const appInfo = await api("GET", "/applications/@me");
console.log(`App: ${appInfo.name} (${appInfo.id})`);

const commands = await api("GET", `/applications/${appInfo.id}/commands`);
const entryPoint = commands.find((c) => c.type === PRIMARY_ENTRY_POINT);

if (entryPoint) {
  if (entryPoint.handler === APP_HANDLER) {
    console.log(`Entry Point command "${entryPoint.name}" already uses APP_HANDLER — nothing to do.`);
  } else {
    await api("PATCH", `/applications/${appInfo.id}/commands/${entryPoint.id}`, { handler: APP_HANDLER });
    console.log(`Entry Point command "${entryPoint.name}" switched to APP_HANDLER.`);
  }
} else {
  const created = await api("POST", `/applications/${appInfo.id}/commands`, {
    name: "launch",
    description: "Launch Mapledle",
    type: PRIMARY_ENTRY_POINT,
    handler: APP_HANDLER,
    integration_types: [0, 1], // guild + user install
    contexts: [0, 1, 2], // guild, bot DM, private channel
  });
  console.log(`Created Entry Point command "${created.name}" with APP_HANDLER.`);
}

for (const command of COMMANDS) {
  if (commands.some((c) => c.type === CHAT_INPUT && c.name === command.name)) {
    console.log(`/${command.name} command already registered — nothing to do.`);
    continue;
  }
  await api("POST", `/applications/${appInfo.id}/commands`, {
    ...command,
    type: CHAT_INPUT,
    integration_types: [0, 1], // guild + user install
    contexts: [0, 1, 2], // guild, bot DM, private channel
  });
  console.log(`Registered the /${command.name} command.`);
}

for (const name of RETIRED_COMMANDS) {
  const stale = commands.find((c) => c.type === CHAT_INPUT && c.name === name);
  if (!stale) continue;
  await api("DELETE", `/applications/${appInfo.id}/commands/${stale.id}`);
  console.log(`Removed the retired /${name} command.`);
}

console.log(
  "\nNext, in the Developer Portal (the new server must be deployed first —\n" +
    "Discord PINGs both when you save):\n" +
    "  General Information -> Interactions Endpoint URL\n" +
    "      = https://<your-activity-host>/interactions\n" +
    "  Webhooks -> Event Webhooks URL\n" +
    "      = https://<your-activity-host>/webhook-events\n" +
    "      and subscribe to the Application Authorized event, so the app can\n" +
    "      introduce itself when someone adds it to a server.",
);
