// Keep im echten Browser: der Glutbalken und die Zusage, dass eine gewertete
// Zahl sich nie wieder aendert.
//
// `deno check` findet in reinem JS keinen vergessenen Namen (CLAUDE.md,
// Falle 4) - `renderGlut`, `setGlut` und `refreshPreise` werden erst beim
// Klicken gerufen. Deshalb wird hier wirklich gespielt.
//
//   G01  Die Runde baut sich auf, die Konsole bleibt still.
//   G02  Eine Kachel werten: die Punkte landen im Rundenzaehler.
//   G03  Die Glut steigt beim Werten und faellt danach von allein.
//   G04  Der Multiplikator klettert ueber x1 - und nie ueber x2.
//   G05  Eine gewertete Kachel behaelt ihre Zahl, auch wenn die Stufe wechselt.
//
//   cd /root/werkzeug-screenshots && node pruefe-keep-glut.mjs
//
// Immer gegen eine eigene Fassung auf Port 8106 mit eigenem Datenverzeichnis:
// eine Partie schreibt in die Bestenliste, und die der Live-Fassung gehoert
// den Leuten, die dort spielen.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8106;
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

// ---------------------------------------------------------------- Dienst
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
let kind = null;
const DATEN = mkdtempSync(join(tmpdir(), "keep-glut-"));
async function dienstAn() {
  kind = spawn("/usr/local/bin/deno", ["run", "-A", "--node-modules-dir=auto", "server/index.js"], {
    cwd: "/var/www/html/keep",
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", KEEP_DATA_DIR: DATEN, DENO_DIR: "/tmp/deno-check" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let fehler = "";
  kind.stderr.on("data", (d) => { fehler += d.toString(); });
  if (!await portAntwortet(PORT)) throw new Error(`kam nicht hoch:\n${fehler.slice(0, 600)}`);
}
/** Nie ueber `pkill -f` - das traefe die eigene Sitzung mit (CLAUDE.md). */
function dienstAus() { if (kind) { kind.kill("SIGTERM"); kind = null; } }

// ---------------------------------------------------------------- Lauf
const zahl = (t) => Number(String(t).replace(/\./g, "").trim());
const mult = async (seite) => Number((await seite.locator("#multPill").textContent()).replace("×", "").replace(",", "."));
const glutBreite = async (seite) =>
  seite.locator("#glutFill").evaluate((el) => el.getBoundingClientRect().width);

await dienstAn();
const browser = await chromium.launch();
try {
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const seite = await kontext.newPage();
  const laut = [];
  seite.on("console", (m) => { if (m.type() === "error") laut.push(m.text()); });
  seite.on("pageerror", (e) => laut.push(String(e)));

  await seite.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await seite.fill("#nameInput", "Glutprobe");
  await seite.click("#createBtn");
  await seite.waitForSelector("#screen-lobby.active", { timeout: 10000 });
  // Der Host hat keinen Bereit-Knopf - er zaehlt als bereit und startet direkt.
  await seite.click("#startBtn");
  const imSpiel = await seite.waitForSelector("#screen-game.active", { timeout: 10000 }).then(() => true, () => false);
  pruefe("G01", imSpiel, "allein gestartet, Spielbildschirm steht");
  pruefe("G01", await seite.locator("#glutFill").count() === 1, "der Glutbalken ist im Bild");

  // ---- G02/G04/G05: ein paar Zuege werten, so schnell es geht ----
  let summe = 0, hoechsterMult = 1, ersteKachel = null, ersteZahl = 0;
  for (let zug = 0; zug < 6; zug++) {
    const kachel = seite.locator(".cat.available").first();
    // Kein Feld mehr frei heisst Fehlwurf - die Runde ist dann vorbei, und was
    // bis dahin steht, wird trotzdem geprueft.
    if (!await kachel.count()) { console.log(`  ...  Fehlwurf nach ${zug} Zuegen, Runde vorbei`); break; }
    // Beides VOR dem Klick lesen: der Zug baut die Tafel neu auf, danach zeigt
    // derselbe Locator auf eine andere Kachel.
    const wert = zahl(await kachel.locator(".cat-pts").textContent());
    const welche = await kachel.getAttribute("data-cat");
    const vorMult = await mult(seite);
    await kachel.click();
    summe += wert;
    hoechsterMult = Math.max(hoechsterMult, vorMult);
    if (!ersteKachel) { ersteKachel = welche; ersteZahl = wert; }
    await seite.waitForTimeout(120);
    const stand = zahl(await seite.locator("#roundScorePill").textContent());
    pruefe("G02", stand === summe, `Zug ${zug + 1}: ${wert.toLocaleString("de-DE")} gewertet, Stand ${stand.toLocaleString("de-DE")}`);
    hoechsterMult = Math.max(hoechsterMult, await mult(seite));
  }
  pruefe("G04", hoechsterMult > 1, `der Multiplikator kam ueber x1 (bis x${hoechsterMult})`);
  pruefe("G04", hoechsterMult <= 2, `und nie ueber x2 (x${hoechsterMult})`);

  // ---- G03: Glut faellt von allein ----
  const heiss = await glutBreite(seite);
  pruefe("G03", heiss > 0, `nach den Zuegen glueht der Balken (${heiss.toFixed(0)} px)`);
  await seite.waitForTimeout(4000);
  const kalt = await glutBreite(seite);
  pruefe("G03", kalt < heiss, `nach 4 s ist er kleiner (${kalt.toFixed(0)} px)`);
  pruefe("G03", await mult(seite) <= hoechsterMult, "der Multiplikator sinkt mit");

  // ---- G05: die gewertete Zahl steht fest ----
  if (ersteKachel) {
    const jetzt = zahl(await seite.locator(`.cat[data-cat="${ersteKachel}"] .cat-pts`).textContent());
    pruefe("G05", jetzt === ersteZahl,
      `${ersteKachel} steht weiter auf ${ersteZahl.toLocaleString("de-DE")} (jetzt ${jetzt.toLocaleString("de-DE")})`);
  }

  pruefe("G01", laut.length === 0, laut.length ? `Konsole: ${laut.slice(0, 3).join(" | ")}` : "Konsole still");
} finally {
  await browser.close();
  dienstAus();
}

console.log(`\n  ${gruen} gruen, ${rot} rot`);
if (rot) { console.error("\nBefunde:"); for (const b of befunde) console.error("  - " + b); process.exit(1); }
