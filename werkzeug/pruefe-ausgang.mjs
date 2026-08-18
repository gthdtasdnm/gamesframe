// Bugreport 10, die andere Hälfte: `pruefe-durchlauf.mjs` spielt B09 nur für
// die sieben Spiele mit `schale.js` durch. Die neun übrigen tragen ihren
// Client selbst – dort ist die Frage nicht, ob der Knopf hinausführt (der Weg
// ist derselbe wie beim „Raum verlassen" der Lobby), sondern ob er überhaupt
// **verdrahtet** ist. Genau das prüft dieses Skript, ohne eine Partie zu
// brauchen: Endstand einblenden, Knopf drücken, steht danach die Startseite da?
//
//   cd /root/werkzeug-screenshots && node pruefe-ausgang.mjs
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const SPIELE = [
  "snake", "werwolf", "maumau", "becher", "kingscup", "schwimmen", "paare",
  "amehesten", "cubes", "wortleger", "luegen",
  "nochnie", "maexchen", "imposter", "flasche", "luckyreflex",
];

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (spiel, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${spiel.padEnd(12)} ${text}`); }
  else { rot++; befunde.push(`${spiel}: ${text}`); console.error(`  FEHL ${spiel.padEnd(12)} ${text}`); }
};

const browser = await chromium.launch();

for (const spiel of SPIELE) {
  const kontext = await browser.newContext();
  const seite = await kontext.newPage();
  const konsole = [];
  seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  seite.on("pageerror", (e) => konsole.push(String(e)));
  try {
    await seite.goto(`${BASIS}/${spiel}/`, { waitUntil: "domcontentloaded" });
    await seite.waitForSelector("#screen-home.active", { timeout: 10000 });

    const heim = await seite.locator('.zurueck[href="/spiele/"]').isVisible().catch(() => false);
    pruefe(spiel, heim, "Startseite: Weg zur Spieleübersicht");

    // Nicht jedes Spiel hat einen Endstand: Imposter zählt keine Punkte und
    // geht vom Spielbildschirm direkt in den Warteraum zurück. Geprüft wird
    // deshalb der letzte Bildschirm, den es *gibt*.
    const hatEndstand = await seite.locator("#screen-final").count() > 0;
    const letzter = hatEndstand ? "screen-final" : "screen-game";
    const zahl = await seite.locator("[data-raus]").count();
    pruefe(spiel, zahl >= (hatEndstand ? 2 : 1),
      `${zahl} Ausgänge im Markup (${hatEndstand ? "Spielbildschirm und Endstand" : "Spielbildschirm"})`);

    // Den Bildschirm von Hand einblenden – ohne Partie. Geprüft wird nur die
    // Verdrahtung des Knopfes, nicht der Weg dorthin.
    await seite.evaluate((id) => {
      for (const s of document.querySelectorAll(".screen")) {
        s.classList.toggle("active", s.id === id);
      }
    }, letzter);
    await seite.locator(`#${letzter} [data-raus]`).click();
    const daheim = await seite.locator("#screen-home.active").isVisible().catch(() => false);
    pruefe(spiel, daheim, `Knopf auf »${letzter}« führt auf die Startseite`);
    pruefe(spiel, konsole.length === 0, `Konsole still (${konsole.join(" | ").slice(0, 160)})`);
  } catch (e) {
    pruefe(spiel, false, e.message);
  } finally {
    await kontext.close();
  }
}

await browser.close();
console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
