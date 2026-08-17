// Prueft an Revier das, was `probe.js` nicht kann: die Seite selbst.
//
// Die WebSocket-Probe fragt den Server ab und weiss nichts davon, ob ein
// Handy ueberhaupt ein Bild bekommt. Genau daran haengt hier aber alles: das
// Spiel ist eine einzige Leinwand, und die Steuerung ist ein Joystick, den man
// nicht sieht. Ob der Finger ankommt, sagt kein Serverprotokoll.
//
// Der Kniff fuer R03: vor dem Laden wird `WebSocket.prototype.send`
// mitgeschnitten. So laesst sich nachsehen, welchen Winkel die Seite nach
// einem Zug nach unten wirklich schickt - ohne die Seite dafuer zu aendern.
//
//   cd /root/werkzeug-screenshots && node pruefe-revier.mjs
//
// R01  Seite baut sich auf, Konsole still, nichts fehlt
// R02  Einstieg: Name, Knopf, Anzeige steht
// R03  Unsichtbarer Joystick: Ziehen nach unten schickt 90 Grad
// R04  Es faehrt: die Leinwand aendert sich, Flaeche waechst
// R05  390 px breit: nichts laeuft seitlich heraus
// R06  Bildrate: die Umrisse muessen sich fluessig zeichnen lassen

import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const fehler = [];
const pruefe = (bedingung, text) => {
  if (bedingung) console.log(`  ✓ ${text}`);
  else { console.log(`  ✗ ${text}`); fehler.push(text); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE',
});

// Mitschnitt aller ausgehenden Nachrichten – muss vor dem Laden stehen.
await ctx.addInitScript(() => {
  window.__gesendet = [];
  const echt = WebSocket.prototype.send;
  WebSocket.prototype.send = function (daten) {
    try { window.__gesendet.push(String(daten)); } catch { /* egal */ }
    return echt.call(this, daten);
  };
});

const page = await ctx.newPage();
const konsole = [];
const fehlgeschlagen = [];
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text()); });
page.on('pageerror', (e) => konsole.push(`Seitenfehler: ${e.message}`));
page.on('requestfailed', (r) => fehlgeschlagen.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) fehlgeschlagen.push(`${r.status()} ${r.url()}`); });

console.log(`Revier im Browser (${BASIS}/revier/)\n`);

// ── R01 ────────────────────────────────────────────────────────────────────
const antwort = await page.goto(`${BASIS}/revier/`, { waitUntil: 'networkidle' });
pruefe(antwort.status() === 200, `R01 Seite kommt mit ${antwort.status()}`);
pruefe(konsole.length === 0, `R01 Konsole still (${konsole.join(' | ') || 'nichts'})`);
pruefe(fehlgeschlagen.length === 0, `R01 alle Dateien da (${fehlgeschlagen.join(' | ') || 'nichts fehlt'})`);

// ── R02 ────────────────────────────────────────────────────────────────────
await page.fill('#name', 'Probe');
await page.click('#losBtn');
// Nicht auf Sichtbarkeit warten: #hud selbst ist ein Behaelter ohne eigene
// Groesse, seine Teile liegen fest positioniert darin.
await page.waitForFunction(
  () => !document.getElementById('hud').hasAttribute('hidden'),
  null,
  { timeout: 8000 },
);
await warte(1500);
const flaeche = await page.textContent('#eigenFlaeche');
pruefe(/%/.test(flaeche), `R02 eigene Flaeche steht da (${flaeche})`);
const beste = await page.$$eval('#bestenliste li', (l) => l.length);
pruefe(beste >= 1, `R02 Bestenliste hat ${beste} Zeilen`);
pruefe(await page.isHidden('#start'), 'R02 Einstiegskarte ist weg');

// ── R03 ────────────────────────────────────────────────────────────────────
await page.evaluate(() => { window.__gesendet.length = 0; });
const mitte = { x: 195, y: 500 };
await page.mouse.move(mitte.x, mitte.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(mitte.x, mitte.y + i * 12);
  await warte(40);
}
await warte(200);
await page.mouse.up();

const winkel = await page.evaluate(() =>
  window.__gesendet
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter((m) => m && m.t === 'dir')
    .map((m) => m.a));
pruefe(winkel.length > 0, `R03 Ziehen schickt eine Richtung (${winkel.length} mal)`);
pruefe(winkel.every((a) => Math.abs(a - 90) < 8), `R03 nach unten heisst 90 Grad (${winkel.join(', ')})`);

// Ein kurzer Tipp ohne Ziehen darf nichts schicken – sonst zuckt die Fahrt
// bei jeder Beruehrung.
await page.evaluate(() => { window.__gesendet.length = 0; });
await page.mouse.click(120, 300);
await warte(200);
const beiTipp = await page.evaluate(() =>
  window.__gesendet.filter((s) => s.includes('"dir"')).length);
pruefe(beiTipp === 0, `R03 blosses Antippen lenkt nicht (${beiTipp} Nachrichten)`);

// ── R04 ────────────────────────────────────────────────────────────────────
const bildProbe = () => page.evaluate(() => {
  const c = document.getElementById('feld');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let summe = 0, bunt = 0;
  for (let i = 0; i < d.length; i += 4 * 997) {
    summe += d[i] + d[i + 1] + d[i + 2];
    if (Math.abs(d[i] - d[i + 2]) > 20) bunt++;
  }
  return { summe, bunt };
});
const vorher = await bildProbe();
await warte(2500);
const nachher = await bildProbe();
pruefe(vorher.summe > 0 && nachher.summe !== vorher.summe, 'R04 die Leinwand bewegt sich');
pruefe(nachher.bunt > 0, `R04 es ist etwas Farbiges zu sehen (${nachher.bunt} Stichproben)`);
const prozent = Number((await page.textContent('#eigenFlaeche')).replace(/[^0-9]/g, ''));
pruefe(prozent > 0, `R04 eigene Flaeche groesser null (${prozent})`);

// ── R05 ────────────────────────────────────────────────────────────────────
const ueberlauf = await page.evaluate(() => ({
  breit: document.documentElement.scrollWidth,
  sicht: document.documentElement.clientWidth,
}));
pruefe(ueberlauf.breit <= ueberlauf.sicht + 1,
  `R05 nichts laeuft heraus (${ueberlauf.breit} von ${ueberlauf.sicht} px)`);

// ── R06 ────────────────────────────────────────────────────────────────────
// Seit die Reviere als geglaettete Umrisse gezeichnet werden statt als
// hochskaliertes Zellbild, haengt die Bildrate an der Form der Grenzen. Ein
// zerfranstes Revier hat mehr Punkte als ein glattes - deshalb wird sie hier
// gemessen und nicht gehofft.
const bilder = await page.evaluate(() => new Promise((ok) => {
  let n = 0;
  const start = performance.now();
  const zaehl = () => {
    n++;
    const jetzt = performance.now();
    if (jetzt - start < 2000) requestAnimationFrame(zaehl);
    else ok(Math.round(n / ((jetzt - start) / 1000)));
  };
  requestAnimationFrame(zaehl);
}));
pruefe(bilder >= 30, `R06 Bildrate ${bilder}/s (mindestens 30)`);

await browser.close();

if (fehler.length) {
  console.log(`\n${fehler.length} Fehler.`);
  process.exit(1);
}
console.log('\nAlles gruen.');
