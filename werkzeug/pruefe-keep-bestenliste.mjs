// Keep: die Bestenliste nach dem Umbau vom 18.08.2026 - zwei Ansichten
// (diese Woche / ewig) und **eine Zeile je Person**, wie bei Card Chaos.
//
//   L01  Gleiche Namen werden zusammengefasst, die beste Partie zaehlt.
//   L02  Die Wochenliste ist ein Filter: Alteintraege fallen nur aus der
//        Ansicht, nicht aus der Datei.
//   L03  Die Woche beginnt Montag 00:00 Berliner Zeit - auch ueber die
//        Zeitumstellung hinweg.
//   L04  Unfug (Infinity, negativ, Text) kommt nicht in die Liste.
//   L05  Gleichstand teilt sich den Platz.
//   L06  Im Browser: die Liste steht da, der Umschalter schaltet um, der
//        Wochenfilter greift sichtbar, und die Konsole bleibt still.
//
//   cd /root/werkzeug-screenshots && node pruefe-keep-bestenliste.mjs
//
// Der Browserteil laeuft gegen eine eigene Fassung auf Port 8107 mit einem
// vorbefuellten Datenverzeichnis - die echte Liste gehoert den Leuten, die
// dort spielen.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8107;
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

const TAG = 86400000;

// ------------------------------------------------------------ Rechenteil
// Das Modul liest sein Verzeichnis beim ersten Zugriff aus der Umgebung.
const RECHEN_DIR = mkdtempSync(join(tmpdir(), "keep-lb-rechnen-"));
process.env.KEEP_DATA_DIR = RECHEN_DIR;
const store = await import("/var/www/html/keep/server/store.js");

console.log("\nL01/L04/L05  Zusammenfassen, Unfug, Gleichstand");
store.addLeaderboardEntry("Ata", 300_000, { place: 2, players: 2 });
store.addLeaderboardEntry("ata", 900_000, { place: 1, players: 1 });   // dieselbe Person
store.addLeaderboardEntry("ATA", 100_000, { place: 3, players: 3 });
store.addLeaderboardEntry("Mira", 900_000, { place: 1, players: 2 });
store.addLeaderboardEntry("Bert", Infinity, { place: 4, players: 2 });
store.addLeaderboardEntry("Cid", "viel", { place: 4, players: 2 });
store.addLeaderboardEntry("Dana", -5000, { place: 4, players: 2 });

const woche = store.tafel("woche");
const ata = woche.find((e) => e.name.toLowerCase() === "ata");
pruefe("L01", woche.filter((e) => e.name.toLowerCase() === "ata").length === 1,
  "drei Partien von Ata sind eine Zeile");
pruefe("L01", ata?.score === 900_000, `es zaehlt die beste (${ata?.score.toLocaleString("de-DE")})`);
pruefe("L01", ata?.laeufe === 3, `die Zeile weiss, dass es ${ata?.laeufe} Partien waren`);
pruefe("L01", ata?.name === "ata", "die Schreibweise der besten Partie gewinnt");
pruefe("L01", ata?.players === 1, "Besetzung kommt aus der besten Partie, nicht aus der letzten");
pruefe("L04", woche.every((e) => Number.isFinite(e.score) && e.score >= 0),
  "keine unbrauchbare Zahl in der Liste");
pruefe("L04", woche.find((e) => e.name === "Bert")?.score === 0, "Infinity wird zu 0");
pruefe("L04", woche.find((e) => e.name === "Cid")?.score === 0, "Text wird zu 0");
pruefe("L04", woche.find((e) => e.name === "Dana")?.score === 0, "negativ wird zu 0");
const oben = woche.filter((e) => e.rank === 1).map((e) => e.name).sort();
pruefe("L05", oben.length === 2, `Gleichstand teilt Platz 1 (${oben.join(" + ")})`);
pruefe("L05", woche[2]?.rank === 3, "der naechste rutscht auf Platz 3, nicht auf 2");

console.log("\nL02  Die Wochenliste filtert, sie loescht nicht");
// Ein Eintrag von vor drei Wochen, direkt in die Datei geschrieben.
const datei = join(RECHEN_DIR, "leaderboard.json");
const alle = JSON.parse(fs.readFileSync(datei, "utf8"));
const alt = Date.now() - 21 * TAG;
alle.push({ name: "Opa", score: 2_000_000, place: 1, players: 1, at: alt, date: new Date(alt).toISOString() });
fs.writeFileSync(datei, JSON.stringify(alle));
pruefe("L02", !store.tafel("woche").some((e) => e.name === "Opa"), "der alte Lauf fehlt in der Wochenliste");
pruefe("L02", store.tafel("ewig")[0]?.name === "Opa", "in der ewigen steht er ganz oben");
pruefe("L02", JSON.parse(fs.readFileSync(datei, "utf8")).some((e) => e.name === "Opa"),
  "und in der Datei liegt er weiter");

console.log("\nL03  Wochenanfang: Montag 00:00 Berliner Zeit");
const berlin = (ms) => new Date(ms).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
for (const [name, iso] of [
  ["Mitten im Sommer", "2026-08-19T12:00:00Z"],
  ["Sonntagnacht", "2026-08-16T21:30:00Z"],       // 23:30 Berlin, noch Vorwoche
  ["Montag frueh", "2026-08-17T00:30:00Z"],       // 02:30 Berlin, neue Woche
  ["Winterzeit", "2026-01-14T12:00:00Z"],
  ["Umstellung Maerz", "2026-03-30T12:00:00Z"],
]) {
  const ms = Date.parse(iso);
  const start = store.wochenStart(ms);
  const w = new Date(start).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" });
  pruefe("L03", /Mo.*00:00/.test(w) && start <= ms && ms - start < 7 * TAG,
    `${name.padEnd(18)} ${berlin(ms)} -> ${w}`);
}

// -------------------------------------------------------------- Browser
console.log("\nL06  Im Browser");
const BROWSER_DIR = mkdtempSync(join(tmpdir(), "keep-lb-browser-"));
const jetzt = Date.now();
fs.writeFileSync(join(BROWSER_DIR, "leaderboard.json"), JSON.stringify([
  { name: "Wochenheld", score: 1_500_000, place: 1, players: 2, at: jetzt - 3600_000 },
  { name: "wochenheld", score: 900_000, place: 2, players: 3, at: jetzt - 7200_000 },
  { name: "Ewiger", score: 9_000_000, place: 1, players: 1, at: jetzt - 30 * TAG },
]));

async function portAntwortet(port, ms = 20000) {
  const ende = Date.now() + ms;
  for (;;) {
    const da = await new Promise((r) => {
      const s = net.connect({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); r(true); });
      s.once("error", () => { s.destroy(); r(false); });
      setTimeout(() => { s.destroy(); r(false); }, 400);
    });
    if (da) return true;
    if (Date.now() > ende) return false;
    await schlaf(150);
  }
}
const kind = spawn("/usr/local/bin/deno", ["run", "-A", "--node-modules-dir=auto", "server/index.js"], {
  cwd: "/var/www/html/keep",
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", KEEP_DATA_DIR: BROWSER_DIR, DENO_DIR: "/tmp/deno-check" },
  stdio: ["ignore", "pipe", "pipe"],
});
let fehler = "";
kind.stderr.on("data", (d) => { fehler += d.toString(); });
if (!await portAntwortet(PORT)) throw new Error(`kam nicht hoch:\n${fehler.slice(0, 600)}`);

const browser = await chromium.launch();
try {
  const seite = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const laut = [];
  seite.on("console", (m) => { if (m.type() === "error") laut.push(m.text()); });
  seite.on("pageerror", (e) => laut.push(String(e)));

  await seite.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await seite.click("#showLeaderboardBtn");
  await seite.waitForSelector("#screen-leaderboard.active", { timeout: 10000 });
  await schlaf(500);

  // Die Zeilen heissen `.res` wie in Card Chaos - gleicher Aufbau, gleiche Klassen.
  const zeilen = async () => seite.$$eval("#leaderboardList .res", (ls) => ls.map((l) => l.textContent.trim()));
  const wocheListe = await zeilen();
  pruefe("L06", wocheListe.length === 1, `Woche zeigt eine Zeile (${wocheListe.length})`);
  pruefe("L06", /Wochenheld/.test(wocheListe[0] ?? ""), `und zwar ${JSON.stringify(wocheListe[0] ?? "")}`);
  pruefe("L06", /2 Partien/.test(wocheListe[0] ?? ""), "mit der Zahl der Partien dahinter");
  pruefe("L06", /1\.500\.000/.test(wocheListe[0] ?? ""), "und der besten Punktzahl");
  pruefe("L06", /Montag/.test(await seite.textContent("#lbFuss")), "die Fusszeile nennt den Wochenanfang");
  pruefe("L06", await seite.$eval("#leaderboardList .res", (r) => r.classList.contains("p1")),
    "die erste Zeile traegt den Platz-1-Anstrich (wie in Card Chaos)");

  await seite.click('#lbZeitraum .seg[data-lb="ewig"]');
  await schlaf(300);
  const ewigListe = await zeilen();
  pruefe("L06", ewigListe.length === 2, `Ewig zeigt beide (${ewigListe.length})`);
  pruefe("L06", /Ewiger/.test(ewigListe[0] ?? ""), "der alte Lauf steht dort oben");
  pruefe("L06", await seite.$eval('#lbZeitraum .seg[data-lb="ewig"]', (b) => b.classList.contains("sel")),
    "der Umschalter zeigt, wo man steht");

  // Die Wahl soll ein Neuladen ueberleben - sonst klickt man sie jedes Mal neu.
  await seite.reload({ waitUntil: "domcontentloaded" });
  await seite.click("#showLeaderboardBtn");
  await schlaf(500);
  pruefe("L06", await seite.$eval('#lbZeitraum .seg[data-lb="ewig"]', (b) => b.classList.contains("sel")),
    "nach dem Neuladen steht die Ansicht noch");

  pruefe("L06", laut.length === 0, laut.length ? `Konsole: ${laut.slice(0, 3).join(" | ")}` : "Konsole still");
} finally {
  await browser.close();
  kind.kill("SIGTERM");   // nie ueber `pkill -f` (CLAUDE.md)
}

console.log(`\n  ${gruen} gruen, ${rot} rot`);
if (rot) { console.error("\nBefunde:"); for (const b of befunde) console.error("  - " + b); process.exit(1); }
