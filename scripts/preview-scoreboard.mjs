/*
  Renders a sample scoreboard card to scoreboard-preview.png (and the
  end-of-day variant to scoreboard-preview-final.png) so the layout can be
  checked without launching the activity in Discord.

  Usage: node scripts/preview-scoreboard.mjs
*/

import fs from "node:fs";
import { renderScoreboard } from "../server/scoreboard.ts";

const fake = (userId, name, marks, minutesAgo, hardMode = false) => ({
  userId,
  name,
  avatar: null, // falls back to Discord's default avatars / initial circles
  won: marks[marks.length - 1] === true,
  hardMode,
  marks,
  at: Date.now() - minutesAgo * 60_000,
});

const players = [
  fake("80351110224678912", "Shrek Enthusiast", [false, true], 50),
  fake("155149108183695360", "DawnWarrior Dan", [true], 44, true),
  fake("297045071102261248", "bishop_betty", [false, false, true], 30),
  fake("80351110224678913", "Hoyoung haver", [false, false, false, false, true], 22, true),
  fake("80351110224678914", "xXLuminousXx", [false, false, false, false, false], 10),
];

const png = await renderScoreboard(42, players);
fs.writeFileSync("scoreboard-preview.png", png);
console.log(`Wrote scoreboard-preview.png (${png.length} bytes)`);

const finalPng = await renderScoreboard(42, players, true);
fs.writeFileSync("scoreboard-preview-final.png", finalPng);
console.log(`Wrote scoreboard-preview-final.png (${finalPng.length} bytes)`);
