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

// A busy day that spills into the two-column layout.
const bigDay = [
  ...players,
  fake("80351110224678915", "Kanna Kai", [false, false, true], 48),
  fake("80351110224678916", "Phantom Phil", [false, true], 46, true),
  fake("80351110224678917", "Aran Andy", [true], 40),
  fake("80351110224678918", "Evan the Dragon", [false, false, false, true], 38),
  fake("80351110224678919", "Mercedes Mia", [false, false, true], 33, true),
  fake("80351110224678920", "Shade Sam", [false, false, false, false, true], 28),
  fake("80351110224678921", "blaster_bob", [false, false, false, false, false], 24),
  fake("80351110224678922", "Night Lord Nia", [false, true], 18),
  fake("80351110224678923", "Battle Mage Bea", [false, false, true], 12, true),
  fake("80351110224678924", "Wild Hunter Wes", [false, false, false, true], 6),
];

const png = await renderScoreboard(42, players);
fs.writeFileSync("scoreboard-preview.png", png);
console.log(`Wrote scoreboard-preview.png (${png.length} bytes)`);

const finalPng = await renderScoreboard(42, players, true);
fs.writeFileSync("scoreboard-preview-final.png", finalPng);
console.log(`Wrote scoreboard-preview-final.png (${finalPng.length} bytes)`);

const bigPng = await renderScoreboard(42, bigDay, true);
fs.writeFileSync("scoreboard-preview-big.png", bigPng);
console.log(`Wrote scoreboard-preview-big.png (${bigPng.length} bytes)`);
