// Card Chaos, Bugreport 13: „am Handy geht es manchmal nicht, Karten lassen
// sich nicht anklicken." Ursache war der Doppeltipp-Zoom: der Browser hält
// jeden Tipp zurück, bis feststeht, dass kein zweiter folgt – und beim
// schnellen Legen fiel damit jeder zweite aus. Seither hängt das Legen an
// `pointerdown` statt an `click`, und `touch-action: manipulation` schaltet
// die Geste ab.
//
// Diese Probe legt zwei Geräte an einen Tisch, startet eine Partie und tippt
// **mit dem Finger** (`tap`) auf freie Karten – schnell hintereinander. Sie
// prüft, dass jeder Tipp ankommt: entweder als Zug oder als Fehlgriff, aber
// nie als nichts.
//
//   cd /root/werkzeug-screenshots && node pruefe-cardchaos-tippen.mjs
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

/** Ein Handy mit Fingerbedienung – `hasTouch` schaltet `tap()` frei. */
async function handy(name) {
  const kontext = await browser.newContext({
    // Deutscher Browser: die Seiten sind dreisprachig und richten sich
    // beim ersten Besuch nach der Spracheinstellung.
    locale: "de-DE",
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  });
  const seite = await kontext.newPage();
  seite.konsole = [];
  seite.on("console", (m) => { if (m.type() === "error") seite.konsole.push(m.text()); });
  seite.on("pageerror", (e) => seite.konsole.push(String(e)));
  await seite.goto(`${BASIS}/cardchaos/`, { waitUntil: "domcontentloaded" });
  await seite.waitForSelector("#s-name.on");
  await seite.fill("#in-name", name);
  seite.kontext = kontext;
  return seite;
}

const a = await handy("Anna");
const b = await handy("Bert");
try {
  await a.click("#btn-create");
  await a.waitForSelector("#s-room.on", { timeout: 15000 });
  const code = (await a.locator("#room-code").textContent()).trim();
  pruefe(/^[A-Z0-9]{4}$/.test(code), `Tisch ${code} steht`);

  await b.fill("#in-code", code);
  await b.click("#btn-join");
  await b.waitForSelector("#s-room.on", { timeout: 15000 });
  await b.click("#btn-ready");
  await schlaf(500);

  await a.selectOption("#in-rounds", "3");
  await schlaf(400);
  await a.click("#btn-start");
  await a.waitForSelector("#s-game.on", { timeout: 15000 });
  await b.waitForSelector("#s-game.on", { timeout: 15000 });
  pruefe(true, "Runde läuft auf beiden Geräten");

  // Den Countdown abwarten – vorher nimmt das Spiel keine Züge an.
  await schlaf(4200);

  // Schnell hintereinander auf freie Karten tippen. Gezählt wird die
  // Rückmeldung über der Karte (`#fx .pop`): der Punktgewinn beim gültigen Zug,
  // der Abzug beim Fehlgriff. Am Punktestand allein lässt sich das **nicht**
  // ablesen – auf frischem Brett steht er auf null, und weiter runter geht es
  // nicht. Genau diese Falle hat diese Probe beim Schreiben selbst gestellt.
  await a.evaluate(() => {
    window.__pops = 0;
    new MutationObserver((ms) => { for (const m of ms) window.__pops += m.addedNodes.length; })
      .observe(document.getElementById("fx"), { childList: true });
  });

  const frei = a.locator("#peaks .slot.open");
  let getippt = 0;
  for (let i = 0; i < 8; i++) {
    const n = await frei.count();
    if (!n) break;
    await frei.nth(i % n).tap();
    getippt++;
    await schlaf(120);           // enger als jedes Doppeltipp-Fenster
  }
  const pops = await a.evaluate(() => window.__pops);
  pruefe(getippt > 0, `${getippt} Tipps abgesetzt`);
  pruefe(pops === getippt,
    `jeder Tipp hat genau eine Rückmeldung gegeben (${pops} zu ${getippt}) – ` +
    "keiner verschluckt, keiner doppelt gezählt");

  // Und der Nachziehstapel, der am selben Weg hängt.
  const vorZug = await a.locator("#deck-count").textContent();
  await a.locator("#deck").tap();
  await schlaf(300);
  const nachZug = await a.locator("#deck-count").textContent();
  pruefe(vorZug !== nachZug, `Nachziehen wirkt (${vorZug} → ${nachZug})`);

  pruefe(a.konsole.length === 0 && b.konsole.length === 0,
    `Konsole still (${[...a.konsole, ...b.konsole].join(" | ").slice(0, 200)})`);
} finally {
  await a.kontext.close();
  await b.kontext.close();
  await browser.close();
}

console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const f of befunde) console.error("  · " + f);
  process.exit(1);
}
console.log("ALLES GRÜN");
