// Card Chaos, Bugreport 19 – der zweite Teil der Meldung: „die Jackpot-
// Meldungen versperren die Sicht auf die Karten." Die Banner („COMBO ×5",
// „GOLDKARTE!", „MEGA WIN!") lagen fix in der Bildschirmmitte, also genau auf
// der Pyramide – und zwar in dem Moment, in dem man am schnellsten klickt.
//
// Seither hängen sie oben am Rand des Spieltischs (`#banners` in `.table`).
// Diese Probe **misst** das: sie setzt ein echtes Banner in die laufende Runde
// und vergleicht seinen Kasten mit den Karten. Keine offene Karte – das sind
// die, auf die man tippt – darf davon berührt werden.
//
// Gemessen wird in zwei Fenstern: Handy hochkant und flach im Querformat, wo
// über der Pyramide am wenigsten Luft bleibt.
//
//   cd /root/werkzeug-screenshots && node pruefe-cardchaos-ablage.mjs
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

/** Allein an einen Tisch setzen und die erste Runde starten (minPlayers = 1). */
async function inDieRunde(viewport, name) {
  const kontext = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const seite = await kontext.newPage();
  seite.konsole = [];
  seite.on("console", (m) => { if (m.type() === "error") seite.konsole.push(m.text()); });
  seite.on("pageerror", (e) => seite.konsole.push(String(e)));
  await seite.goto(`${BASIS}/cardchaos/`, { waitUntil: "domcontentloaded" });
  await seite.waitForSelector("#s-name.on");
  await seite.fill("#in-name", name);
  await seite.click("#btn-create");
  await seite.waitForSelector("#s-room.on", { timeout: 15000 });
  await seite.selectOption("#in-rounds", "3");
  await schlaf(400);
  await seite.click("#btn-start");
  await seite.waitForSelector("#s-game.on", { timeout: 15000 });
  await schlaf(4200);   // Countdown
  seite.kontext = kontext;
  return seite;
}

/**
 * Ein echtes Banner in den Tisch setzen und ausmessen. Es kommt in denselben
 * Behälter und mit denselben Klassen wie im Spiel, damit wirklich das CSS
 * gemessen wird und nicht eine Nachbildung. Die Animation wird angehalten,
 * sonst hinge das Ergebnis am Zeitpunkt des Messens.
 */
async function messen(seite, text) {
  return await seite.evaluate((t) => {
    const b = document.createElement("div");
    b.className = "banner";
    b.id = "__probe-banner";
    b.innerHTML = `<b>${t}</b>`;
    document.getElementById("banners").appendChild(b);
    const el = b.querySelector("b");
    el.style.animation = "none";          // Endzustand ist sonst durchsichtig
    const kasten = (n) => { const r = n.getBoundingClientRect(); return { o: r.top, u: r.bottom, l: r.left, r: r.right }; };
    const banner = kasten(el);
    const peaks = kasten(document.getElementById("peaks"));
    const offen = [...document.querySelectorAll("#peaks .slot.open")].map(kasten);
    const alle = [...document.querySelectorAll("#peaks .slot")].map(kasten);
    b.remove();
    return { banner, peaks, offen, alle, hoehe: innerHeight };
  }, text);
}

const schneidet = (a, b) => a.u > b.o && a.o < b.u && a.r > b.l && a.l < b.r;

async function pruefeFenster(viewport, label) {
  const seite = await inDieRunde(viewport, "Mess");
  try {
    const m = await messen(seite, "GOLDKARTE! ×10");
    pruefe(m.offen.length > 0, `${label}: ${m.offen.length} offene Karten auf dem Tisch`);

    const getroffen = m.offen.filter((k) => schneidet(m.banner, k)).length;
    pruefe(getroffen === 0,
      `${label}: keine offene Karte verdeckt (${getroffen} von ${m.offen.length})`);

    const verdeckt = m.alle.filter((k) => schneidet(m.banner, k)).length;
    pruefe(verdeckt <= 3,
      `${label}: höchstens die drei Turmspitzen angeschnitten (${verdeckt} von ${m.alle.length})`);

    pruefe(m.banner.o < m.hoehe / 2,
      `${label}: Meldung liegt in der oberen Fensterhälfte (Oberkante ${Math.round(m.banner.o)} von ${m.hoehe})`);

    const luft = Math.round(m.peaks.o - m.banner.u);
    console.log(`       ${label}: Abstand Meldung → Pyramide ${luft} px`);
    pruefe(seite.konsole.length === 0, `${label}: Konsole still (${seite.konsole.join(" | ").slice(0, 160)})`);
  } finally {
    await seite.kontext.close();
  }
}

try {
  await pruefeFenster({ width: 390, height: 844 }, "Handy hochkant");
  await pruefeFenster({ width: 844, height: 420 }, "Handy quer");
  await pruefeFenster({ width: 1280, height: 800 }, "Rechner");
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
