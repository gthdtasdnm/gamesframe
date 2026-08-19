// Imposter, Umbau vom 19.08.2026: die Karte liegt zugedeckt.
//
// Vorher stand das Wort offen auf dem Schirm. Wer es gelesen hatte, drehte das
// Handy um oder schaltete es aus – und ein ausgeschaltetes Handy ist eine
// gekappte Verbindung. Genau daran ist die Runde reihum auseinandergefallen.
//
// Diese Probe misst deshalb nicht, was auf dem Bildschirm *steht*, sondern was
// man tatsaechlich *sieht*: sie fragt den Browser mit `elementFromPoint`, wer
// an der Stelle des Wortes obenauf liegt. Dazu die Ansage („wer faengt an, wie
// herum"), die bei allen gleich sein muss.
//
// Laeuft gegen eine **eigene Fassung**, nicht gegen live: sie oeffnet Raeume.
//
//   cd /var/www/html/imposter
//   PORT=8086 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
//   cd /root/werkzeug-screenshots && node pruefe-imposter.mjs
//   ss -tlnp | grep ':8086 '   # danach ueber den Port beenden, nie per pkill
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "http://127.0.0.1:8086";
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${text}`); }
  else { rot++; befunde.push(text); console.error(`  FEHL ${text}`); }
};
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const konsole = [];

async function spieler(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") konsole.push(`${name}: ${m.text()}`); });
  p.on("pageerror", (e) => konsole.push(`${name}: ${e}`));
  await p.goto(`${BASIS}/`, { waitUntil: "domcontentloaded" });
  await p.fill("#name", name);
  return p;
}

/** Liegt das Wort frei, oder deckt der Deckel es zu? Fragt den Browser. */
const wortSichtbar = (p) =>
  p.evaluate(() => {
    const w = document.getElementById("karteWort");
    const r = w.getBoundingClientRect();
    if (r.width === 0) return false;
    const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!oben && !document.getElementById("deckel").contains(oben);
  });

/** Den Deckel mit dem Zeiger hochschieben – und liegen lassen. */
async function schieben(p, hoehe = 170) {
  const kasten = await p.locator("#stapel").boundingBox();
  const x = kasten.x + kasten.width / 2;
  const y = kasten.y + kasten.height * 0.7;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(x, y - (hoehe * i) / 6);
  await schlaf(80);
}

try {
  const [A, B, C] = [await spieler("Ata"), await spieler("Mira"), await spieler("Nuri")];

  await A.click('[data-vis="private"]');
  await A.click("#createBtn");
  await A.waitForSelector("#screen-lobby.active", { timeout: 15000 });
  const code = (await A.textContent("#roomCode")).trim();
  for (const g of [B, C]) {
    await g.fill("#codeInput", code);
    await g.click("#joinBtn");
    await g.waitForSelector("#screen-lobby.active", { timeout: 15000 });
  }
  pruefe(await A.locator("[data-hilfswort]").count() === 0,
    "im Warteraum steht kein Hilfswort-Schalter mehr");

  await A.click("#startBtn");
  for (const p of [A, B, C]) await p.waitForSelector("#screen-game.active", { timeout: 15000 });
  await schlaf(400);

  // --- Die Ansage ---------------------------------------------------------
  const ansagen = [];
  for (const p of [A, B, C]) ansagen.push((await p.textContent("#ansage")).replace(/\s+/g, " ").trim());
  pruefe(ansagen.every((t) => /fäng(t|st) an/.test(t) && /nach (links|rechts)/.test(t)),
    `die Ansage sagt, wer anfängt und wie herum: „${ansagen[0]}"`);
  const ohneDu = ansagen.map((t) => t.replace(/^Du fängst an/, "")).map((t) => t.match(/nach (links|rechts)/)[0]);
  pruefe(new Set(ohneDu).size === 1, "alle drei lesen dieselbe Richtung");
  pruefe(ansagen.filter((t) => t.startsWith("Du fängst an")).length === 1,
    `genau einer liest „Du fängst an"`);

  // --- Der Deckel ---------------------------------------------------------
  const zu = [];
  for (const p of [A, B, C]) zu.push(await wortSichtbar(p));
  pruefe(zu.every((s) => s === false), "frisch ausgeteilt liegt bei allen dreien der Deckel drauf");

  await schieben(A);
  pruefe(await wortSichtbar(A) === true, "hochschieben legt das Wort frei");
  const gelesen = (await A.textContent("#karteWort")).trim();
  pruefe(gelesen.length > 0, `darunter steht etwas: „${gelesen}"`);
  pruefe(await wortSichtbar(B) === false, "beim Nachbarn bleibt es zu");

  await A.mouse.up();
  await schlaf(450);
  pruefe(await wortSichtbar(A) === false, "loslassen deckt wieder zu");
  pruefe(/schon angesehen/.test(await A.textContent("#deckelKlein")),
    "der Deckel merkt sich, dass man schon nachgesehen hat");

  // Ein blosser Tipp darf nichts aufdecken.
  const kasten = await A.locator("#stapel").boundingBox();
  await A.mouse.click(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
  await schlaf(200);
  pruefe(await wortSichtbar(A) === false, "ein Antippen deckt nichts auf");

  // --- Rollen: genau einer ist der Imposter -------------------------------
  const woerter = [];
  for (const p of [A, B, C]) {
    if (p !== A) { await schieben(p); await p.mouse.up(); }
    woerter.push([(await p.textContent("#karteKopf")).trim(), (await p.textContent("#karteWort")).trim()]);
  }
  const imposter = woerter.filter(([, w]) => w === "IMPOSTER");
  pruefe(imposter.length === 1, `genau einer sieht IMPOSTER (${imposter.length})`);
  const rest = new Set(woerter.filter(([, w]) => w !== "IMPOSTER").map(([, w]) => w));
  pruefe(rest.size === 1, `die anderen sehen dasselbe Wort (${[...rest].join(", ")})`);

  // --- Aufgeloest liegt alles offen ---------------------------------------
  await A.click("#aktionen .btn.primary");
  await B.waitForSelector("#aufloesung:not([hidden])", { timeout: 15000 });
  await schlaf(300);
  pruefe(await wortSichtbar(B) === true, "nach dem Auflösen liegt die Karte offen – kein Deckel mehr");
  pruefe(await B.locator("#deckel").isHidden(), "der Deckel ist weg, nicht nur hochgeschoben");

  // --- Und die Seite bleibt heil ------------------------------------------
  const ueberlauf = await A.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  pruefe(!ueberlauf, "kein waagerechter Überlauf auf 390 px");
  pruefe(konsole.length === 0, `Konsole still (${konsole.join(" | ").slice(0, 200)})`);

  // Aufraeumen: seit die Plaetze zwanzig Minuten reserviert bleiben, stuende
  // der Raum sonst noch eine Dreiviertelstunde herum.
  for (const p of [A, B, C]) await p.click("[data-raus]").catch(() => {});
  await schlaf(200);
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
