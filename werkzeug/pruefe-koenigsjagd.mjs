// Koenigsjagd im echten Browser, auf zwei Geraeten gleichzeitig.
//
// Die Rechenproben (`deno task pruefe`, `deno task probe`) sagen, dass die
// Regeln stimmen. Sie sagen nichts darueber, ob man das Brett auf einem Handy
// bedienen kann – und genau daran haengt dieses Spiel: acht mal acht Felder
// auf 390 Pixeln, darunter die Hand, und der Knopf „Zug beenden" muss ohne
// Scrollen erreichbar bleiben.
//
// Laeuft gegen eine **eigene Fassung**, nicht gegen live: sie oeffnet einen
// Raum und spielt Zuege.
//
//   cd /var/www/html/koenigsjagd
//   PORT=8092 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
//   cd /root/werkzeug-screenshots && node pruefe-koenigsjagd.mjs
//   ss -tlnp | grep ':8092 '   # danach ueber den Port beenden, nie per pkill
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "http://127.0.0.1:8092";
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const konsole = [];

/** Eigener Kontext je Person: sonst teilen sie sich den localStorage und der
 *  Server haelt sie fuer dieselbe. */
async function geraet(name) {
  const ctx = await browser.newContext({
    locale: "de-DE", viewport: { width: 390, height: 844 }, reducedMotion: "reduce",
  });
  const s = await ctx.newPage();
  s.on("console", (m) => { if (m.type() === "error") konsole.push(`${name}: ${m.text()}`); });
  s.on("pageerror", (e) => konsole.push(`${name}: ${e}`));
  return s;
}

/** Den Draft durchklicken: immer die erste Karte, bis das Brett steht. */
async function draften(s) {
  for (let i = 0; i < 12; i++) {
    if (await s.locator(".brett").count()) return;
    const wahl = s.locator(".draftreihe .karte");
    if (!(await wahl.count())) { await warte(400); continue; }
    await wahl.first().click();
    await warte(350);
  }
}

const feldNr = async (s, wahl) =>
  Number(await s.locator(wahl).first().getAttribute("data-feld"));

try {
  const A = await geraet("Anna");
  const B = await geraet("Ben");

  await A.goto(`${BASIS}/`, { waitUntil: "domcontentloaded" });
  await A.fill("#name", "Anna");
  await A.click('[data-vis="private"]');
  await A.click("#createBtn");
  await A.waitForSelector("#screen-lobby.active", { timeout: 15000 });
  const code = (await A.textContent("#roomCode")).trim();
  pruefe(/^[A-Z0-9]{4}$/.test(code), `K01 Raum aufgemacht (${code})`);

  await B.goto(`${BASIS}/`, { waitUntil: "domcontentloaded" });
  await B.fill("#name", "Ben");
  await B.fill("#codeInput", code);
  await B.click("#joinBtn");
  await B.waitForSelector("#screen-lobby.active", { timeout: 15000 });
  await B.click("#readyBtn");
  await warte(400);
  await A.click("#startBtn");
  for (const s of [A, B]) await s.waitForSelector("#screen-game.active", { timeout: 15000 });

  // --- Der Draft -------------------------------------------------------------
  await A.waitForSelector(".draftreihe .karte", { timeout: 10000 });
  pruefe(await A.locator(".draftreihe .karte").count() === 3, "K02 drei Karten zur Wahl");
  const ersteKarte = A.locator(".draftreihe .karte").first();
  pruefe((await ersteKarte.locator(".k-name").textContent()).trim().length > 2,
    "K03 die Karte traegt einen Namen");
  pruefe((await ersteKarte.locator(".k-text").textContent()).trim().length > 10,
    "K04 die Karte sagt, was sie tut");
  pruefe(/^\d+$/.test((await ersteKarte.locator(".k-kosten").textContent()).trim()),
    "K05 die Karte traegt ihre Manakosten");

  await Promise.all([draften(A), draften(B)]);
  for (const s of [A, B]) await s.waitForSelector(".brett", { timeout: 10000 });
  pruefe(await A.locator(".hand .karte").count() === 5, "K06 fuenf Karten auf der Hand");
  pruefe(await A.locator(".fd").count() === 64, "K07 vierundsechzig Felder");
  pruefe(await A.locator(".fd .fig").count() === 32, "K08 zweiunddreissig Figuren");

  // --- Jeder sieht seine eigene Grundreihe unten -----------------------------
  const obenA = await feldNr(A, ".fd");
  const obenB = await feldNr(B, ".fd");
  pruefe(obenA !== obenB && (obenA === 56 || obenA === 7) && (obenB === 56 || obenB === 7),
    `K09 das Brett steht fuer beide richtig herum (${obenA} / ${obenB})`);

  // --- Sonderfelder ----------------------------------------------------------
  const sonder = await A.$$eval(".fd .sonder", (n) => n.length);
  pruefe(sonder === 6, `K10 sechs Sonderfelder liegen sichtbar auf dem Brett (${sonder})`);

  // --- Ein Zug mit dem Finger ------------------------------------------------
  const dran = (await A.locator(".fd.kannziehen").count()) ? A : B;
  const wartet = dran === A ? B : A;
  const manaVor = Number((await dran.textContent(".mana-zahl")).replace(/\D/g, ""));
  pruefe(manaVor === 3, `K11 drei Mana zum Anfang (${manaVor})`);
  pruefe(await wartet.locator(".fd.kannziehen").count() === 0,
    "K12 wer nicht dran ist, hat keine anwaehlbare Figur");

  await dran.locator(".fd.kannziehen").first().click();
  await warte(250);
  pruefe(await dran.locator(".fd.sel").count() === 1, "K13 die angetippte Figur ist markiert");
  const ziele = await dran.locator(".fd.ziel").count();
  pruefe(ziele > 0, `K14 die moeglichen Ziele sind eingefaerbt (${ziele})`);
  pruefe(/Mana/.test(await dran.textContent("#rundenHint")),
    "K15 der Hinweis nennt die Kosten des Zuges");

  await dran.locator(".fd.ziel").first().click();
  await warte(500);
  const manaNach = Number((await dran.textContent(".mana-zahl")).replace(/\D/g, ""));
  // Ein Bauer kostet ein Mana – es sei denn, er landet auf einem 💎 oder 🃏.
  // Dann steht danach mehr da als vorher, und im Verlauf steht warum.
  const schatz = await dran.locator(".verlauf .vl-feld").count();
  pruefe(manaNach < manaVor || schatz > 0,
    `K16 der Zug hat Mana gekostet (${manaVor} → ${manaNach}${schatz ? ", Sonderfeld" : ""})`);
  pruefe(await dran.locator(".verlauf .vl").count() > 0, "K17 der Zug steht im Verlauf");
  pruefe(await wartet.locator(".verlauf .vl").count() > 0, "K18 der Gegner sieht ihn auch");

  // --- Eine Karte ------------------------------------------------------------
  const spielbar = dran.locator(".hand .karte:not(.teuer)");
  if (await spielbar.count()) {
    const handVor = await dran.locator(".hand .karte").count();
    await spielbar.first().click();
    await warte(400);
    const zieleKarte = await dran.locator(".kartenziel").count();
    if (zieleKarte) {
      pruefe(true, `K19 die Karte fragt nach einem Ziel (${zieleKarte} moeglich)`);
      await dran.locator(".kartenziel").first().click();
      await warte(500);
    }
    const handNach = await dran.locator(".hand .karte").count();
    pruefe(handNach !== handVor || zieleKarte > 0,
      `K20 die Karte ist gespielt oder wartet auf ihr zweites Ziel (${handVor} → ${handNach})`);
  } else {
    pruefe(true, "K19/K20 keine bezahlbare Karte auf der Hand – uebersprungen");
  }

  // --- Zug beenden, ohne zu scrollen -----------------------------------------
  const quer = await dran.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  pruefe(quer <= 1, `K21 nichts laeuft seitlich ueber (${quer}px)`);

  const knopf = dran.locator("#aktionen .btn.primary");
  const kasten = await knopf.boundingBox();
  const hoehe = await dran.evaluate(() => window.innerHeight);
  pruefe(kasten && kasten.y + kasten.height <= hoehe + 1,
    `K22 „Zug beenden" steht ohne Scrollen im Bild (unten bei ${
      kasten ? Math.round(kasten.y + kasten.height) : "?"} von ${hoehe})`);

  await knopf.click();
  await warte(500);
  pruefe(await wartet.locator(".fd.kannziehen").count() > 0,
    "K23 nach dem Zugende ist der andere dran");

  // --- Hilfe und Sprachen ----------------------------------------------------
  await A.goto(`${BASIS}/`, { waitUntil: "domcontentloaded" });
  await A.click("#helpBtn");
  await warte(300);
  const hilfe = await A.locator("#helpList li").count();
  pruefe(hilfe >= 5, `K24 die Hilfe erklaert das Spiel (${hilfe} Punkte)`);
  pruefe(/König/.test(await A.textContent("#helpList")), "K25 sie sagt, dass der Koenig faellt");
  await A.click("#helpClose");

  await A.click('.sprachknopf[data-sprache="en"]').catch(() => {});
  await warte(400);
  const tag = await A.textContent(".tag");
  pruefe(/chess/i.test(tag), `K26 auf Englisch steht Englisch da („${tag.trim()}")`);
  await A.click("#helpBtn");
  await warte(200);
  pruefe(/king/i.test(await A.textContent("#helpList")), "K27 auch die Hilfe ist uebersetzt");

  pruefe(konsole.length === 0, `K28 die Konsole bleibt still (${konsole.join(" | ")})`);
} finally {
  await browser.close();
}

console.log(`\n  ${gruen} gruen, ${rot} rot`);
if (rot) {
  for (const b of befunde) console.error("  - " + b);
  process.exit(1);
}
