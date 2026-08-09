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

// -------------------------------------------------- Ich hab noch nie

async function nochnie(browser) {
  // Drei statt zwei: das Bild lebt von der Aufloesungsliste, und die hat mit
  // nur einem Mitspieler genau eine Zeile.
  const host = await spieler(browser, 'host');
  const g1 = await spieler(browser, 'gast1');
  const g2 = await spieler(browser, 'gast2');

  await host.goto(`${BASIS}/nochnie/`, { waitUntil: 'networkidle' });
  await host.fill('#name', 'Ata');
  // Ohne Umstellen bleibt es beim harmlosen Stapel - auf der Startseite soll
  // keine 18+-Karte stehen.
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const [seite, name] of [[g1, 'Mira'], [g2, 'Nuri']]) {
    await seite.goto(`${BASIS}/nochnie/`, { waitUntil: 'networkidle' });
    await seite.fill('#name', name);
    await seite.fill('#codeInput', code);
    await seite.click('#joinBtn');
    await seite.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await seite.click('#readyBtn');
  }

  await warte(600);
  await knipsen(host, 'nochnie-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });
  await warte(600);

  // Wer dran ist, steht nur auf dem Bildschirm - beim Betroffenen als "Du".
  const namen = new Map([['Ata', host], ['Mira', g1], ['Nuri', g2]]);
  const dranName = (await host.textContent('#dranName')).trim();
  const dran = dranName === 'Du' ? host : namen.get(dranName);
  if (!dran) throw new Error(`unbekannt, wer dran ist: ${dranName}`);
  const waehler = [host, g1, g2].filter((s) => s !== dran);

  await dran.click('#aktionen .btn:not(.primary)');      // "Mir faellt nichts ein"
  await warte(500);
  await dran.click('#aktionen .btn.primary');            // "Gesagt - abstimmen"
  await warte(500);
  await waehler[0].click('#aktionen .btn.wahl.ja');
  await waehler[1].click('#aktionen .btn.wahl.nein');

  // Aufgeloest wird erst, wenn beide gedrueckt haben.
  await dran.waitForSelector('.erg-kopf', { timeout: 15000 });
  await warte(400);
  await knipsen(dran, 'nochnie-spiel.png');
  for (const s of [host, g1, g2]) await s.context().close();
}

// ------------------------------------------------------------------ Mäxchen

async function maexchen(browser) {
  // Drei statt zwei: die Punkteleiste unten ist die halbe Miete im Bild, und
  // mit nur einem Mitspieler stehen da zwei Chips.
  const host = await spieler(browser, 'host');
  const g1 = await spieler(browser, 'gast1');
  const g2 = await spieler(browser, 'gast2');

  await host.goto(`${BASIS}/maexchen/`, { waitUntil: 'networkidle' });
  await host.fill('#name', 'Ata');
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const [seite, name] of [[g1, 'Mira'], [g2, 'Nuri']]) {
    await seite.goto(`${BASIS}/maexchen/`, { waitUntil: 'networkidle' });
    await seite.fill('#name', name);
    await seite.fill('#codeInput', code);
    await seite.click('#joinBtn');
    await seite.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await seite.click('#readyBtn');
  }

  await warte(600);
  await knipsen(host, 'maexchen-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });
  await warte(600);

  // Wer am Zug ist, steht nur auf dem Bildschirm - beim Betroffenen als "Du".
  const namen = new Map([['Ata', host], ['Mira', g1], ['Nuri', g2]]);
  const werIstDran = async () => {
    const n = (await host.textContent('#dranName')).trim();
    return n === 'Du' ? host : namen.get(n);
  };

  // Erste Person: schuetteln und moeglichst niedrig ansagen - dann bleibt der
  // zweiten noch fast die ganze Tastatur, und die ist das eigentliche Motiv.
  const erste = await werIstDran();
  await erste.click('#aktionen .btn.primary');
  await erste.waitForSelector('#ansageGitter .ansage', { timeout: 15000 });
  await erste.click('#ansageGitter .ansage:first-child');

  // Zweite Person: glauben, schuetteln - und genau da abdruecken. Im Bild
  // stehen dann beide Wuerfel offen, die liegende Ansage oben und das Gitter
  // mit den gruen markierten, gedeckten Werten.
  //
  // Nur zaehlt genau dieser Wurf: bei einem Maexchen ist *jede* Ansage gedeckt
  // und damit alles gruen, bei einem ganz niedrigen Wurf nichts. Beides
  // widerlegt die Bildunterschrift ("Gruen ist gedeckt"), statt sie zu zeigen.
  // Also so lange weiterreichen, bis ein gemischter Wurf faellt.
  let seite = null;
  for (let versuch = 0; versuch < 8; versuch++) {
    await warte(700);
    seite = await werIstDran();
    if (!seite) throw new Error('unbekannt, wer am Zug ist');
    await seite.click('#aktionen .btn.wahl.glaub');
    await warte(400);
    await seite.click('#aktionen .btn.primary');
    await seite.waitForSelector('#ansageGitter .ansage', { timeout: 15000 });
    await warte(300);

    const gesamt = await seite.locator('#ansageGitter .ansage').count();
    const gruen = await seite.locator('#ansageGitter .ansage.gedeckt').count();
    if (gruen > 0 && gruen < gesamt) break;

    // Danebengegriffen - Zug weiterreichen und noch einmal.
    console.log(`    Wurf unbrauchbar (${gruen}/${gesamt} gedeckt), nächster Versuch`);
    await seite.click('#aktionen .btn.ghost.sm');   // "Aussetzen"
    seite = null;
  }
  if (!seite) throw new Error('kein brauchbar gemischter Wurf in acht Versuchen');

  await warte(500);
  await knipsen(seite, 'maexchen-spiel.png');

  for (const s of [host, g1, g2]) await s.context().close();
}

// ------------------------------------------------------- Wer am ehesten

async function amehesten(browser) {
  // Vier statt drei: das Bild lebt von den Balken, und die brauchen genug
  // Stimmen, damit ueberhaupt ein Unterschied zu sehen ist.
  const host = await spieler(browser, 'host');
  const g1 = await spieler(browser, 'gast1');
  const g2 = await spieler(browser, 'gast2');
  const g3 = await spieler(browser, 'gast3');

  await host.goto(`${BASIS}/amehesten/`, { waitUntil: 'networkidle' });
  await host.fill('#name', 'Ata');
  // Ohne Umstellen bleibt es bei "Gemischt" - auf der Startseite soll keine
  // Frage aus dem frechen Stapel stehen.
  await host.click('[data-modus="harmlos"]');
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const [seite, name] of [[g1, 'Mira'], [g2, 'Nuri'], [g3, 'Jo']]) {
    await seite.goto(`${BASIS}/amehesten/`, { waitUntil: 'networkidle' });
    await seite.fill('#name', name);
    await seite.fill('#codeInput', code);
    await seite.click('#joinBtn');
    await seite.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await seite.click('#readyBtn');
  }

  await warte(600);
  await knipsen(host, 'amehesten-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });
  await warte(600);

  // Absichtlich ungleich verteilen: drei Stimmen auf einen, eine auf einen
  // anderen. Ein Gleichstand ergaebe vier gleich lange Balken - technisch
  // richtig, als Bild aber nichtssagend.
  const waehle = async (seite, nr) => {
    await seite.click(`#wahlGitter .wahl:nth-child(${nr})`);
  };
  await waehle(host, 2);
  await waehle(g1, 2);
  await waehle(g2, 2);
  await waehle(g3, 1);

  // Aufgeloest wird erst, wenn alle vier durch sind - genau darauf warten.
  await host.waitForSelector('.erg-kopf', { timeout: 15000 });
  await warte(600);
  await knipsen(host, 'amehesten-spiel.png');

  for (const s of [host, g1, g2, g3]) await s.context().close();
}

// ----------------------------------------------------------------- Imposter

async function imposter(browser) {
  // Fuenf Sitzungen: unter vier startet das Spiel gar nicht, und die
  // Hinweisreihe im Bild soll nach mehr aussehen als nach drei Namen.
  const namen = ['Ata', 'Mira', 'Nuri', 'Jo', 'Sam'];
  const seiten = [];
  for (const name of namen) {
    const p = await spieler(browser, name);
    await p.goto(`${BASIS}/imposter/`, { waitUntil: 'networkidle' });
    await p.fill('#name', name);
    seiten.push(p);
  }
  const [host, ...gaeste] = seiten;

  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const g of gaeste) {
    await g.fill('#codeInput', code);
    await g.click('#joinBtn');
    await g.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await g.click('#readyBtn');
  }

  await warte(600);
  await knipsen(host, 'imposter-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });
  await warte(600);

  // Alle bestaetigen ihre Karte, dann laeuft die Hinweisrunde an.
  for (const s of seiten) await s.click('#aktionen .btn.primary');
  await host.waitForSelector('#reihenListe:not([hidden])', { timeout: 15000 });
  await warte(400);

  // Fuers Bild die Seite eines *Nicht*-Imposters nehmen: sie zeigt ein echtes
  // Wort statt der Luper-Karte, und das erklaert das Spiel besser. Wer der
  // Imposter ist, steht nur auf dessen eigenem Bildschirm.
  let bild = null;
  for (const s of seiten) {
    const kopf = await s.textContent('#karteKopf');
    if (kopf && kopf.trim() === 'Dein Wort') { bild = s; break; }
  }
  if (!bild) throw new Error('keine Seite ohne Imposter-Karte gefunden');

  // Die Wortliste aufklappen: sie ist der Kniff des Spiels und im
  // zusammengeklappten Zustand nicht zu sehen.
  await bild.click('#liste summary');
  await warte(500);
  await knipsen(bild, 'imposter-spiel.png');

  for (const s of seiten) await s.context().close();
}

// --------------------------------------------------------------------- Cubes

async function cubes(browser) {
  // Vier Sitzungen: das Bild lebt davon, dass mehrere Farben gleichzeitig im
  // Raster liegen. Zu zweit sieht man nicht, worum es geht.
  const namen = ['Ata', 'Mira', 'Nuri', 'Jo'];
  const seiten = [];
  for (const name of namen) {
    const p = await spieler(browser, name);
    await p.goto(`${BASIS}/cubes/`, { waitUntil: 'networkidle' });
    await p.fill('#name', name);
    seiten.push(p);
  }
  const [host, ...gaeste] = seiten;

  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const g of gaeste) {
    await g.fill('#codeInput', code);
    await g.click('#joinBtn');
    await g.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await g.click('#readyBtn');
  }
  await warte(600);
  await knipsen(host, 'cubes-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });

  // Eine Weile wirklich mitspielen. Ohne das steht in der Punkteleiste
  // viermal die Null, und das Bild behauptet, hier passiere nichts.
  const spielen = async (ms) => {
    const ende = Date.now() + ms;
    while (Date.now() < ende) {
      for (const s of seiten) {
        // Das Quadrat kann zwischen Finden und Klicken ablaufen - dann eben
        // nicht. Ein Fehlschlag darf die Aufnahme nicht abbrechen.
        await s.locator('.zelle.mein').first().click({ timeout: 400 })
          .catch(() => {});
      }
      await warte(120);
    }
  };

  /** Host-Knopf im Fussbereich, ueber seine Beschriftung gefunden. */
  const hostKnopf = async (text) => {
    const b = host.locator('#aktionen button', { hasText: text }).first();
    await b.waitFor({ timeout: 20000 });
    await b.click();
  };

  await spielen(4000);

  // Auf Runde 3 vorspulen. Sie ist die einzige mit Zahlen in den Quadraten und
  // damit die einzige, der man auf einem Standbild ansieht, worum es geht:
  // Plus antippen, Minus liegen lassen.
  for (let runde = 1; runde <= 2; runde++) {
    await hostKnopf('Runde beenden');
    await hostKnopf('Weiter');
    await host.waitForSelector('#raster:not([hidden])', { timeout: 15000 });
    if (runde === 1) await spielen(2500);
  }

  // Warten, bis das Feld die ganze Regel zeigt: ein eigenes Plusquadrat (das
  // man antippen soll), ein eigenes Minusquadrat (das man liegen lassen soll)
  // und fremde daneben. Ohne die erste Bedingung erwischt die Aufnahme leicht
  // einen Moment, in dem dem Host nur ein Minusfeld gehoert - dann behauptet
  // das Bild, die eigene Farbe sei die, die man meidet.
  await host.waitForFunction(
    () => document.querySelectorAll('.zelle.an').length >= 4 &&
      document.querySelectorAll('.zelle.mein:not(.minus)').length >= 1 &&
      document.querySelectorAll('.zelle.mein.minus').length >= 1,
    null,
    { timeout: 25000 },
  );
  await warte(200);
  await knipsen(host, 'cubes-spiel.png');

  for (const s of seiten) await s.context().close();
}

// ------------------------------------------------------------ Flaschendrehen

async function flasche(browser) {
  // Fuenf Sitzungen: der Kreis lebt davon, dass Namen darauf verteilt sind.
  const namen = ['Ata', 'Mira', 'Nuri', 'Jo', 'Sam'];
  const seiten = [];
  for (const name of namen) {
    const p = await spieler(browser, name);
    await p.goto(`${BASIS}/flasche/`, { waitUntil: 'networkidle' });
    await p.fill('#name', name);
    seiten.push(p);
  }
  const [host, ...gaeste] = seiten;

  // Harmlos bleibt eingestellt – auf der Startseite soll keine freche Karte
  // stehen.
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const g of gaeste) {
    await g.fill('#codeInput', code);
    await g.click('#joinBtn');
    await g.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await g.click('#readyBtn');
  }

  await warte(600);
  await knipsen(host, 'flasche-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });
  await warte(600);

  // Wer dreht, steht auf jedem Bildschirm – der Dreher selbst hat den grossen
  // Knopf.
  const dreher = [];
  for (const s of seiten) {
    const txt = await s.textContent('#phasenText');
    if (txt && txt.trim() === 'Du drehst') dreher.push(s);
  }
  if (!dreher.length) throw new Error('niemand hat den Drehknopf');
  await dreher[0].click('#aktionen .btn.primary');

  // Die Drehung abwarten – danach steht die Flasche auf einer Person und die
  // Wahl zwischen Wahrheit und Pflicht liegt an. Genau das ist das Motiv:
  // Kreis, Flasche, Ziel.
  await host.waitForFunction(() => {
    const t = document.getElementById('phasenText')?.textContent ?? '';
    return /zeigt auf/.test(t);
  }, { timeout: 20000 });
  await warte(700);

  // Die getroffene Person waehlt Wahrheit, damit im Bild eine echte Karte
  // steht und nicht nur zwei Knoepfe.
  for (const s of seiten) {
    const b = s.locator('#aktionen .btn.wahl.wahrheit');
    if (await b.count()) { await b.click(); break; }
  }
  await host.waitForSelector('#karte:not([hidden])', { timeout: 15000 });
  await warte(600);
  await knipsen(host, 'flasche-spiel.png');

  for (const s of seiten) await s.context().close();
}

const SPIELE = {
  keep, cardchaos, seconds, luckyreflex, nochnie, maexchen, amehesten, imposter,
  flasche, cubes,
};

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
