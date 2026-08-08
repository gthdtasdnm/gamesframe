// Erzeugt die Vorschaubilder für die Spielekacheln auf /spiele/.
//
// Warum automatisch statt von Hand: die vier Spiele brauchen mindestens zwei
// Spieler, um etwas herzugeben. Ein Bild von Hand hiesse zwei Geraete, eine
// zweite Person und der richtige Moment - und beim naechsten Designwechsel
// nochmal. Hier faehrt ein Skript zwei Browsersitzungen gleichzeitig, macht
// einen echten Raum auf, tritt bei, startet die Runde und drueckt ab.
//
//   node aufnehmen.mjs                 alle vier
//   node aufnehmen.mjs cardchaos keep  nur diese
//
// Die Bilder landen in /var/www/html/spiele/bilder/.
//
// Voraussetzung: eine Emoji-Schrift auf dem Server. Ohne sie zeigen die
// Spielfiguren und Symbole leere Kaestchen - der Server hatte von Haus aus
// keine (/usr/local/share/fonts/emoji/NotoColorEmoji.ttf).

import { chromium } from 'playwright';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import sharp from 'sharp';

const BASIS = 'https://inf-zeus.de';
const ZIEL = '/var/www/html/spiele/bilder';
const BREITE = 1000;
const HOEHE = 680;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Eigener Browser-Kontext je Spieler – sonst teilen sie sich sessionStorage
 *  und der Server haelt sie fuer dieselbe Person. */
async function spieler(browser, name) {
  const ctx = await browser.newContext({
    viewport: { width: BREITE, height: HOEHE },
    deviceScaleFactor: 2,          // fuer scharfe Bilder auf feinen Displays
    locale: 'de-DE',
    reducedMotion: 'reduce',       // keine halb gelaufene Animation im Bild
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`    [${name}] Seitenfehler: ${e.message}`));
  return page;
}

async function knipsen(page, datei) {
  await page.screenshot({ path: `${ZIEL}/${datei}` });
  console.log(`    → ${datei}`);
}

const zahl = async (page, sel) => {
  const t = await page.textContent(sel).catch(() => '0');
  return Number(String(t).replace(/[^0-9]/g, '')) || 0;
};

// ---------------------------------------------------------------- Card Chaos

async function cardchaos(browser) {
  const host = await spieler(browser, 'host');
  const gast = await spieler(browser, 'gast');

  await host.goto(`${BASIS}/cardchaos/`, { waitUntil: 'networkidle' });
  await host.fill('#in-name', 'Ata');
  await host.click('#btn-create');
  await host.waitForSelector('#s-room.on', { timeout: 15000 });
  const code = (await host.textContent('#room-code')).trim();

  await gast.goto(`${BASIS}/cardchaos/`, { waitUntil: 'networkidle' });
  await gast.fill('#in-name', 'Mira');
  await gast.fill('#in-code', code);
  await gast.click('#btn-join');
  await gast.waitForSelector('#s-room.on', { timeout: 15000 });

  await warte(600);
  await knipsen(host, 'cardchaos-raum.png');

  await gast.click('#btn-ready');
  await warte(400);
  await host.click('#btn-start');
  await host.waitForSelector('#s-game.on', { timeout: 15000 });
  await warte(4200);   // Countdown

  // Echte Zuege suchen: eine Karte zaehlt nur, wenn sie genau +-1 zur Ablage
  // passt. Statt die Regel nachzubauen, wird geklickt und am Punktestand
  // geprueft, ob der Zug gezaehlt hat - das bleibt richtig, auch wenn sich
  // die Regel spaeter aendert.
  //
  // Nur wenige Treffer: raeumt das Skript das Brett leer, ist die Runde vorbei
  // und im Bild steht der Rundenabschluss statt des Spiels. Gewollt ist ein
  // angespieltes Brett mit Punkten und laufender Uhr.
  let treffer = 0;
  for (let runde = 0; runde < 10 && treffer < 4; runde++) {
    const vorher = await zahl(host, '#hud-score');
    let traf = false;
    const karten = await host.$$('#peaks .card:not(.taken):not(.back)');
    for (const k of karten) {
      try { await k.click({ timeout: 800 }); } catch { continue; }
      await warte(200);
      if (await zahl(host, '#hud-score') > vorher) { traf = true; treffer++; break; }
    }
    if (!traf) { await host.click('#deck').catch(() => {}); await warte(300); }
  }

  await warte(500);
  if (await host.locator('#done.on').isVisible().catch(() => false)) {
    throw new Error('Runde war schon vorbei – das Bild zeigt die Auswertung, nicht das Spiel');
  }
  await knipsen(host, 'cardchaos-spiel.png');
  await host.context().close();
  await gast.context().close();
}

// ---------------------------------------------------------------------- Keep

async function keep(browser) {
  const host = await spieler(browser, 'host');
  const gast = await spieler(browser, 'gast');

  // Achtung: bei Keep heisst der Warteraum "screen-lobby" (bei den anderen
  // dreien ist die Lobby die Startseite). "screen-wait" ist hier die Pause
  // zwischen zwei Runden, nicht der Raum.
  await host.goto(`${BASIS}/keep/`, { waitUntil: 'networkidle' });
  await host.fill('#nameInput', 'Ata');
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  await gast.goto(`${BASIS}/keep/`, { waitUntil: 'networkidle' });
  await gast.fill('#nameInput', 'Mira');
  await gast.fill('#codeInput', code);
  await gast.click('#joinBtn');
  await gast.waitForSelector('#screen-lobby.active', { timeout: 15000 });

  await warte(600);
  await knipsen(host, 'keep-raum.png');

  await gast.click('#readyBtn');
  await warte(400);
  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });

  // Die Walze dreht von selbst; danach zwei Draws mit Halten dazwischen.
  await warte(3500);
  const halten = await host.$$('#reels .reel');
  for (let i = 0; i < halten.length && i < 2; i++) {
    try { await halten[i].click({ timeout: 800 }); } catch { /* egal */ }
  }
  await warte(600);
  await host.click('#draw1').catch(() => {});
  await warte(2200);
  await knipsen(host, 'keep-spiel.png');
  await host.context().close();
  await gast.context().close();
}

// ------------------------------------------------------------------- Seconds

async function seconds(browser) {
  const host = await spieler(browser, 'host');
  const gast = await spieler(browser, 'gast');

  await host.goto(`${BASIS}/seconds/`, { waitUntil: 'networkidle' });
  await host.fill('#nameInput', 'Ata');
  await host.click('#createBtn');
  await host.waitForSelector('#view-room.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  await gast.goto(`${BASIS}/seconds/`, { waitUntil: 'networkidle' });
  await gast.fill('#nameInput', 'Mira');
  await gast.fill('#codeInput', code);
  await gast.click('#joinBtn');
  await gast.waitForSelector('#view-room.active', { timeout: 15000 });

  await warte(600);
  await knipsen(host, 'seconds-raum.png');

  await gast.click('#readyBtn');
  await warte(400);
  await host.click('#startBtn');
  await host.waitForSelector('#view-game.active', { timeout: 15000 });
  await warte(4200);   // Countdown abwarten, dann liegen beide Karten
  await knipsen(host, 'seconds-spiel.png');
  await host.context().close();
  await gast.context().close();
}

// -------------------------------------------------------------- Lucky Reflex

async function luckyreflex(browser) {
  const host = await spieler(browser, 'host');
  const gast = await spieler(browser, 'gast');

  await host.goto(`${BASIS}/luckyreflex/`, { waitUntil: 'networkidle' });
  await host.fill('#name', 'Ata');
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  await gast.goto(`${BASIS}/luckyreflex/`, { waitUntil: 'networkidle' });
  await gast.fill('#name', 'Mira');
  await gast.fill('#codeInput', code);
  await gast.click('#joinBtn');
  await gast.waitForSelector('#screen-lobby.active', { timeout: 15000 });

  await warte(600);
  await knipsen(host, 'luckyreflex-raum.png');

  await gast.click('#readyBtn');
  await warte(400);
  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });
  // Nicht auf gut Glueck warten: nach dem Rundenstart laeuft erst die Ansage
  // mit Countdown. Erst wenn die Buehne den Reiz zeigt, ist das Bild etwas
  // wert - also warten, bis die grosse Countdown-Ziffer verschwunden ist.
  await host.waitForFunction(() => {
    const t = document.getElementById('stageContent')?.textContent ?? '';
    return t.trim() !== '' && !/^[123]$/.test(t.trim());
  }, { timeout: 20000 }).catch(() => {});
  await warte(400);
  await knipsen(host, 'luckyreflex-spiel.png');
  await host.context().close();
  await gast.context().close();
}

const SPIELE = { keep, cardchaos, seconds, luckyreflex };

const gewaehlt = process.argv.slice(2);
const liste = gewaehlt.length ? gewaehlt : Object.keys(SPIELE);

await mkdir(ZIEL, { recursive: true });
const browser = await chromium.launch();
for (const name of liste) {
  if (!SPIELE[name]) { console.log(`  ${name}: unbekannt`); continue; }
  console.log(`  ${name}:`);
  try { await SPIELE[name](browser); }
  catch (e) { console.log(`    fehlgeschlagen: ${e.message}`); }
}
await browser.close();

// PNG ist fuer diese Bilder die falsche Wahl: die Emoji-Symbole sind
// fotoaehnlich, da wird die verlustfreie Kompression riesig. WebP drueckt das
// um rund vier Fuenftel, ohne dass man am Text etwas sieht. Die PNG fliegen
// danach raus - im Netz landet nur das WebP.
console.log('  umwandeln nach WebP:');
let vorher = 0, nachher = 0;
for (const datei of (await readdir(ZIEL)).filter((f) => f.endsWith('.png'))) {
  const quelle = `${ZIEL}/${datei}`;
  const ziel = quelle.replace(/\.png$/, '.webp');
  const alt = (await stat(quelle)).size;   // sharp.metadata() fuellt .size nicht
  const { size } = await sharp(quelle).webp({ quality: 82 }).toFile(ziel);
  await unlink(quelle);
  vorher += alt; nachher += size;
  console.log(`    ${datei.replace('.png', '.webp').padEnd(26)} ${(size / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`  gesamt: ${(vorher / 1024 / 1024).toFixed(1)} MB → ${(nachher / 1024 / 1024).toFixed(1)} MB`);
