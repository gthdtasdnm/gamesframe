// Browserlauf für die vier Spiele ohne Server: Minenfeld, Sudoku, Wortgitter,
// Patience. Sie haben keine Verbindung, die eine Probe abklopfen könnte – was
// bei ihnen schiefgeht, geht im Browser schief.
//
//   cd /root/werkzeug-screenshots && node pruefe-statisch.mjs
//
// Geprüft wird das Grobe, aber genau das, was ein Fehler in `app.js` kaputt
// macht: baut sich die Seite überhaupt auf, steht danach ein Spielfeld da, und
// wirft die Konsole etwas? Ein Modul, das beim Laden stirbt, hinterlässt eine
// leere Bühne – und das sieht man von außen nicht, wenn niemand hinsieht.
//
// Versioniert liegt die Datei in /var/www/html/werkzeug/ – wer sie hier ändert,
// kopiert sie dorthin zurück.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";

/**
 * Je Spiel: worauf gewartet wird, wie viele Felder mindestens dastehen müssen,
 * und ein Klick, der etwas auslösen muss.
 */
const SPIELE = [
  {
    name: "minenfeld",
    warte: ".mfeld .mz",
    mindestens: [".mfeld .mz", 81],
    // Ein Klick legt die Minen und zieht eine Flaeche auf: danach ist mindestens
    // ein Feld offen. Genau hier haengt "der erste Klick ist sicher".
    klick: ".mfeld .mz:nth-child(41)",
    danach: [".mfeld .mz.auf", 1],
  },
  {
    name: "sudoku",
    warte: ".sgitter .sz",
    mindestens: [".sgitter .sz", 81],
    // Vorgegebene Zahlen: bei "Leicht" sind es 44. Steht da nichts, ist der
    // Generator gestorben, ohne dass die Seite es zeigt.
    danach: [".sgitter .sz.vor", 20],
  },
  {
    name: "wortgitter",
    warte: ".wgitter .wk",
    // Fuenf Buchstaben mal sechs Versuche, dazu die Tastatur.
    mindestens: [".wgitter .wk", 30],
    danach: [".tastatur .tk", 28],
  },
  {
    name: "patience",
    warte: ".ptisch .pspalte",
    mindestens: [".ptisch .pspalte", 7],
    // Sieben Spalten mit 1+2+…+7 = 28 Karten.
    danach: [".ptisch .pk", 28],
  },
];

const browser = await chromium.launch();
let fehler = 0;

for (const s of SPIELE) {
  const seite = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const konsole = [];
  seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  seite.on("pageerror", (e) => konsole.push(String(e)));

  const url = `${BASIS}/${s.name}/`;
  try {
    const antwort = await seite.goto(url, { waitUntil: "domcontentloaded" });
    if (antwort.status() !== 200) throw new Error(`HTTP ${antwort.status()}`);

    await seite.waitForSelector(s.warte, { timeout: 8000 });

    const [wahl, mind] = s.mindestens;
    const n = await seite.locator(wahl).count();
    if (n < mind) throw new Error(`${wahl}: ${n} statt mindestens ${mind}`);

    if (s.klick) {
      await seite.locator(s.klick).click();
      await seite.waitForTimeout(300);
    }
    if (s.danach) {
      const [w2, m2] = s.danach;
      const n2 = await seite.locator(w2).count();
      if (n2 < m2) throw new Error(`${w2}: ${n2} statt mindestens ${m2}`);
    }

    if (konsole.length) throw new Error("Konsole: " + konsole.join(" | "));
    console.log(`ok  ${s.name.padEnd(11)} ${n} Felder, Klick wirkt, Konsole still`);
  } catch (e) {
    fehler++;
    console.error(`FEHLER ${s.name}: ${e.message}`);
    if (konsole.length) console.error("        Konsole: " + konsole.join(" | "));
  }
  await seite.close();
}

await browser.close();
if (fehler) {
  console.error(`\n${fehler} von ${SPIELE.length} Spielen kaputt.`);
  process.exit(1);
}
console.log("\nALLES GRÜN");
