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
//   G06  Der Jubel haengt oben und liegt nie auf Walzen oder Kombi-Tafel -
//        und keine Effekt-Ebene nimmt einen Klick weg.
//   G07  Die Tafel steht sofort. Die Walzen zeigen ihr Symbol in dem Moment,
//        in dem es gezogen wird - es gibt nichts abzuwarten.
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

/**
 * Seit den Effekten rollen die Walzen erst ein paar hundert Millisekunden,
 * bevor die Tafel ihre Zahlen zeigt (`.cat.rollt`, keine `.cat.available`).
 * Vorher zu greifen hiesse: nichts zu finden und das fuer einen Fehlwurf zu
 * halten. Also warten - entweder steht die Tafel, oder die Runde ist wirklich
 * vorbei und der Wartebildschirm steht.
 */
async function warteAufTafel(seite) {
  const los = Date.now();
  try {
    await seite.waitForSelector(
      ".cat.available, #screen-wait.active, #screen-results.active, #screen-final.active",
      { timeout: 5000 });
  } catch { /* nichts von beidem: der Aufrufer merkt es am naechsten Zaehlen */ }
  return { da: await seite.locator(".cat.available").count() > 0, ms: Date.now() - los };
}
const mult = async (seite) => Number((await seite.locator("#multPill").textContent()).replace("×", "").replace(",", "."));
const glutBreite = async (seite) =>
  seite.locator("#glutFill").evaluate((el) => el.getBoundingClientRect().width);

await dienstAn();
const browser = await chromium.launch();
try {
  const kontext = await browser.newContext({
    // Deutscher Browser: die Seiten sind dreisprachig und richten sich
    // beim ersten Besuch nach der Spracheinstellung.
    locale: "de-DE", viewport: { width: 390, height: 844 } });
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
  let summe = 0, hoechsterMult = 1, ersteKachel = null, ersteZahl = 0, laengstesRollen = 0;
  for (let zug = 0; zug < 6; zug++) {
    // Nur echte Wartezeiten zaehlen: ist die Runde vorbei, wartet hier
    // niemand mehr auf Walzen.
    const gewartet = await warteAufTafel(seite);
    if (gewartet.da) laengstesRollen = Math.max(laengstesRollen, gewartet.ms);
    const kachel = seite.locator(".cat.available").first();
    // Kein Feld mehr frei heisst Fehlwurf - die Runde ist dann vorbei, und was
    // bis dahin steht, wird trotzdem geprueft.
    if (!await kachel.count()) { console.log(`  ...  Fehlwurf nach ${zug} Zuegen, Runde vorbei`); break; }
    // Welche Kachel es ist, VOR dem Klick lesen: der Zug baut die Tafel neu
    // auf, danach zeigt derselbe Locator auf eine andere.
    const welche = await kachel.getAttribute("data-cat");
    const vorMult = await mult(seite);
    await kachel.click();
    hoechsterMult = Math.max(hoechsterMult, vorMult);
    // Der Punktestand laeuft jetzt hoch, statt zu springen: erst danach lesen.
    await seite.waitForTimeout(700);
    // Was wirklich gewertet wurde, steht auf der Kachel selbst - und zwar
    // fuer immer. Die Vorschau VOR dem Klick taugt dafuer nicht: zwischen
    // Ablesen und Antippen kann die Glut eine Stufe fallen, und dann zaehlt
    // die niedrigere. Genau so ist es gemeint, aber nachrechnen laesst es
    // sich nur an der Zahl, die stehen geblieben ist.
    const wert = zahl(await seite.locator(`.cat[data-cat="${welche}"] .cat-pts`).textContent());
    summe += wert;
    if (!ersteKachel) { ersteKachel = welche; ersteZahl = wert; }
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

  // ---- G07: es gibt nichts abzuwarten ----
  // Gemessen vom Ende des vorigen Zuges bis zu dem Moment, in dem die Tafel
  // wieder Zahlen zeigt. Das Einfliegen der Walzen laeuft ueber ein bereits
  // lesbares Feld, also darf hier fast nichts stehen. Die Grenze ist bewusst
  // eng: sie faengt jeden Effekt ab, der sich wieder vor das Spiel schiebt.
  pruefe("G07", laengstesRollen < 400,
    `laengste Wartezeit auf die Tafel: ${laengstesRollen} ms`);

  // ---- G06: der Jubel darf nichts verdecken ----
  // Er wird hier von Hand gesetzt statt erspielt: auf einen Jackpot koennte
  // man lange warten, und geprueft wird ohnehin die Platzierung aus der
  // styles.css, nicht der Anlass.
  const lage = await seite.evaluate(() => {
    const box = document.getElementById("celebrate");
    const d = document.createElement("div");
    d.className = "burst jackpot";
    d.textContent = "💰 JACKPOT!";
    box.appendChild(d);
    const r = (el) => { const b = el.getBoundingClientRect(); return { o: b.top, u: b.bottom, l: b.left, re: b.right }; };
    const jubel = r(d);
    const mitte = { x: (jubel.l + jubel.re) / 2, y: (jubel.o + jubel.u) / 2 };
    const treffer = document.elementFromPoint(mitte.x, mitte.y);
    const antwort = {
      jubel,
      walzen: r(document.getElementById("reels")),
      tafel: r(document.getElementById("scorecard")),
      durchlaessig: !d.contains(treffer) && treffer !== d,
      ebeneAus: getComputedStyle(box).pointerEvents,
      fxAus: document.getElementById("fx-lage")
        ? getComputedStyle(document.getElementById("fx-lage")).pointerEvents : "keine Ebene",
    };
    d.remove();
    return antwort;
  });
  const ueberdeckt = (a, b) => a.o < b.u && a.u > b.o && a.l < b.re && a.re > b.l;
  pruefe("G06", !ueberdeckt(lage.jubel, lage.walzen),
    `Jubel (${lage.jubel.o.toFixed(0)}-${lage.jubel.u.toFixed(0)} px) liegt nicht auf den Walzen (ab ${lage.walzen.o.toFixed(0)} px)`);
  pruefe("G06", !ueberdeckt(lage.jubel, lage.tafel), "und nicht auf der Kombi-Tafel");
  pruefe("G06", lage.durchlaessig, "ein Klick mitten durch den Jubel kommt durch");
  pruefe("G06", lage.ebeneAus === "none", `die Jubel-Ebene nimmt keine Klicks (pointer-events: ${lage.ebeneAus})`);
  pruefe("G06", lage.fxAus === "none", `die Effekt-Ebene ebenso wenig (pointer-events: ${lage.fxAus})`);

  pruefe("G01", laut.length === 0, laut.length ? `Konsole: ${laut.slice(0, 3).join(" | ")}` : "Konsole still");
} finally {
  await browser.close();
  dienstAus();
}

console.log(`\n  ${gruen} gruen, ${rot} rot`);
if (rot) { console.error("\nBefunde:"); for (const b of befunde) console.error("  - " + b); process.exit(1); }
