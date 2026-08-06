/*
  Renders sample scoreboard cards for both games to PNGs (plus the end-of-day
  variants) so the layouts can be checked without launching the activity in
  Discord.

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

const skillPlayers = [
  fake("80351110224678912", "Shrek Enthusiast", [false, true], 50),
  fake("155149108183695360", "DawnWarrior Dan", [true], 44, true),
  fake("297045071102261248", "bishop_betty", [false, false, true], 30),
  fake("80351110224678913", "Hoyoung haver", [false, false, false, false, true], 22, true),
  fake("80351110224678914", "xXLuminousXx", [false, false, false, false, false], 10),
];

// A busy day that spills into the two-column layout.
const bigDay = [
  ...skillPlayers,
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

// The BGM Guesser allows 3 guesses and has no hard mode.
const bgmPlayers = [
  fake("80351110224678912", "Shrek Enthusiast", [false, true], 47),
  fake("155149108183695360", "DawnWarrior Dan", [true], 41),
  fake("297045071102261248", "bishop_betty", [false, false, true], 27),
  fake("80351110224678914", "xXLuminousXx", [false, false, false], 9),
];

const outputs = [
  ["scoreboard-preview.png", await renderScoreboard("skill", 42, skillPlayers)],
  ["scoreboard-preview-final.png", await renderScoreboard("skill", 42, skillPlayers, true)],
  ["scoreboard-preview-big.png", await renderScoreboard("skill", 42, bigDay, true)],
  ["scoreboard-preview-bgm.png", await renderScoreboard("bgm", 7, bgmPlayers)],
  ["scoreboard-preview-bgm-final.png", await renderScoreboard("bgm", 7, bgmPlayers, true)],
];

for (const [file, png] of outputs) {
  fs.writeFileSync(file, png);
  console.log(`Wrote ${file} (${png.length} bytes)`);
}
