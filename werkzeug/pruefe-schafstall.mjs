// Prueft „Schafstall" im echten Browser – und zwar das, was die rechnende
// probe.js **nicht** sehen kann: ob eine Runde am Geraet wirklich zu spielen
// ist.
//
// `weide.js` weist nach, dass jede Weide zu raeumen ist. Ob ein Tier beim
// Antippen auch losl aeuft, ob es beim Schieben auf dem richtigen Feld
// stehenbleibt, ob Zurueck und „Von vorn" die Lage wirklich zuruecksetzen, ob
// der Wolf frisst und ob das alles ein Neuladen uebersteht, entscheidet sich
// erst im Browser.
//
// Dieselbe `weide.js` rechnet hier mit: die Probe baut die Weide der Runde
// selbst nach (Name und Nummer ergeben sie) und weiss dadurch vorher, welches
// Tier hinauslaeuft, welches sich nur schiebt und welches dem Wolf zu nahe
// kommt. Das ist zugleich die Gegenprobe, dass im DOM steht, was das Spiel
// meint.
//
//   node pruefe-schafstall.mjs

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const {
  ARTEN, baueWeide, istBeute, nimmWeg, saatAus, stufeFuer, wuerfel, zug,
} = await import(pathToFileURL("/var/www/html/schafstall/weide.js").href);

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const WER = "Probe";
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Die Weide, die das Spiel dieser Person in dieser Runde austeilt. */
const weideVon = (level) =>
  baueWeide(stufeFuer(level), wuerfel(saatAus(`${WER}#${level}`)));

/** So steht das Tier im DOM – die Beschriftung ist der einzige gemeinsame Nenner. */
const beschriftung = (t) =>
  `${ARTEN[t.art].name} auf Feld ${t.x + 1}, ${t.y + 1}, schaut ${
    ["nach oben", "nach rechts", "nach unten", "nach links"][t.r]
  }`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE" });
const page = await ctx.newPage();
const fehler = [];
page.on("pageerror", (e) => fehler.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });

const tippe = async (tier) => {
  await page.locator(`[aria-label="${beschriftung(tier)}"]`).first().click();
  await warte(320);
};
const zahlAus = async (wahl) =>
  Number((await page.textContent(wahl)).replace(/[^0-9]/g, ""));

await page.goto(`${BASIS}/schafstall/`, { waitUntil: "domcontentloaded" });

// --- Wer spielt: ein Name, und die Punkte gehoeren ihm -----------------------

await page.fill("#namensfeld", WER);
await page.click("#namenOk");
await page.waitForSelector("#leute", { state: "hidden", timeout: 8000 });
if (!(await page.textContent("#stand")).includes(WER)) {
  throw new Error("Der Name steht nach dem Anlegen nicht im Kopf");
}

// Die Weide auf dem Schirm muss die sein, die weide.js aus Name und Nummer
// baut - sonst stimmt keine der folgenden Vorhersagen.
const runde1 = weideVon(1);
for (const t of runde1.tiere) {
  if (!await page.locator(`[aria-label="${beschriftung(t)}"]`).count()) {
    throw new Error(`Auf dem Schirm fehlt: ${beschriftung(t)}`);
  }
}
console.log(`ok  Name angelegt, und die Weide ist die vorausgerechnete (${runde1.tiere.length} Tiere)`);

// --- Schieben: ein Tier bleibt vor dem Hindernis stehen ----------------------

{
  let feld = runde1, geschoben = null;
  for (const t of feld.tiere) {
    const z = zug(feld, t);
    if (z.art === "weiter") { geschoben = { t, z }; break; }
  }
  if (!geschoben) throw new Error("Auf dieser Weide laesst sich nichts schieben");

  await tippe(geschoben.t);
  const r = [[0, -1], [1, 0], [0, 1], [-1, 0]][geschoben.t.r];
  const ziel = {
    ...geschoben.t,
    x: geschoben.t.x + r[0] * geschoben.z.schritte,
    y: geschoben.t.y + r[1] * geschoben.z.schritte,
  };
  await page.waitForSelector(`[aria-label="${beschriftung(ziel)}"]`, { timeout: 4000 })
    .catch(() => { throw new Error(`Nach dem Schieben fehlt: ${beschriftung(ziel)}`); });
  if (await zahlAus("#zuegeschild") !== 1) throw new Error("Der Zug wurde nicht gezaehlt");
  console.log(`ok  Schieben: ${geschoben.z.schritte} Felder weit, dann steht es vor dem Hindernis`);

  // Zurueck stellt genau das wieder her.
  await page.click("#zurueckBtn");
  await warte(250);
  if (!await page.locator(`[aria-label="${beschriftung(geschoben.t)}"]`).count()) {
    throw new Error("Zurueck hat das Tier nicht an seinen Platz zurueckgestellt");
  }
  if (await zahlAus("#zuegeschild") !== 0) throw new Error("Zurueck zaehlt den Zug nicht ab");
  if (!await page.locator("#zurueckBtn").isDisabled()) {
    throw new Error("Ohne Zuege muss Zurueck grau sein");
  }
  console.log("ok  Zurueck nimmt den Zug wirklich zurueck");
}

// --- Die Runde ganz durchspielen ---------------------------------------------

{
  let feld = runde1;
  let zuege = 0;
  while (feld.tiere.length) {
    const naechstes = feld.tiere.find((t) => zug(feld, t).art === "raus");
    if (!naechstes) throw new Error("Die Weide laesst sich nicht mehr raeumen");
    await tippe(naechstes);
    feld = nimmWeg(feld, naechstes.id);
    zuege++;
  }
  await page.waitForSelector(".fertigbox", { timeout: 8000 });
  // Das letzte Tier laeuft noch, waehrend der Kasten schon steht.
  await warte(1200);

  const uebrig = await page.locator(".gitter .tier").count();
  if (uebrig !== 0) throw new Error(`Nach der Runde stehen noch ${uebrig} Tiere da`);
  const stall = (await page.textContent(".stallzahl")).trim();
  if (stall !== `${zuege}/${zuege}`) throw new Error(`Der Stall zaehlt ${stall}`);
  const sterne = await page.locator(".stern:not(.leer)").count();
  if (sterne !== 3) throw new Error(`${sterne} Sterne statt drei – ein Zug je Tier muss drei geben`);
  const gewinn = (await page.textContent(".punktegewinn")).trim();
  if (!/^\+\d+ Punkte$/.test(gewinn)) throw new Error(`Punktemeldung: ${gewinn}`);
  console.log(`ok  Runde 1 geraeumt: ${zuege} Tiere, ${zuege} Zuege, ${gewinn}, drei Sterne`);
}

// --- Die Punkte bleiben, die Runde zaehlt weiter -----------------------------

const punkte = await zahlAus("#stand");
if (punkte <= 0) throw new Error("Nach einer gewonnenen Runde stehen null Punkte im Kopf");
await page.click(".fertigbox .btn.primary");
await page.waitForSelector(".fertigbox", { state: "detached", timeout: 8000 });
if ((await page.textContent("#rundenschild")).trim() !== "Runde 2") {
  throw new Error("Nach der ersten Runde geht es nicht in Runde 2 weiter");
}
console.log(`ok  weiter in Runde 2, ${punkte} Punkte stehen im Kopf`);

// --- Neu laden: derselbe Mensch, dieselbe Runde, dieselbe Lage ---------------

{
  const runde2 = weideVon(2);
  const erstes = runde2.tiere.find((t) => zug(runde2, t).art === "raus");
  await tippe(erstes);
  await warte(600);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".gitter .tier", { timeout: 8000 });

  if (!await page.locator("#leute").isHidden()) {
    throw new Error("Nach dem Neuladen fragt die Seite wieder, wer spielt");
  }
  if ((await page.textContent("#rundenschild")).trim() !== "Runde 2") {
    throw new Error("Nach dem Neuladen steht eine andere Runde da");
  }
  if (await zahlAus("#stand") !== punkte) throw new Error("Die Punkte haben das Neuladen nicht ueberlebt");
  if (await zahlAus("#zuegeschild") !== 1) throw new Error("Der Zug ist beim Neuladen verlorengegangen");
  for (const t of nimmWeg(runde2, erstes.id).tiere) {
    if (!await page.locator(`[aria-label="${beschriftung(t)}"]`).count()) {
      throw new Error(`Nach dem Neuladen fehlt: ${beschriftung(t)}`);
    }
  }
  console.log("ok  Neuladen: dieselbe Weide, derselbe Zug schon gemacht, dieselben Punkte");

  // „Von vorn" stellt die ganze Weide wieder hin.
  await page.click("#neuBtn");
  await warte(400);
  if (await zahlAus("#zuegeschild") !== 0) throw new Error("Von vorn setzt die Zuege nicht zurueck");
  if (!await page.locator(`[aria-label="${beschriftung(erstes)}"]`).count()) {
    throw new Error("Von vorn hat das erste Tier nicht zurueckgeholt");
  }
  console.log("ok  Von vorn stellt die Weide wieder so hin, wie sie anfing");
}

// --- Der Wolf ----------------------------------------------------------------

{
  // Eine Runde suchen, in der gleich zu Anfang ein Tier auf den Wolf zulaeuft.
  let level = 8, opfer = null, feld = null;
  for (; level <= 30 && !opfer; level++) {
    feld = weideVon(level);
    opfer = feld.tiere.find((t) => zug(feld, t).art === "gefressen");
  }
  if (!opfer) throw new Error("Keine Runde gefunden, in der ein Tier zum Wolf laufen kann");
  level--;

  await page.evaluate(([wer, lvl]) => {
    localStorage.setItem("schafstall-leute", JSON.stringify(
      [{ name: wer, punkte: 500, level: lvl, runden: lvl - 1, sterne: 3 * (lvl - 1) }]));
    localStorage.setItem("schafstall-wer", wer);
    localStorage.removeItem("schafstall-lauf");
  }, [WER, level]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".gitter .tier", { timeout: 8000 });

  const gerechnet = feld.tiere.filter((t) => !istBeute(t.art)).length;
  const woelfe = await page.locator(".tier.wolf").count();
  if (woelfe !== gerechnet) throw new Error(`${woelfe} Woelfe im DOM, ${gerechnet} gerechnet`);

  await tippe(opfer);
  await page.waitForSelector(".fertigbox", { timeout: 8000 });
  const titel = (await page.textContent(".fertigbox h2")).trim();
  if (titel !== "Der Wolf!") throw new Error(`Nach dem Wolf steht da: ${titel}`);
  if (await page.locator(".punktegewinn").count()) {
    throw new Error("Fuer ein gefressenes Tier darf es keine Punkte geben");
  }
  console.log(`ok  Runde ${level}: wer auf den Wolf zulaeuft, ist weg – und die Runde faengt neu an`);

  await page.click(".fertigbox .btn.primary");
  await page.waitForSelector(".fertigbox", { state: "detached", timeout: 8000 });
  const wieder = await page.locator(".gitter .tier").count();
  if (wieder !== feld.tiere.length) {
    throw new Error(`Nach dem Neuanfang stehen ${wieder} statt ${feld.tiere.length} Tiere da`);
  }
  if (await zahlAus("#zuegeschild") !== 0) throw new Error("Der Neuanfang zaehlt die Zuege nicht zurueck");
  console.log("ok  danach steht die volle Weide wieder da, bei null Zuegen");
}

if (fehler.length) throw new Error("Seitenfehler: " + fehler.join(" | "));
console.log("\nALLES GRÜN");

await browser.close();
