/*
  One-time setup:
  1. Switch the app's Entry Point command from DISCORD_LAUNCH_ACTIVITY
     (Discord posts its stock "Join" card) to APP_HANDLER (Discord sends the
     launch interaction to our /interactions endpoint, which launches the
     activity AND posts the custom scoreboard card).
  2. Register the /start slash command (Wordle-style), which launches the
     activity the same way.

  Usage: npm run configure-entry-point   (needs DISCORD_BOT_TOKEN in .env)

  Remember to also set the Interactions Endpoint URL in the Developer Portal
  (General Information) to https://<your-activity-host>/interactions — Discord
  verifies it with a PING when you save, so deploy the new server first.
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

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
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

const startCommand = commands.find((c) => c.type === CHAT_INPUT && c.name === "start");
if (startCommand) {
  console.log(`/start command already registered — nothing to do.`);
} else {
  await api("POST", `/applications/${appInfo.id}/commands`, {
    name: "start",
    description: "Play today's Mapledle",
    type: CHAT_INPUT,
    integration_types: [0, 1], // guild + user install
    contexts: [0, 1, 2], // guild, bot DM, private channel
  });
  console.log(`Registered the /start command.`);
}

console.log(
  "\nNext: in the Developer Portal -> General Information, set\n" +
    "  Interactions Endpoint URL = https://<your-activity-host>/interactions\n" +
    "(the new server must be deployed first — Discord PINGs it on save).",
);
