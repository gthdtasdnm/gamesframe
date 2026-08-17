// Prueft /spiele/ nach dem Umbau auf Kategorien: sind alle Kacheln da, hat
// jede einen funktionierenden Anleitungsdialog, laedt jedes Vorschaubild, und
// ist jedes Spiel erreichbar?
//
// Der Dialog liest seinen Inhalt seit dem Umbau aus der Kachel selbst. Genau
// das prueft dieses Skript – ein leerer Dialog waere sonst niemandem
// aufgefallen, weil die Seite ohne ihn normal aussieht.
//
//   node pruefe-startseite.mjs

import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, locale: 'de-DE' });
const page = await ctx.newPage();
const fehler = [];
page.on('pageerror', (e) => fehler.push(e.message));

const fehlendeBilder = [];
page.on('response', (r) => {
  if (r.url().includes('/bilder/') && r.status() >= 400) fehlendeBilder.push(r.url());
});

await page.goto(`${BASIS}/spiele/`, { waitUntil: 'networkidle' });
console.log('ok  Seite geladen');

// --- Aufbau -----------------------------------------------------------------

const gruppen = await page.$$eval('.gruppe-titel', (hs) => hs.map((h) => h.textContent.trim()));
const kacheln = await page.locator('.game').count();
console.log(`ok  ${gruppen.length} Kategorien (${gruppen.join(' · ')}), ${kacheln} Kacheln`);
if (gruppen.length < 2) throw new Error('Der Umbau auf Kategorien ist nicht angekommen');
if (kacheln < 8) throw new Error(`Nur ${kacheln} Kacheln – da fehlt etwas`);

// Die Zahl im Untertitel muss zur Zahl der Kacheln passen. Eine fest
// verdrahtete Erwartung hier waere Pflegeaufwand bei jedem neuen Spiel; so
// prueft der Lauf stattdessen, dass die Seite sich selbst nicht widerspricht –
// und genau dieser Text wurde in der Vergangenheit vergessen.
const ZAHLWORT = {
  vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15,
  sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
  einundzwanzig: 21, zweiundzwanzig: 22, dreiundzwanzig: 23,
  vierundzwanzig: 24, fünfundzwanzig: 25, sechsundzwanzig: 26,
  siebenundzwanzig: 27, achtundzwanzig: 28, neunundzwanzig: 29, dreißig: 30,
};
const sub = await page.textContent('.sub');
// Umlaute gehoeren in die Klasse: `\w` kennt sie nicht, und aus
// „Fünfundzwanzig" wurde damit „nfundzwanzig" – der Lauf schlug beim
// fuenfundzwanzigsten Spiel fehl, obwohl die Seite richtig war.
const wort = (sub.match(/([\wÄÖÜäöüß]+) Browserspiele/) ?? [])[1]?.toLowerCase();
const genannt = ZAHLWORT[wort];
if (!genannt) throw new Error(`Unbekanntes Zahlwort im Untertitel: „${wort}"`);
if (genannt !== kacheln) {
  throw new Error(`Untertitel sagt ${genannt} Spiele, es sind aber ${kacheln} Kacheln`);
}
console.log(`ok  Untertitel („${wort}") stimmt mit ${kacheln} Kacheln überein`);

// Jede Kachel braucht ihre Anleitung – ohne <template> bliebe der Dialog leer.
const ohneAblauf = await page.$$eval('.game',
  (gs) => gs.filter((g) => !g.querySelector('template.ablauf'))
            .map((g) => g.dataset.spiel));
if (ohneAblauf.length) throw new Error('Kacheln ohne Anleitung: ' + ohneAblauf.join(', '));

// Jede Kategorie muss mindestens ein Spiel enthalten – eine leere Überschrift
// waere schlimmer als keine.
const proRaster = await page.$$eval('.raster', (rs) => rs.map((r) => r.querySelectorAll('.game').length));
if (proRaster.some((n) => n === 0)) throw new Error('Eine Kategorie ist leer: ' + proRaster);
console.log(`ok  Spiele je Kategorie: ${proRaster.join(', ')}`);

// --- Ueberschriftenebenen ---------------------------------------------------

const ebenen = await page.$$eval('h1, h2, h3', (hs) => hs
  .filter((h) => h.textContent.trim())
  .map((h) => Number(h.tagName[1])));
let vorige = 0;
for (const e of ebenen) {
  if (vorige && e > vorige + 1) throw new Error(`Überschrift springt von h${vorige} auf h${e}`);
  vorige = e;
}
console.log(`ok  Überschriften ohne Sprung (${ebenen.join('→')})`);

// --- Statuspunkte -----------------------------------------------------------

await warte(2500);
const punkte = await page.$$eval('[data-status]', (ds) => ds.map((d) => d.className));
const unten = punkte.filter((c) => c.includes('down'));
if (unten.length) throw new Error(`${unten.length} Spiele melden sich als nicht erreichbar`);
if (!punkte.every((c) => c.includes('up'))) {
  throw new Error('Nicht alle Statuspunkte sind grün: ' + punkte.join(' | '));
}
console.log(`ok  alle ${punkte.length} Statuspunkte grün`);

// --- Jeder Anleitungsdialog -------------------------------------------------

for (let i = 0; i < kacheln; i++) {
  const kachel = page.locator('.game').nth(i);
  const name = (await kachel.locator('h3').textContent()).trim();
  await kachel.locator('.info').click();
  await page.waitForSelector('#spielDialog[open]', { timeout: 3000 });

  const titel = (await page.textContent('#spielTitel')).trim();
  const kurz = (await page.textContent('#spielKurz')).trim();
  const schritte = await page.locator('#spielSchritte li').count();
  const bild = await page.getAttribute('#spielBild', 'src');
  const link = await page.getAttribute('#spielLink', 'href');

  if (titel !== name) throw new Error(`Dialog zeigt „${titel}" statt „${name}"`);
  if (!kurz) throw new Error(`${name}: keine Kurzbeschreibung im Dialog`);
  if (schritte < 4) throw new Error(`${name}: nur ${schritte} Schritte`);
  if (!bild || !bild.includes('.webp')) throw new Error(`${name}: kein Vorschaubild`);
  if (!link || link === '/') throw new Error(`${name}: Spielen-Link zeigt ins Leere`);

  // Das Bild muss auch wirklich geladen sein, nicht nur verlinkt. Darauf
  // warten, nicht einmal nachsehen: der Dialog setzt src erst beim Öffnen,
  // und beim ersten Aufruf ist das Bild noch unterwegs.
  await page.waitForFunction(() => {
    const img = document.getElementById('spielBild');
    return img.complete && img.naturalWidth > 0;
  }, { timeout: 10000 }).catch(() => {
    throw new Error(`${name}: das Vorschaubild lädt nicht`);
  });

  console.log(`ok  ${name.padEnd(17)} ${String(schritte).padStart(2)} Schritte, Bild ok, → ${link}`);

  await page.click('.dialog-zu');
  await page.waitForSelector('#spielDialog[open]', { state: 'detached', timeout: 3000 })
    .catch(() => page.waitForFunction(() => !document.getElementById('spielDialog').open));
}

if (fehlendeBilder.length) throw new Error('Bilder mit Fehlerstatus: ' + fehlendeBilder.join(', '));
if (fehler.length) throw new Error('Seitenfehler: ' + fehler.join(' | '));
console.log('\nALLES GRÜN');

await browser.close();
