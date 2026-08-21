// Prueft „Schafstall" im echten Browser – und zwar das, was die rechnende
// probe.js **nicht** sehen kann: ob eine Runde am Geraet wirklich zu Ende
// gespielt werden kann.
//
// `weide.js` weist nach, dass jede Weide zu raeumen ist. Ob ein Schaf beim
// Antippen auch verschwindet, ob der Stall mitzaehlt, ob die Runde danach
// weiterzaehlt und ob der Spielstand ein Neuladen uebersteht, entscheidet
// sich erst im Browser.
//
// Gespielt wird ueber den Tipp-Knopf: er markiert ein Schaf, das gerade
// herauskommt (`.schaf.tipp`), und das wird angetippt. So laeuft eine ganze
// Runde ohne einen einzigen Fehlgriff durch – und genau das ist die
// Behauptung, die gepruft werden soll.
//
//   node pruefe-schafstall.mjs

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE" });
const page = await ctx.newPage();
const fehler = [];
page.on("pageerror", (e) => fehler.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });

await page.goto(`${BASIS}/schafstall/`, { waitUntil: "domcontentloaded" });

// --- Wer spielt: ein Name, und die Punkte gehoeren ihm -----------------------

await page.fill("#namensfeld", "Probe");
await page.click("#namenOk");
await page.waitForSelector("#leute", { state: "hidden", timeout: 8000 });
if (!(await page.textContent("#stand")).includes("Probe")) {
  throw new Error("Der Name steht nach dem Anlegen nicht im Kopf");
}
console.log("ok  Name angelegt, Frage weg, Weide da");

/** Eine ganze Runde ueber den Tipp-Knopf durchspielen. */
async function rundeSpielen(hoechstens = 60) {
  const anfang = await page.locator(".gitter .schaf").count();
  if (anfang < 4) throw new Error(`Nur ${anfang} Schafe auf der Weide`);
  for (let i = 0; i < hoechstens; i++) {
    if (await page.locator(".fertigbox").count()) return anfang;
    await page.click("#tippBtn");
    const gezeigt = page.locator(".schaf.tipp").first();
    await gezeigt.waitFor({ timeout: 4000 });
    await gezeigt.click();
    await warte(260);   // Bahn hinaus, dann Flug in den Stall
  }
  throw new Error("Die Runde war nach 60 Tipps immer noch nicht leer");
}

const wieviele = await rundeSpielen();
await page.waitForSelector(".fertigbox", { timeout: 8000 });
// Das letzte Schaf laeuft noch, waehrend der Kasten schon steht - erst wenn es
// im Stall angekommen ist, darf gezaehlt werden.
await warte(1200);

const uebrig = await page.locator(".gitter .schaf").count();
if (uebrig !== 0) throw new Error(`Nach der Runde stehen noch ${uebrig} Schafe da`);
const stall = (await page.textContent(".stallzahl")).trim();
if (stall !== `${wieviele}/${wieviele}`) throw new Error(`Der Stall zaehlt ${stall}`);
const gewinn = (await page.textContent(".punktegewinn")).trim();
if (!/^\+\d+ Punkte$/.test(gewinn)) throw new Error(`Punktemeldung: ${gewinn}`);
const sterne = await page.locator(".stern:not(.leer)").count();
if (sterne !== 3) throw new Error(`${sterne} Sterne statt drei – ohne Fehlgriff muessen es drei sein`);
console.log(`ok  Runde 1 geraeumt: ${wieviele} Schafe, ${gewinn}, ${sterne} Sterne`);

// --- Die Punkte bleiben, die Runde zaehlt weiter -----------------------------

const punkte = Number((await page.textContent("#stand")).match(/(\d+)\s*Punkte/)[1]);
if (punkte <= 0) throw new Error("Nach einer gewonnenen Runde stehen null Punkte im Kopf");

await page.click(".fertigbox .btn.primary");
await page.waitForSelector(".fertigbox", { state: "detached", timeout: 8000 });
const runde2 = (await page.textContent("#rundenschild")).trim();
if (runde2 !== "Runde 2") throw new Error(`Nach der ersten Runde steht da: ${runde2}`);
console.log(`ok  weiter in Runde 2, ${punkte} Punkte stehen im Kopf`);

// --- Neu laden: derselbe Mensch, dieselbe Runde, dieselbe Weide --------------

const vorher = await page.locator(".gitter .schaf").evaluateAll(
  (ks) => ks.map((k) => k.getAttribute("aria-label")).sort().join("|"),
);
// Ein Schaf befreien, damit auch das Weitermachen mitten in der Runde zaehlt.
await page.click("#tippBtn");
await page.locator(".schaf.tipp").first().click();
await warte(700);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".gitter .schaf", { timeout: 8000 });

if ((await page.locator("#leute").isHidden()) === false) {
  throw new Error("Nach dem Neuladen fragt die Seite wieder, wer spielt");
}
const nachher = (await page.textContent("#rundenschild")).trim();
if (nachher !== "Runde 2") throw new Error(`Nach dem Neuladen: ${nachher}`);
const punkte2 = Number((await page.textContent("#stand")).match(/(\d+)\s*Punkte/)[1]);
if (punkte2 !== punkte) throw new Error(`Punkte nach dem Neuladen: ${punkte2} statt ${punkte}`);

const jetzt = await page.locator(".gitter .schaf").evaluateAll(
  (ks) => ks.map((k) => k.getAttribute("aria-label")).sort().join("|"),
);
if (jetzt === vorher) throw new Error("Das befreite Schaf steht nach dem Neuladen wieder da");
if (!vorher.split("|").every((x) => x === "" || vorher.includes(x))) {
  throw new Error("Die Weide sieht nach dem Neuladen anders aus");
}
const fehlen = vorher.split("|").filter((x) => !jetzt.split("|").includes(x));
if (fehlen.length !== 1) {
  throw new Error(`Nach dem Neuladen fehlen ${fehlen.length} Schafe statt einem`);
}
console.log("ok  Neuladen: dieselbe Weide, dasselbe Schaf draussen, dieselben Punkte");

// --- Ein Fehlgriff kostet ein Herz ------------------------------------------
//
// Welches Schaf eingeklemmt steht, rechnet die Probe selbst aus den
// Beschriftungen aus - und das ist zugleich die Gegenprobe, dass im DOM
// wirklich steht, was das Spiel meint. Bis Runde 4 liegen weder Felsen noch
// Tore auf der Weide, also blockiert hier nur ein anderes Schaf.

const richtungen = { oben: [0, -1], rechts: [1, 0], unten: [0, 1], links: [-1, 0] };

const eingeklemmt = await page.locator(".gitter .schaf").evaluateAll((ks, r) => {
  const schafe = ks.map((k, i) => {
    const m = k.getAttribute("aria-label").match(/Feld (\d+), (\d+), schaut nach (\w+)/);
    return { i, x: +m[1], y: +m[2], d: r[m[3]] };
  });
  const belegt = new Set(schafe.map((s) => `${s.x},${s.y}`));
  const blockiert = schafe.find((s) => {
    for (let x = s.x + s.d[0], y = s.y + s.d[1]; x >= 1 && y >= 1 && x <= 40 && y <= 40; x += s.d[0], y += s.d[1]) {
      if (belegt.has(`${x},${y}`)) return true;
    }
    return false;
  });
  return blockiert ? blockiert.i : -1;
}, richtungen);

if (eingeklemmt < 0) throw new Error("Auf dieser Weide steht kein einziges Schaf eingeklemmt");
const vorherHerzen = await page.locator(".herz:not(.leer)").count();
await page.locator(".gitter .schaf").nth(eingeklemmt).click();
await warte(300);
const jetztHerzen = await page.locator(".herz:not(.leer)").count();
if (jetztHerzen !== vorherHerzen - 1) {
  throw new Error(`Fehlgriff: ${jetztHerzen} Herzen statt ${vorherHerzen - 1}`);
}
if (await page.locator(".gitter .schaf").nth(eingeklemmt).count() !== 1) {
  throw new Error("Das eingeklemmte Schaf ist trotzdem gelaufen");
}
console.log("ok  ein eingeklemmtes Schaf antippen kostet ein Herz und bewegt nichts");

if (fehler.length) throw new Error("Seitenfehler: " + fehler.join(" | "));
console.log("\nALLES GRÜN");

await browser.close();
