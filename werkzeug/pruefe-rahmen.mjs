// Der Rahmen um die Spiele: alles, was ein fremder Mensch zuerst sieht, und
// alles, was auf jeder einzelnen Seite gleich sein muss.
//
//   S04  Impressum und Datenschutz: erreichbar, verlinkt, mit Inhalt.
//   S06  Jeder Pfad aus `spiele.json` antwortet mit 200.
//   S07  Kein Spiel wirft beim Laden etwas in die Konsole. Das prüft sonst
//        niemand: die Lobby-Probe spricht WebSocket, sieht also den Browser
//        nie, und `pruefe-statisch.mjs` deckt nur die vier ohne Server ab.
//   S08  Handy 390×844: nichts läuft seitlich aus dem Bild, und der erste
//        Knopf ist erreichbar, ohne zu wischen.
//
//   cd /root/werkzeug-screenshots && node pruefe-rahmen.mjs
//
// Versioniert liegt die Datei in /var/www/html/werkzeug/ – wer sie hier ändert,
// kopiert sie dorthin zurück.

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const spieleJson = JSON.parse(readFileSync("/var/www/html/spiele.json", "utf8"));
const PFADE = spieleJson.spiele.map((s) => s.name);

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test.padEnd(4)} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test.padEnd(4)} ${text}`); }
};

const browser = await chromium.launch();

/**
 * Lädt eine Seite und sammelt alles ein, was der Browser zu meckern hat:
 * Konsolenfehler, geplatzte Ausnahmen und Anfragen, die nicht ankommen. Ein
 * fehlendes Bild oder ein 404 auf eine JS-Datei fällt sonst nirgends auf – die
 * Seite steht ja trotzdem da, nur eben halb.
 */
async function ladeUndHorche(pfad, viewport = { width: 1280, height: 900 }) {
  const seite = await browser.newPage({
    // Deutscher Browser: die Seiten sind dreisprachig und richten sich
    // beim ersten Besuch nach der Spracheinstellung.
    locale: "de-DE", viewport });
  const konsole = [], kaputt = [];
  seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  seite.on("pageerror", (e) => konsole.push(String(e)));
  seite.on("requestfailed", (r) => {
    // `net::ERR_ABORTED` ist kein Fehler, sondern meistens Absicht. Die
    // Startseite fragt jedes Spiel mit `HEAD` ab, um den grünen Punkt zu
    // setzen; auf eine Antwort ohne Rumpf bucht Chrome die Anfrage als
    // abgebrochen, während das `fetch`-Versprechen sauber aufgeht. Alle 23
    // Punkte stehen dabei nachweislich auf „up" – wer das hier mitzählt,
    // meldet 23 Fehler, die keine sind.
    if (r.failure()?.errorText === "net::ERR_ABORTED") return;
    kaputt.push(`${r.url()} (${r.failure()?.errorText})`);
  });
  seite.on("response", (r) => {
    if (r.status() >= 400) kaputt.push(`${r.url()} → HTTP ${r.status()}`);
  });
  const antwort = await seite.goto(`${BASIS}${pfad}`, { waitUntil: "domcontentloaded" });
  // Ein Moment für alles, was erst nach dem Aufbau nachlädt oder verbindet.
  await seite.waitForTimeout(1500);
  return { seite, konsole, kaputt, status: antwort?.status() };
}

// ══════════════════════════════════════════════════ S04 · Rechtstexte
console.log("\nS04 · Impressum und Datenschutz");
for (const pfad of ["/impressum/", "/datenschutz/"]) {
  const { seite, konsole, status } = await ladeUndHorche(pfad);
  const text = (await seite.locator("body").innerText()).trim();
  pruefe("S04", status === 200, `${pfad} → HTTP ${status}`);
  pruefe("S04", text.length > 300, `${pfad} hat Inhalt (${text.length} Zeichen)`);
  pruefe("S04", konsole.length === 0, `${pfad} Konsole still (${konsole.join(" | ")})`);
  // Zurück zur Seite muss von hier aus gehen, sonst ist der Rechtstext eine
  // Sackgasse – auf dem Handy gibt es keinen sichtbaren Zurück-Knopf.
  const zurueck = await seite.locator('a[href="/spiele/"], a[href="/"], a[href^="/spiele"]').count();
  pruefe("S04", zurueck > 0, `${pfad} führt zurück zur Seite (${zurueck} Verweise)`);
  await seite.close();
}

{
  const { seite } = await ladeUndHorche("/spiele/");
  for (const ziel of ["/impressum/", "/datenschutz/"]) {
    const n = await seite.locator(`a[href="${ziel}"]`).count();
    pruefe("S04", n > 0, `Startseite verlinkt ${ziel} (${n}×)`);
  }
  await seite.close();
}

// ══════════════════════════════════════════════════ S06/S07 · jede Seite
console.log("\nS06/S07 · jede Seite laden und der Konsole zuhören");
for (const pfad of ["/spiele/", ...PFADE.map((p) => `/${p}/`)]) {
  const { seite, konsole, kaputt, status } = await ladeUndHorche(pfad);
  const name = pfad.padEnd(14);
  if (status !== 200) {
    pruefe("S06", false, `${name} HTTP ${status}`);
  } else if (konsole.length || kaputt.length) {
    pruefe("S07", false, `${name} ${[...konsole, ...kaputt].join(" | ").slice(0, 300)}`);
  } else {
    pruefe("S07", true, `${name} 200, Konsole still, alles geladen`);
  }
  await seite.close();
}

// ══════════════════════════════════════════════════ S08 · Handy
console.log("\nS08 · 390×844");
for (const pfad of ["/spiele/", ...PFADE.map((p) => `/${p}/`)]) {
  const { seite } = await ladeUndHorche(pfad, { width: 390, height: 844 });
  const mass = await seite.evaluate(() => ({
    breite: document.documentElement.scrollWidth,
    sicht: window.innerWidth,
    // Was ragt heraus? Der erste Übeltäter reicht, um ihn zu finden.
    taeter: [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 3)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`.slice(0, 60)),
  }));
  const ok = mass.breite <= mass.sicht + 1;
  pruefe("S08", ok, ok
    ? `${pfad.padEnd(14)} kein seitliches Scrollen (${mass.breite}px)`
    : `${pfad.padEnd(14)} läuft ${mass.breite - mass.sicht}px heraus: ${mass.taeter.join(", ")}`);
  await seite.close();
}

await browser.close();
console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
