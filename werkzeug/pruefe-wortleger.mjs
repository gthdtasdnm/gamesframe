// Prueft „Wortleger" im echten Browser – und zwar das, was `probe.js` nicht
// sehen kann: ob man die Steine auf einem Handy ueberhaupt trifft, ob in den
// Bonusfeldern das Richtige steht, und ob ein Tipp aufs Regal und dann aufs
// Brett wirklich einen Stein hinlegt.
//
// Anlass: 13 Spalten nebeneinander sind die Belastungsprobe dieses Spiels. Auf
// 390 Pixel Breite bleiben je Feld rund 26 – wird der Buchstabe dabei kleiner
// als 9 Pixel oder das Feld schmaler als 24, ist das Spiel auf dem Geraet, fuer
// das es gedacht ist, nicht mehr spielbar. Das sieht kein Servertest.
//
//   node pruefe-wortleger.mjs
//   BASIS=http://127.0.0.1:8171 node pruefe-wortleger.mjs

import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const GROESSE = 13;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const fehler = [];
const seiten = [];

// Absichtlich Handygroesse, nicht Rechnergroesse.
for (const name of ['Ata', 'Mira']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'de-DE',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fehler.push(`${name}: ${e.message}`));
  await page.goto(`${BASIS}/wortleger/`, { waitUntil: 'networkidle' });
  await page.fill('#name', name);
  seiten.push(page);
}
const [host, gast] = seiten;
console.log('ok  zwei Sitzungen auf 390x844 geladen');

await host.click('#createBtn');
await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
const code = (await host.textContent('#roomCode')).trim();
await gast.fill('#codeInput', code);
await gast.click('#joinBtn');
await gast.waitForSelector('#screen-lobby.active', { timeout: 15000 });
await gast.click('#readyBtn');
await warte(400);
await host.click('#startBtn');
await host.waitForSelector('#screen-game.active', { timeout: 15000 });
console.log(`ok  Partie ${code} laeuft`);

// -- Das Raster ------------------------------------------------------------

const felder = await host.$$('#brett > div');
if (felder.length !== GROESSE * GROESSE) {
  fehler.push(`Das Brett hat ${felder.length} Felder statt ${GROESSE * GROESSE}`);
} else {
  console.log(`ok  ${felder.length} Felder`);
}

// Zwei verschiedene Schriftgroessen im Raster, und sie brauchen verschiedene
// Untergrenzen: der Buchstabe auf einem Stein ist die Hauptsache, die Zahl im
// Bonusfeld nur ein Hinweis.
const mass = await host.evaluate(() => {
  const f = document.querySelector('#brett > div');
  const r = f.getBoundingClientRect();
  const bonus = document.querySelector('#brett > div.bonus');
  const stern = document.querySelector('#brett > div.stern');
  const brett = document.querySelector('#brett').getBoundingClientRect();
  return {
    breite: +r.width.toFixed(1),
    hoehe: +r.height.toFixed(1),
    bonusSchrift: parseFloat(getComputedStyle(bonus).fontSize),
    sternSchrift: parseFloat(getComputedStyle(stern).fontSize),
    brettBreite: +brett.width.toFixed(1),
    ueberRand: brett.right > window.innerWidth + 0.5 || brett.left < -0.5,
  };
});
console.log(`    Feld ${mass.breite}x${mass.hoehe} px, Bonuszahl ${mass.bonusSchrift.toFixed(1)} px, ` +
  `Stern ${mass.sternSchrift.toFixed(1)} px, Brett ${mass.brettBreite} px breit`);
if (mass.breite < 24) fehler.push(`Ein Feld ist nur ${mass.breite} px breit – das trifft niemand`);
if (mass.bonusSchrift < 9) fehler.push(`Die Bonuszahlen sind nur ${mass.bonusSchrift} px gross`);
if (Math.abs(mass.breite - mass.hoehe) > 1) fehler.push('Die Felder sind nicht quadratisch');
if (mass.ueberRand) fehler.push('Das Brett steht ueber den Bildschirmrand hinaus');
else console.log('ok  das Brett passt in die Breite, Felder sind quadratisch und gross genug');

// -- Die Bonusfelder -------------------------------------------------------
//
// Das Muster kommt vom Server. Hier wird geprueft, dass der Client es auch so
// zeichnet: Farbe und Beschriftung muessen zusammenpassen, sonst rechnet
// jemand mit einem dreifachen Wort, wo ein doppelter Buchstabe liegt.

const erwartet = { dl: '2', tl: '3', dw: '2W', tw: '3W' };
const boni = await host.$$eval('#brett > div', (els) =>
  els.map((e) => ({ klassen: [...e.classList], text: e.textContent.trim() })));

let geprueft = 0;
for (const [i, f] of boni.entries()) {
  for (const [klasse, text] of Object.entries(erwartet)) {
    if (!f.klassen.includes(klasse)) continue;
    geprueft++;
    if (f.text !== text) {
      fehler.push(`Feld ${Math.floor(i / GROESSE)},${i % GROESSE} ist .${klasse}, zeigt aber „${f.text}“`);
    }
  }
}
const sterne = boni.filter((f) => f.klassen.includes('stern'));
if (sterne.length !== 1) fehler.push(`${sterne.length} Sterne im Raster`);
else if (sterne[0].text !== '★') fehler.push(`Der Stern zeigt „${sterne[0].text}“`);
if (geprueft !== 48) fehler.push(`${geprueft} Bonusfelder gezeichnet, erwartet 48`);
console.log(`ok  ${geprueft} Bonusfelder + 1 Stern, Farbe und Beschriftung passen zusammen`);

// -- Legen und zuruecknehmen ------------------------------------------------

const dranSeite = (await host.locator('#dran.ich').count()) ? host : gast;
const rname = dranSeite === host ? 'Ata' : 'Mira';

const regalKnoepfe = await dranSeite.$$('#regal button');
if (regalKnoepfe.length !== 7) fehler.push(`${regalKnoepfe.length} Steine im Regal statt 7`);

const steinMass = await dranSeite.evaluate(() => {
  const r = document.querySelector('#regal button').getBoundingClientRect();
  return { breite: +r.width.toFixed(1), hoehe: +r.height.toFixed(1) };
});
console.log(`    Regalstein ${steinMass.breite}x${steinMass.hoehe} px`);
// Apple und Google nennen beide 44 px als kleinste sichere Trefferflaeche; bei
// sieben Steinen nebeneinander auf 390 px sind 34 das Aeusserste.
if (steinMass.breite < 34) fehler.push(`Regalsteine sind nur ${steinMass.breite} px breit`);

// Erst ein Feld antippen, ohne Stein gewaehlt zu haben: das muss folgenlos
// bleiben und einen Hinweis geben.
const mitte = 6 * GROESSE + 6 + 1;
await dranSeite.click(`#brett > div:nth-child(${mitte})`);
await warte(300);
if (!(await dranSeite.locator('#toast.show').count())) {
  fehler.push('Ein Feldtipp ohne gewaehlten Stein gibt keinen Hinweis');
} else {
  console.log('ok  Feld antippen ohne Stein: Hinweis statt stiller Nichtreaktion');
}
if (await dranSeite.locator('#brett > div.neu').count()) {
  fehler.push('Es landete ein Stein auf dem Brett, ohne dass einer gewaehlt war');
}

// Jetzt richtig: Stein waehlen, Mitte antippen, wieder zuruecknehmen.
await regalKnoepfe[0].click();
if (!(await dranSeite.locator('#regal button.gewaehlt').count())) {
  fehler.push('Ein angetippter Regalstein wird nicht als gewaehlt angezeigt');
}
await dranSeite.click(`#brett > div:nth-child(${mitte})`);
await warte(250);
if ((await dranSeite.locator('#brett > div.neu').count()) !== 1) {
  fehler.push('Der Stein landete nicht auf dem Brett');
} else {
  console.log('ok  Regalstein antippen, Feld antippen – der Stein liegt');
  const steinSchrift = await dranSeite.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('#brett > div.stein')).fontSize));
  console.log(`    Buchstabe auf dem Brett ${steinSchrift.toFixed(1)} px`);
  if (steinSchrift < 13) fehler.push(`Buchstaben auf dem Brett sind nur ${steinSchrift} px gross`);
}
if ((await dranSeite.$$('#regal button')).length !== 6) {
  fehler.push('Das Regal hat nach dem Ablegen nicht einen Stein weniger');
}

await dranSeite.click(`#brett > div:nth-child(${mitte})`);
await warte(250);
if (await dranSeite.locator('#brett > div.neu').count()) {
  fehler.push('Ein gelegter Stein liess sich nicht zuruecknehmen');
} else {
  console.log('ok  nochmal antippen holt ihn zurueck ins Regal');
}

// Der andere darf nicht mitlegen.
const zuschauer = dranSeite === host ? gast : host;
if (!(await zuschauer.locator('#regal button:disabled').count())) {
  fehler.push('Wer nicht am Zug ist, kann sein Regal trotzdem bedienen');
} else {
  console.log(`ok  ${rname} ist am Zug, das Regal des anderen ist gesperrt`);
}

// -- Hilfe -----------------------------------------------------------------

await host.click('#endeBtn').catch(() => {});
await warte(300);

if (fehler.length) {
  console.log('\nFEHLER:');
  for (const f of fehler) console.log('  ' + f);
  await browser.close();
  process.exit(1);
}
console.log('\nALLES GRÜN');
await browser.close();
