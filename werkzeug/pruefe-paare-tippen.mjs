// Paare, Bugreport 5: „wenn man auf eine Karte klickt, obwohl es erst
// aufgedeckt wurde, soll die Wartezeit abgebrochen werden."
//
// Ein falsches Paar bleibt 1,8 s liegen. Wer es schon gesehen hat, wartet
// ungern. Seither bricht ein Tipp aufs Brett die Wartezeit ab – frühestens
// 450 ms nach dem Aufdecken, damit die zweite Karte nicht weg ist, bevor die
// anderen sie gesehen haben.
//
// Die Probe spielt allein (Paare erlaubt das ausdrücklich), deckt zwei Karten
// auf, bis sie einmal danebengreift, und misst dann, wie lange es vom Tipp bis
// zum Zudecken dauert.
//
// Läuft gegen eine **eigene Fassung**, nicht gegen live: sie öffnet einen Raum
// und verbraucht Züge.
//
//   cd /var/www/html/paare
//   PORT=8456 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
//   cd /root/werkzeug-screenshots && node pruefe-paare-tippen.mjs
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "http://127.0.0.1:8456";
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 390, height: 844 } });
const konsole = [];
seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
seite.on("pageerror", (e) => konsole.push(String(e)));

const offene = () => seite.locator(".pk.auf").count();

try {
  await seite.goto(`${BASIS}/`, { waitUntil: "domcontentloaded" });
  await seite.fill("#name", "Probe");
  await seite.click('[data-vis="private"]');
  await seite.click("#createBtn");
  await seite.waitForSelector("#screen-lobby.active", { timeout: 15000 });
  await seite.click("#startBtn");
  await seite.waitForSelector(".pk", { timeout: 15000 });
  pruefe(await seite.locator(".pk").count() > 0, "Brett steht");

  // Solange aufdecken, bis zwei Karten nicht zusammenpassen.
  let daneben = false;
  for (let versuch = 0; versuch < 12 && !daneben; versuch++) {
    const zu = seite.locator(".pk:not(.auf):not(.weg)");
    const n = await zu.count();
    if (n < 2) break;
    await zu.nth(0).click();
    await schlaf(180);
    await zu.nth(0).click();     // die Liste ist um die erste kürzer geworden
    await schlaf(220);
    daneben = await offene() === 2;
  }
  pruefe(daneben, "zwei Karten liegen offen und passen nicht zusammen");

  if (daneben) {
    // Vor der Mindestfrist prallt der Tipp ab – die Karten bleiben liegen.
    await seite.locator(".pk.auf").first().click();
    await schlaf(120);
    pruefe(await offene() === 2,
      "ein Tipp in den ersten Millisekunden reißt die Karten nicht sofort weg");

    // Danach deckt derselbe Tipp sofort zu.
    await schlaf(400);
    const t0 = Date.now();
    await seite.locator(".pk.auf").first().click();
    let gebraucht = -1;
    for (let i = 0; i < 60; i++) {
      if (await offene() === 0) { gebraucht = Date.now() - t0; break; }
      await schlaf(25);
    }
    pruefe(gebraucht >= 0 && gebraucht < 700,
      `der Tipp deckt zu, ohne die vollen 1,8 s abzuwarten (${gebraucht} ms)`);
  }

  pruefe(konsole.length === 0, `Konsole still (${konsole.join(" | ").slice(0, 200)})`);
} finally {
  await browser.close();
}

console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const f of befunde) console.error("  · " + f);
  process.exit(1);
}
console.log("ALLES GRÜN");
