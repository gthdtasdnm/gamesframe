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

// --- Bild statt Textwand ----------------------------------------------------
// Seit dem Umbau traegt jede Kachel einen Screenshot und einen Satz; der lange
// Absatz steht nur noch im Dialog. Faellt ein Bild aus, bleibt eine graue
// Flaeche stehen – und weil der erklaerende Text weg ist, sagt die Kachel dann
// gar nichts mehr. Deshalb wird hier jedes einzelne Bild geprueft, nicht nur
// das im Dialog.

// Die Bilder haengen an loading="lazy": ohne einmal durchzuscrollen laedt nur
// das obere Drittel, und der Rest saehe faelschlich fehlerfrei aus.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 700) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});

const ohneBild = await page.$$eval('.game',
  (gs) => gs.filter((g) => !g.querySelector('.schnappschuss')).map((g) => g.dataset.spiel));
if (ohneBild.length) throw new Error('Kacheln ohne Screenshot: ' + ohneBild.join(', '));

// Die Kachel nimmt die kleine Fassung (zusammen ~200 KB), der Dialog das grosse
// Bild. Rutscht hier das grosse hinein, laedt die Seite das Fuenffache.
const gross = await page.$$eval('.schnappschuss',
  (is) => is.filter((i) => !i.getAttribute('src').startsWith('bilder/klein/'))
            .map((i) => i.getAttribute('src')));
if (gross.length) throw new Error('Kacheln laden das grosse Bild: ' + gross.join(', '));

await page.waitForFunction(
  () => [...document.querySelectorAll('.schnappschuss')].every((i) => i.complete && i.naturalWidth > 0),
  { timeout: 20000 },
).catch(async () => {
  const kaputt = await page.$$eval('.schnappschuss',
    (is) => is.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute('src')));
  throw new Error('Kachelbilder laden nicht: ' + kaputt.join(', '));
});
console.log(`ok  ${await page.locator('.schnappschuss').count()} Kachelbilder aus bilder/klein/ geladen`);

// Der Einzeiler ist das Einzige, was an Text bleibt – er darf nirgends fehlen.
const ohneKurz = await page.$$eval('.game', (gs) => gs.filter((g) => {
  const k = g.querySelector('.kurz');
  return !k || !k.textContent.trim();
}).map((g) => g.dataset.spiel));
if (ohneKurz.length) throw new Error('Kacheln ohne Einzeiler: ' + ohneKurz.join(', '));

// Und der lange Absatz darf nicht doch wieder auf der Kachel auftauchen –
// genau das war der Grund fuer den Umbau. Erst zaehlen, dann messen: ohne die
// erste Zeile waere die zweite auch dann gruen, wenn es die Absaetze gar nicht
// mehr gaebe.
const langAnzahl = await page.locator('.game .lang').count();
if (langAnzahl !== kacheln) {
  throw new Error(`${langAnzahl} Langtexte bei ${kacheln} Kacheln – da fehlt einer`);
}
const langSichtbar = await page.$$eval('.game .lang',
  (ps) => ps.filter((p) => p.offsetParent !== null).length);
if (langSichtbar) throw new Error(`${langSichtbar} Langtexte stehen wieder auf der Kachel`);
console.log('ok  jede Kachel: ein Satz sichtbar, der lange Text nur im Dialog');

// Alle Kacheln einer Kategorie gleich breit. Die allein stehende letzte wurde
// hier frueher ueber beide Spalten gezogen – mit einem Screenshot darauf wird
// daraus ein gequetschter Streifen aus der Bildmitte. Geprueft wird die
// gemessene Breite, nicht die Klasse: nur so faellt auch auf, wenn die Regel
// ueber einen anderen Weg zurueckkommt.
const masse = await page.$$eval('.raster', (rs) => rs.map((r) => {
  const k = [...r.querySelectorAll('.game')];
  return {
    kacheln: k.length,
    breiten: [...new Set(k.map((g) => Math.round(g.getBoundingClientRect().width)))],
    bildhoehen: [...new Set(k.map((g) => Math.round(
      g.querySelector('.schnappschuss').getBoundingClientRect().height)))],
  };
}));
for (const m of masse) {
  if (m.breiten.length > 1) {
    throw new Error(`Kategorie mit ${m.kacheln} Kacheln: Breiten ${m.breiten.join('/')} px`);
  }
  if (m.bildhoehen.length > 1) {
    throw new Error(`Kategorie mit ${m.kacheln} Kacheln: Bildhöhen ${m.bildhoehen.join('/')} px`);
  }
}
console.log(`ok  alle Kacheln gleich breit (${masse.map((m) => m.breiten[0]).join('/')} px),`
  + ` keine wird allein in der Zeile gestreckt`);

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

// --- Suche ------------------------------------------------------------------
// Bugreport 12: bei fuenfundzwanzig Kacheln will man tippen statt scrollen.
// Geprueft wird, dass gefiltert wird, dass leere Kategorien mitsamt
// Ueberschrift verschwinden, und dass ein Treffer per Eingabetaste aufgeht.

const sichtbare = () => page.locator('.game:not([hidden])').count();

if (!await page.locator('#sucheBox.an').count()) {
  throw new Error('Das Suchfeld ist nicht eingeblendet – lief das Skript?');
}

await page.fill('#suche', 'wurfel');   // ohne Umlaut: muss „Würfel" finden
const mitWurfel = await sichtbare();
if (mitWurfel === 0) throw new Error('„wurfel" findet kein Spiel – die Umlautfalte greift nicht');
if (mitWurfel === kacheln) throw new Error('„wurfel" filtert gar nichts weg');

// Keine Kategorie darf ohne Kacheln dastehen.
const leereKoepfe = await page.$$eval('.raster', (rs) => rs.filter((r) => {
  const sichtbar = [...r.children].some((k) => !k.hidden);
  const kopf = r.previousElementSibling;
  return !sichtbar && (!r.hidden || (kopf?.classList.contains('gruppe') && !kopf.hidden));
}).length);
if (leereKoepfe) throw new Error(`${leereKoepfe} Kategorie(n) stehen leer über einer Lücke`);
console.log(`ok  Suche „wurfel": ${mitWurfel} von ${kacheln} Kacheln, keine leere Kategorie`);

await page.fill('#suche', 'gibtesnichtxy');
if (await sichtbare() !== 0) throw new Error('Unsinn als Suche lässt Kacheln stehen');
if (!(await page.textContent('#suchErgebnis')).trim()) {
  throw new Error('Ohne Treffer sagt die Seite nichts');
}
console.log('ok  ohne Treffer bleibt nichts stehen und die Seite sagt es');

await page.fill('#suche', '');
if (await sichtbare() !== kacheln) throw new Error('Nach dem Leeren fehlen Kacheln');
if (!await page.locator('.gruppe:not([hidden])').count()) {
  throw new Error('Nach dem Leeren fehlen die Kategorien');
}
console.log('ok  leeres Feld zeigt wieder alles');

// Ein einziger Treffer: die Eingabetaste öffnet das Spiel.
const ersterTitel = (await page.locator('.game h3').first().textContent()).trim();
const ersterPfad = await page.locator('.game .game-link').first().getAttribute('href');
await page.fill('#suche', ersterTitel);
if (await sichtbare() !== 1) throw new Error(`„${ersterTitel}" ist nicht eindeutig`);
await page.press('#suche', 'Enter');
await page.waitForURL((u) => u.pathname === ersterPfad, { timeout: 5000 });
console.log(`ok  Eingabetaste beim einzigen Treffer führt nach ${ersterPfad}`);

await page.goto(`${BASIS}/spiele/`, { waitUntil: 'networkidle' });

// --- Jeder Anleitungsdialog -------------------------------------------------

for (let i = 0; i < kacheln; i++) {
  const kachel = page.locator('.game').nth(i);
  const name = (await kachel.locator('h3').textContent()).trim();
  await kachel.locator('.info').click();
  await page.waitForSelector('#spielDialog[open]', { timeout: 3000 });

  const titel = (await page.textContent('#spielTitel')).trim();
  const kurz = (await page.textContent('#spielKurz')).trim();
  // Der Absatz, der bis zum Umbau auf der Kachel stand. Er ist jetzt nur noch
  // hier zu sehen – bleibt der Dialog leer, ist der Text ersatzlos verloren.
  const lang = (await page.textContent('#spielLang')).trim();
  const schritte = await page.locator('#spielSchritte li').count();
  const bild = await page.getAttribute('#spielBild', 'src');
  const link = await page.getAttribute('#spielLink', 'href');

  if (titel !== name) throw new Error(`Dialog zeigt „${titel}" statt „${name}"`);
  if (!kurz) throw new Error(`${name}: keine Kurzbeschreibung im Dialog`);
  if (lang.length < 40) throw new Error(`${name}: der lange Text fehlt im Dialog`);
  if (lang === kurz) throw new Error(`${name}: langer und kurzer Text sind derselbe`);
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
