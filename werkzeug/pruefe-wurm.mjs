// Prueft an Wurm das, was `probe.js` nicht kann: die Seite selbst.
//
// Die WebSocket-Probe fragt den Server ab und weiss nichts davon, ob ein
// Handy ueberhaupt ein Bild bekommt. Genau daran haengt hier aber alles: das
// Spiel ist eine einzige Leinwand, die Steuerung ist ein Joystick, den man
// nicht sieht, und der Turbo haengt an drei verschiedenen Eingaben, von denen
// keine im Serverprotokoll vorkommt.
//
// Der Kniff fuer W03 und W04: vor dem Laden wird `WebSocket.prototype.send`
// mitgeschnitten. So laesst sich nachsehen, was die Seite nach einem Zug oder
// einem Tastendruck wirklich schickt - ohne die Seite dafuer zu aendern.
//
//   cd /root/werkzeug-screenshots && node pruefe-wurm.mjs
//
// W01  Seite baut sich auf, Konsole still, nichts fehlt
// W02  Anmeldung: Name, Knopf, Anzeige steht
// W03  Unsichtbarer Joystick: Ziehen nach unten schickt 90 Grad
// W04  Turbo: Knopf, Leertaste und zweiter Finger schalten ihn an und aus
// W05  Es lebt: die Leinwand aendert sich, Energie waechst
// W06  390 px breit: nichts laeuft seitlich heraus
// W07  Bildrate: die Schlangen muessen sich fluessig zeichnen lassen

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

console.log(`Wurm im Browser (${BASIS}/wurm/)\n`);

const gesendet = (art) => page.evaluate((a) =>
  window.__gesendet
    .map((s) => { try { return JSON.parse(s); } catch { return null; } })
    .filter((m) => m && m.t === a), art);
const leeren = () => page.evaluate(() => { window.__gesendet.length = 0; });

// ── W01 ────────────────────────────────────────────────────────────────────
const antwort = await page.goto(`${BASIS}/wurm/`, { waitUntil: 'networkidle' });
pruefe(antwort.status() === 200, `W01 Seite kommt mit ${antwort.status()}`);
pruefe(konsole.length === 0, `W01 Konsole still (${konsole.join(' | ') || 'nichts'})`);
pruefe(fehlgeschlagen.length === 0, `W01 alle Dateien da (${fehlgeschlagen.join(' | ') || 'nichts fehlt'})`);

// ── W02 ────────────────────────────────────────────────────────────────────
// Anders als bei Revier steht hier eine Anmeldung am Anfang – auch beim
// zweiten Besuch. Dass die Karte da ist, gehoert deshalb zur Pruefung.
pruefe(await page.isVisible('#start'), 'W02 die Anmeldekarte steht da');
await page.fill('#name', 'Probe');
await page.click('#losBtn');
// Nicht auf Sichtbarkeit warten: #hud selbst ist ein Behaelter ohne eigene
// Groesse, seine Teile liegen fest positioniert darin.
await page.waitForFunction(
  () => !document.getElementById('hud').hasAttribute('hidden'),
  null,
  { timeout: 8000 },
);
await warte(1600);
const energie = await page.textContent('#eigenMasse');
pruefe(Number(energie) > 0, `W02 eigene Energie steht da (${energie})`);
const beste = await page.$$eval('#bestenliste li', (l) => l.length);
pruefe(beste >= 1, `W02 Bestenliste hat ${beste} Zeilen`);
pruefe(await page.isHidden('#start'), 'W02 Anmeldekarte ist weg');

// ── W03 ────────────────────────────────────────────────────────────────────
await leeren();
const mitte = { x: 195, y: 460 };
await page.mouse.move(mitte.x, mitte.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(mitte.x, mitte.y + i * 12);
  await warte(40);
}
await warte(200);
await page.mouse.up();

const winkel = (await gesendet('dir')).map((m) => m.a);
pruefe(winkel.length > 0, `W03 Ziehen schickt eine Richtung (${winkel.length} mal)`);
pruefe(winkel.every((a) => Math.abs(a - 90) < 8), `W03 nach unten heisst 90 Grad (${winkel.join(', ')})`);

// Ein kurzer Tipp ohne Ziehen darf nichts schicken – sonst zuckt die Fahrt
// bei jeder Beruehrung.
await leeren();
await page.mouse.click(120, 300);
await warte(200);
pruefe((await gesendet('dir')).length === 0, 'W03 blosses Antippen lenkt nicht');

// ── W04 ────────────────────────────────────────────────────────────────────
// Drei Wege zum Turbo, und alle drei muessen ihn auch wieder ausschalten.
// Der zweite Finger laesst sich mit Playwright nicht halten (die Maus ist ein
// Zeiger, `touchscreen.tap` ist ein Tipp) – dafuer werden die Ereignisse hier
// von Hand ausgeloest. Geprueft wird trotzdem das echte Verhalten: was die
// Seite daraufhin ueber die Leitung schickt.
const turboFolge = async (name, an, aus) => {
  await leeren();
  await an();
  await warte(180);
  const nachAn = (await gesendet('turbo')).map((m) => m.an);
  await aus();
  await warte(180);
  const alles = (await gesendet('turbo')).map((m) => m.an);
  pruefe(
    nachAn.at(-1) === true && alles.at(-1) === false,
    `W04 ${name} schaltet an und aus (${alles.join(', ') || 'nichts'})`,
  );
};

await turboFolge('Knopf',
  () => page.dispatchEvent('#turboBtn', 'pointerdown', { pointerId: 7, isPrimary: true }),
  () => page.dispatchEvent('#turboBtn', 'pointerup', { pointerId: 7, isPrimary: true }));

await turboFolge('Leertaste',
  () => page.keyboard.down(' '),
  () => page.keyboard.up(' '));

await turboFolge('zweiter Finger',
  () => page.evaluate(() => {
    const c = document.getElementById('feld');
    const mach = (art, id, x, y) => c.dispatchEvent(new PointerEvent(art, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1,
    }));
    // Der erste Finger ist der Joystick, erst der zweite gibt Gas.
    mach('pointerdown', 1, 120, 500);
    mach('pointerdown', 2, 300, 500);
  }),
  () => page.evaluate(() => {
    const c = document.getElementById('feld');
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
  }));

// ── W05 ────────────────────────────────────────────────────────────────────
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
const energieVorher = Number(await page.textContent('#eigenMasse'));
await warte(4000);
const nachher = await bildProbe();
pruefe(vorher.summe > 0 && nachher.summe !== vorher.summe, 'W05 die Leinwand bewegt sich');
pruefe(nachher.bunt > 0, `W05 es ist etwas Farbiges zu sehen (${nachher.bunt} Stichproben)`);
const energieNachher = Number(await page.textContent('#eigenMasse'));
pruefe(energieNachher > 0, `W05 Energie steht weiter (${energieVorher} → ${energieNachher})`);

// ── W06 ────────────────────────────────────────────────────────────────────
const ueberlauf = await page.evaluate(() => ({
  breit: document.documentElement.scrollWidth,
  sicht: document.documentElement.clientWidth,
}));
pruefe(ueberlauf.breit <= ueberlauf.sicht + 1,
  `W06 nichts laeuft heraus (${ueberlauf.breit} von ${ueberlauf.sicht} px)`);

// ── W07 ────────────────────────────────────────────────────────────────────
// Eine Schlange ist ein Linienzug aus bis zu 320 Punkten, und bei einem
// Dutzend sichtbarer Schlangen wird daraus Arbeit. Deshalb wird die Bildrate
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
pruefe(bilder >= 30, `W07 Bildrate ${bilder}/s (mindestens 30)`);

// ── W08 ────────────────────────────────────────────────────────────────────
// Noch einmal in die Konsole hoeren, jetzt nach allem Getippe. W01 sieht nur
// den Aufbau. Der erste Fehler, den dieses Skript gefunden hat, lag genau
// dazwischen: der Turboknopf warf beim Anfassen, der Turbo blieb aus, und die
// Seite sah dabei vollkommen gesund aus.
pruefe(konsole.length === 0, `W08 Konsole auch danach still (${konsole.join(' | ') || 'nichts'})`);

await browser.close();

if (fehler.length) {
  console.log(`\n${fehler.length} Fehler.`);
  process.exit(1);
}
console.log('\nAlles gruen.');
