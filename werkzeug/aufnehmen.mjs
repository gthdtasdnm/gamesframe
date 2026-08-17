// Erzeugt die Vorschaubilder für die Spielekacheln auf /spiele/.
//
// Warum automatisch statt von Hand: die meisten Spiele brauchen mindestens zwei
// Spieler, um etwas herzugeben. Ein Bild von Hand hiesse zwei Geraete, eine
// zweite Person und der richtige Moment - und beim naechsten Designwechsel
// nochmal. Hier faehrt ein Skript zwei Browsersitzungen gleichzeitig, macht
// einen echten Raum auf, tritt bei, startet die Runde und drueckt ab.
//
//   node aufnehmen.mjs                 alle
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
async function spieler(browser, name, hoehe = HOEHE) {
  const ctx = await browser.newContext({
    viewport: { width: BREITE, height: hoehe },
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

// ------------------------------------------------------------------ Wortleger

// Dieses Rezept braucht als einziges die Regeln des Spiels selbst: mit sieben
// zufaelligen Steinen laesst sich nicht vorher aufschreiben, welches Wort
// gelegt wird. Statt die Zugregeln hier nachzubauen - und damit eine zweite,
// stillschweigend veraltende Fassung zu pflegen - laedt das Rezept `zug.js`
// und `woerter.txt` aus dem Spielordner. Faellt das Spiel weg, faellt nur
// dieses Rezept aus; alle anderen laufen weiter.
const WORTLEGER_DIR = '/var/www/html/wortleger';
const WL_GROESSE = 13;
const WL_MITTE = 6;

async function wortlegerRegeln() {
  const { werteZug } = await import(`${WORTLEGER_DIR}/zug.js`);
  const { brettAusText } = await import(`${WORTLEGER_DIR}/zug.js`);
  const { readFile } = await import('node:fs/promises');
  const liste = new Set((await readFile(`${WORTLEGER_DIR}/woerter.txt`, 'utf8')).split('\n'));
  return { werteZug, brettAusText, kennt: (w) => liste.has(w) };
}

/** Das Brett als Zeichenkette, direkt aus dem DOM gelesen. */
const wlBrett = (page) =>
  page.$$eval('#brett > div', (els) => els.map((e) => {
    if (!e.classList.contains('stein')) return '.';
    const b = (e.childNodes[0]?.nodeValue ?? '').trim();
    return e.classList.contains('joker') ? b.toLowerCase() : b;
  }).join(''));

/** Die Buchstaben auf dem Regal, in der Reihenfolge der Knoepfe. */
const wlRegal = (page) =>
  page.$$eval('#regal button', (els) =>
    els.map((e) => (e.childNodes[0]?.nodeValue ?? '').trim()));

async function wortleger(browser) {
  const { werteZug, brettAusText, kennt } = await wortlegerRegeln();

  const namen = ['Ata', 'Mira', 'Nuri'];
  const seiten = [];
  for (const name of namen) {
    const p = await spieler(browser, name);
    await p.goto(`${BASIS}/wortleger/`, { waitUntil: 'networkidle' });
    await p.fill('#name', name);
    seiten.push(p);
  }
  const [host, ...gaeste] = seiten;

  // Ohne Uhr: sonst laeuft waehrend der Suche nach einem Wort die Bedenkzeit
  // ab und der Zug geht an den Naechsten, mitten im Bild.
  await host.click('[data-zeit="0"]');
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
  await knipsen(host, 'wortleger-raum.png');

  await host.click('#startBtn');
  await host.waitForSelector('#screen-game.active', { timeout: 15000 });

  /** Welche Seite ist gerade am Zug? */
  const amZug = async () => {
    for (const s of seiten) {
      if (await s.locator('#dran.ich').count()) return s;
    }
    return null;
  };

  /** Legt die Steine eines Zuges hin – Regal antippen, Feld antippen. */
  const hinlegen = async (page, gelegt) => {
    for (const s of gelegt) {
      // Nach jedem Stein rutscht das Regal, also jedes Mal neu nachsehen.
      const knoepfe = await page.$$('#regal button');
      const texte = await wlRegal(page);
      const i = texte.indexOf(s.b);
      if (i === -1) throw new Error(`${s.b} liegt nicht mehr im Regal`);
      await knoepfe[i].click();
      await page.click(`#brett > div:nth-child(${s.r * WL_GROESSE + s.c + 1})`);
    }
  };

  /** Sucht einen gueltigen Zug: erst ein Wort durch den Stern, danach genuegt
   *  ein einzelner Stein, der sich irgendwo anlegt. */
  const sucheZug = async (page) => {
    const text = await wlBrett(page);
    const brett = brettAusText(text);
    const leer = !/[^.]/.test(text);
    const regal = (await wlRegal(page)).filter((b) => /^[A-ZÄÖÜ]$/.test(b));

    if (leer) {
      for (const laenge of [4, 3, 2]) {
        for (const folge of folgen(regal, laenge)) {
          const wort = folge.join('');
          if (!kennt(wort)) continue;
          for (let v = 0; v < laenge; v++) {
            const gelegt = [...wort].map((b, i) => ({
              r: WL_MITTE, c: WL_MITTE - v + i, b, joker: false,
            }));
            if (werteZug({ brett, gelegt, ersterZug: true, kennt }).ok) return gelegt;
          }
        }
      }
      return null;
    }

    for (let r = 0; r < WL_GROESSE; r++) {
      for (let c = 0; c < WL_GROESSE; c++) {
        if (brett[r][c]) continue;
        for (const b of new Set(regal)) {
          const gelegt = [{ r, c, b, joker: false }];
          if (werteZug({ brett, gelegt, ersterZug: false, kennt }).ok) return gelegt;
        }
      }
    }
    return null;
  };

  // Eine Weile wirklich spielen. Ohne das zeigt das Bild ein leeres Brett und
  // behauptet, hier gaebe es ein Legespiel.
  let gelegt = 0;
  for (let zug = 0; zug < 20 && gelegt < 8; zug++) {
    const page = await amZug();
    if (!page) break;
    const wahl = await sucheZug(page);
    if (wahl) {
      await hinlegen(page, wahl);
      await page.locator('#aktionen button', { hasText: 'Legen' }).click();
      gelegt++;
    } else {
      // Nichts zu machen: zwei Steine tauschen statt zu passen, sonst ist die
      // Partie nach zwei Runden ausgesessen.
      await page.locator('#aktionen button', { hasText: 'Tauschen' }).click();
      const knoepfe = await page.$$('#regal button');
      for (const k of knoepfe.slice(0, 2)) await k.click();
      await page.locator('#aktionen button', { hasText: 'tauschen' }).click();
    }
    await warte(500);
  }
  console.log(`    ${gelegt} Wörter gelegt`);

  // Das Bild soll die Mechanik zeigen, nicht nur das Ergebnis: auf der Seite,
  // die am Zug ist, liegt ein Wort schon halb – die frisch gelegten Steine
  // tragen den orangen Rand, der Knopf „Legen“ wartet.
  const letzte = await amZug();
  if (letzte) {
    const wahl = await sucheZug(letzte);
    if (wahl) await hinlegen(letzte, wahl);
    await warte(400);
    await knipsen(letzte, 'wortleger-spiel.png');
  } else {
    await knipsen(host, 'wortleger-spiel.png');
  }

  for (const s of seiten) await s.context().close();
}

/** Alle geordneten Folgen der Länge n, ohne einen Stein doppelt zu nehmen. */
function folgen(liste, n) {
  if (n === 0) return [[]];
  const raus = [];
  for (let i = 0; i < liste.length; i++) {
    const rest = liste.slice(0, i).concat(liste.slice(i + 1));
    for (const f of folgen(rest, n - 1)) raus.push([liste[i], ...f]);
  }
  return raus;
}


// ═══════════════ Die zwoelf vom 09.08.2026 ═══════════════════════════════
//
// Acht Server-Spiele auf der gemeinsamen Schale (`schale.js`) und vier ohne
// Server. Die Schale bringt ueberall dieselben Ids mit - deshalb reicht fuer
// den Weg in den Raum eine einzige Hilfsfunktion, und die Rezepte darunter
// bestehen nur noch aus dem, was das jeweilige Spiel ausmacht.

/**
 * Raum aufmachen, alle beitreten lassen, bereit melden, starten.
 * Gibt die Seiten zurueck - die erste ist der Host.
 */
async function raumAuf(browser, spiel, namen, vorStart, hoehe) {
  const seiten = [];
  const host = await spieler(browser, 'host', hoehe);
  seiten.push(host);
  await host.goto(`${BASIS}/${spiel}/`, { waitUntil: 'networkidle' });
  await host.fill('#name', namen[0]);
  await host.click('#createBtn');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const code = (await host.textContent('#roomCode')).trim();

  for (const name of namen.slice(1)) {
    const g = await spieler(browser, name, hoehe);
    seiten.push(g);
    await g.goto(`${BASIS}/${spiel}/`, { waitUntil: 'networkidle' });
    await g.fill('#name', name);
    await g.fill('#codeInput', code);
    await g.click('#joinBtn');
    await g.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await g.click('#readyBtn');
  }

  await warte(500);
  if (vorStart) await vorStart(seiten);
  await host.click('#startBtn');
  for (const s of seiten) await s.waitForSelector('#screen-game.active', { timeout: 15000 });
  await warte(500);
  return seiten;
}

const zu = async (seiten) => { for (const s of seiten) await s.context().close(); };

/**
 * Erste passende Schaltflaeche anklicken, sonst nichts tun.
 *
 * Der `isEnabled`-Test ist kein Beiwerk: in den Rundenspielen sind die Knoepfe
 * auf allen Bildschirmen da, aber nur bei dem gedrueckt, der am Zug ist. Ohne
 * ihn wartet Playwright eine halbe Minute darauf, dass ein abgeschalteter Knopf
 * anklickbar wird, und das Rezept steht.
 */
async function klickWenn(seite, wahl) {
  const el = seite.locator(wahl).first();
  if (!(await seite.locator(wahl).count())) return false;
  if (!(await el.isEnabled().catch(() => false))) return false;
  await el.click({ timeout: 4000 }).catch(() => {});
  return true;
}

// ------------------------------------------------------------------ Nachtwache

async function werwolf(browser) {
  // Vier ist die kleinste Besetzung. Mehr braucht das Bild nicht: es lebt vom
  // Wolfsbildschirm, und der sieht zu viert genauso aus wie zu zwoelft.
  // Niedrigeres Fenster: der Nachtbildschirm ist kurz, und in einem 680 Pixel
  // hohen Bild waere die untere Haelfte leerer Hintergrund.
  const seiten = await raumAuf(browser, 'werwolf', ['Ata', 'Mira', 'Nuri', 'Jo'], null, 400);

  // Alle bestaetigen ihre Rollenkarte - vorher geht es nicht weiter.
  for (const s of seiten) await klickWenn(s, '#buehne .btn.primary.big');
  await warte(800);

  // Den Wolf suchen: nur auf seinem Bildschirm steht eine Aufgabe. Genau das
  // ist der Punkt des Spiels, und genau das soll auf dem Bild zu sehen sein.
  let wolf = null;
  for (const s of seiten) {
    if (await s.locator('.aufgabe .wahlgitter').count()) { wolf = s; break; }
  }
  if (!wolf) throw new Error('kein Bildschirm mit Nachtaufgabe gefunden');
  await warte(400);
  await knipsen(wolf, 'werwolf-spiel.png');
  await zu(seiten);
}

// ------------------------------------------------------------------ Schwimmen

async function schwimmen(browser) {
  const seiten = await raumAuf(browser, 'schwimmen', ['Ata', 'Mira', 'Nuri']);

  // Auf die Aufdeckung hinspielen: sie zeigt alle drei Blaetter samt Punkten
  // und wer verliert. Das laufende Spiel zeigt nur die eigene Hand - als
  // Kachel sagt das zu wenig.
  for (let i = 0; i < 6; i++) {
    let getan = false;
    for (const s of seiten) {
      if (await s.locator('.aufdeck').count()) { getan = true; break; }
      // Klopfen, sobald es angeboten wird, sonst schieben.
      if (await klickWenn(s, '#aktionen button:has-text("Ich klopfe")')) { getan = true; break; }
      if (await klickWenn(s, '#aktionen button:has-text("Schieben")')) { getan = true; break; }
    }
    await warte(500);
    if (!getan) break;
    if (await seiten[0].locator('.aufdeck').count()) break;
  }
  await warte(500);
  await knipsen(seiten[0], 'schwimmen-spiel.png');
  await zu(seiten);
}

// -------------------------------------------------------------------- Mau-Mau

async function maumau(browser) {
  // Niedrigeres Fenster: der Spielbildschirm ist kurz, und in einem 680 Pixel
  // hohen Bild waere die untere Haelfte leerer Hintergrund.
  const seiten = await raumAuf(browser, 'maumau', ['Ata', 'Mira', 'Nuri'], null, 480);

  // Ein paar echte Zuege, damit die Haende ungleich lang sind und oben nicht
  // mehr die Startkarte liegt. Ein frisch gegebenes Blatt sieht aus wie ein
  // Screenshot, den niemand angefasst hat.
  for (let i = 0; i < 5; i++) {
    for (const s of seiten) {
      if (await klickWenn(s, '.karte.hand:not(.matt)')) { await warte(400); break; }
    }
    // Nach einem Buben muss eine Farbe gewaehlt werden, sonst steht alles.
    for (const s of seiten) await klickWenn(s, '.farbwahl button');
    await warte(250);
  }
  await warte(400);
  await knipsen(seiten[0], 'maumau-spiel.png');
  await zu(seiten);
}

// --------------------------------------------------------------------- Luegen

async function luegen(browser) {
  const seiten = await raumAuf(browser, 'luegen', ['Ata', 'Mira', 'Nuri']);

  // Zweimal ablegen: dann liegt ein Stapel da, die Ansage ist gestiegen, und
  // der "Luege!"-Knopf steht bei den anderen - das ist das Bild.
  //
  // Die Reihenfolge ist Pflicht: ist die Ansage frei, muss erst ein Rang
  // gewaehlt werden, sonst bleibt "Legen" grau. Und gelegt wird nur, wo
  // ueberhaupt ein Legen-Knopf steht - also beim Spieler am Zug.
  for (let runde = 0; runde < 2; runde++) {
    for (const s of seiten) {
      const legen = s.locator('#aktionen button:has-text("Legen")');
      if (!(await legen.count())) continue;
      await klickWenn(s, '#aktionen .ansage .seg');   // nur da, wenn frei
      await klickWenn(s, '.karte.hand');
      await warte(250);
      if (await legen.isEnabled()) {
        await legen.click();
        await warte(600);
      }
      break;
    }
  }
  await warte(500);
  await knipsen(seiten[0], 'luegen-spiel.png');
  await zu(seiten);
}

// ---------------------------------------------------------------- Becherbluff

async function becher(browser) {
  const seiten = await raumAuf(browser, 'becher', ['Ata', 'Mira', 'Nuri']);

  // Auf die Aufdeckung hinspielen: erst ein Gebot, dann zweifelt der Naechste.
  // Nur dort liegen alle Becher offen - vorher sieht man nur den eigenen, und
  // das ist als Kachel nichtssagend.
  for (const s of seiten) {
    if (!(await s.locator('#aktionen button:has-text("Ansagen")').count())) continue;
    // Erst hochzaehlen: die Voreinstellung ist "1x die Zwei", und ein Gebot von
    // eins erklaert niemandem, worum es hier geht.
    for (let i = 0; i < 3; i++) {
      await klickWenn(s, '.bieter .bz button:has-text("+")');
      await warte(120);
    }
    await klickWenn(s, '.bieter .bz .augen:nth-child(4)');
    await warte(150);
    await klickWenn(s, '#aktionen button:has-text("Ansagen")');
    break;
  }
  await warte(600);
  for (const s of seiten) {
    if (await klickWenn(s, '#aktionen button.zweifel')) break;
  }
  await seiten[0].waitForSelector('.aufdeck', { timeout: 15000 });
  await warte(500);
  await knipsen(seiten[0], 'becher-spiel.png');
  await zu(seiten);
}

// ------------------------------------------------------------------ Kings Cup

async function kingscup(browser) {
  const seiten = await raumAuf(browser, 'kingscup', ['Ata', 'Mira', 'Nuri']);

  // Eine Karte ziehen. Ohne sie liegt nur ein Ruecken da, und der Regeltext -
  // das Einzige, was dieses Spiel ausmacht - stuende nirgends.
  for (const s of seiten) {
    if (await klickWenn(s, '#aktionen button:has-text("Karte ziehen")')) break;
  }
  await seiten[0].waitForSelector('.kk-gross:not(.ruecken)', { timeout: 15000 });
  await warte(500);
  await knipsen(seiten[0], 'kingscup-spiel.png');
  await zu(seiten);
}

// ---------------------------------------------------------------------- Paare

async function paare(browser) {
  // Acht Paare: das kleinste Brett, damit die Karten auf dem Bild gross genug
  // sind, um die Zeichen zu erkennen.
  const seiten = await raumAuf(browser, 'paare', ['Ata', 'Mira'], async ([host]) => {
    await klickWenn(host, '#hostExtra [data-p="8"]');
    await warte(300);
  });

  // Ein volles, verdecktes Brett waere ein Bild von sechzehn grauen Kaesten -
  // genau das kam beim ersten Versuch heraus. Es muessen also Paare gefunden
  // werden, und zufaellig tippen findet in sechzehn Zuegen fast nie eines.
  //
  // Also merkt sich das Rezept, was schon offen lag: die aufgedeckte Karte
  // traegt ihr Zeichen im Text. Damit ist ab dem zweiten Durchgang klar, wo ein
  // Paar liegt - dasselbe, was ein Mensch am Tisch auch tut.
  //
  // Geklickt wird nur dort, wo die Karten anklickbar sind: der Client schaltet
  // sie auf allen anderen Bildschirmen ab, und Playwright wartet sonst geduldig
  // darauf, dass ein toter Knopf lebendig wird.
  const bekannt = new Map();          // Feldnummer -> Zeichen

  const lesen = async (seite) => {
    const felder = await seite.$$eval('.brett .pk', (ks) =>
      ks.map((k, i) => ({
        i,
        weg: k.classList.contains('weg'),
        auf: k.classList.contains('auf'),
        zeichen: k.textContent.trim(),
        tot: k.disabled,
      })));
    for (const f of felder) if (f.zeichen) bekannt.set(f.i, f.zeichen);
    return felder;
  };

  const tippen = async (seite, i) => {
    await seite.locator('.brett .pk').nth(i).click({ timeout: 4000 }).catch(() => {});
  };

  for (let zug = 0; zug < 24; zug++) {
    const weg = (await seiten[0].$$eval('.brett .pk.weg', (k) => k.length));
    if (weg >= 6) break;

    // Wer ist dran? Nur dort sind ueberhaupt Karten anklickbar.
    let dran = null, felder = null;
    for (const s of seiten) {
      const f = await lesen(s);
      if (f.some((x) => !x.tot)) { dran = s; felder = f; break; }
    }
    if (!dran) break;

    const liegen = felder.filter((f) => !f.weg && !f.auf);
    // Ein bekanntes Paar unter den noch liegenden Karten?
    let paar = null;
    for (const f of liegen) {
      const z = bekannt.get(f.i);
      if (!z) continue;
      const g = liegen.find((x) => x.i !== f.i && bekannt.get(x.i) === z);
      if (g) { paar = [f.i, g.i]; break; }
    }
    const unbekannt = liegen.filter((f) => !bekannt.has(f.i)).map((f) => f.i);
    const wahl = paar ?? [unbekannt[0] ?? liegen[0]?.i, unbekannt[1] ?? liegen[1]?.i];
    if (wahl[0] == null || wahl[1] == null) break;

    await tippen(dran, wahl[0]);
    await warte(300);
    await lesen(dran);
    await tippen(dran, wahl[1]);
    await warte(paar ? 400 : 2100);   // ein falsches Paar liegt 1,8 s offen
    await lesen(dran);
  }

  // Zum Schluss eine einzelne Karte offen stehen lassen: das Bild zeigt dann
  // beides - abgeraeumte Paare und den Moment mitten im Zug.
  for (const s of seiten) {
    const f = await lesen(s);
    const frei = f.find((x) => !x.tot);
    if (!frei) continue;
    await tippen(s, frei.i);
    break;
  }
  await warte(500);

  const weg = await seiten[0].locator('.brett .pk.weg').count();
  if (!weg) throw new Error('kein einziges Paar gefunden - das Brett waere leer');
  await knipsen(seiten[0], 'paare-spiel.png');
  await zu(seiten);
}

// ---------------------------------------------------------------------- Snake

async function snake(browser) {
  const seiten = await raumAuf(browser, 'snake', ['Ata', 'Mira', 'Nuri', 'Jo']);

  // Alle nach oben, und zwar alle dieselbe Richtung. Die Startplaetze liegen
  // sich paarweise gegenueber; faehrt jemand geradeaus weiter, faehrt er dem
  // Gegenueber in den Kopf, und im Bild stuende "Alle gleichzeitig - niemand".
  // Fahren alle nach oben, behaelt jede Schlange ihre Spalte und keine kann
  // eine andere treffen. Nach oben ist von einer waagerechten Fahrt aus immer
  // erlaubt - eine Kehrtwende waere es nicht.
  //
  // Danach bleiben rund fuenf Schritte, bis die oberste die Wand erreicht.
  // Genau dazwischen wird abgedrueckt.
  for (const s of seiten) await s.keyboard.press('ArrowUp').catch(() => {});
  await warte(650);

  // Nur ein laufendes Feld taugt als Kachel: steht dort "Pause", ist die Runde
  // schon vorbei und das Bild zeigt einen Endstand.
  const stand = await seiten[0].textContent('#tbTag').catch(() => '');
  if (!/l(ä|a)uft/i.test(stand ?? '')) throw new Error(`Runde laeuft nicht mehr (${stand})`);
  await warte(200);
  await knipsen(seiten[0], 'snake-spiel.png');
  await zu(seiten);
}

// ═══════════════ Die vier ohne Server ════════════════════════════════════
//
// Kein Raum, keine zweite Sitzung: eine Seite aufmachen, ein bisschen spielen,
// abdruecken. Genau das ist bei ihnen billiger - und der einzige Grund, warum
// sie ueberhaupt Bilder ohne fremde Hilfe bekommen koennen.

async function minenfeld(browser) {
  const seite = await spieler(browser, 'solo');
  await seite.goto(`${BASIS}/minenfeld/`, { waitUntil: 'networkidle' });
  await seite.waitForSelector('.mfeld .mz');

  // Erst in die Mitte: der erste Klick ist sicher und zieht eine Flaeche auf.
  // Ein unberuehrtes Feld waere ein Bild von einundachtzig grauen Kaesten.
  await seite.locator('.mfeld .mz').nth(40).click();
  await warte(400);
  // Zwei Fahnen dazu, damit auch die zweite Haelfte des Spiels im Bild ist.
  for (const n of [0, 8]) {
    const z = seite.locator('.mfeld .mz').nth(n);
    if (await z.count()) await z.click({ button: 'right' }).catch(() => {});
  }
  await warte(400);
  await knipsen(seite, 'minenfeld-spiel.png');
  await seite.context().close();
}

async function sudoku(browser) {
  const seite = await spieler(browser, 'solo');
  await seite.goto(`${BASIS}/sudoku/`, { waitUntil: 'networkidle' });
  await seite.waitForSelector('.sgitter .sz.vor', { timeout: 15000 });

  // Ein leeres Feld anwaehlen und eine Zahl setzen: so ist im Bild zu sehen,
  // dass man hier etwas tut, und nicht nur, dass ein Gitter dasteht.
  const leer = seite.locator('.sgitter .sz:not(.vor)');
  await leer.first().click();
  await warte(200);
  await seite.locator('.spad .zahl').first().click();
  await warte(400);
  await knipsen(seite, 'sudoku-spiel.png');
  await seite.context().close();
}

async function wortgitter(browser) {
  const seite = await spieler(browser, 'solo');
  await seite.goto(`${BASIS}/wortgitter/`, { waitUntil: 'networkidle' });
  await seite.waitForSelector('.wgitter .wk', { timeout: 15000 });

  // Zwei geratene Woerter: erst danach ist ueberhaupt Farbe im Gitter, und
  // die Farben sind das ganze Spiel.
  for (const wort of ['REGEN', 'BLUME']) {
    for (const b of wort) await seite.keyboard.press(b);
    await seite.keyboard.press('Enter');
    await warte(900);
  }
  await warte(400);
  await knipsen(seite, 'wortgitter-spiel.png');
  await seite.context().close();
}

async function patience(browser) {
  const seite = await spieler(browser, 'solo');
  await seite.goto(`${BASIS}/patience/`, { waitUntil: 'networkidle' });
  await seite.waitForSelector('.ptisch .pk', { timeout: 15000 });

  // Dreimal ziehen und aufraeumen: dann liegt etwas auf der Ablage, vielleicht
  // ein Ass oben, und der Tisch sieht nach angefangener Partie aus.
  for (let i = 0; i < 3; i++) {
    await seite.locator('.poben .pk.platz').first().click();
    await warte(250);
  }
  await klickWenn(seite, '#aktionen button:has-text("Aufräumen")');
  await warte(500);
  await knipsen(seite, 'patience-spiel.png');
  await seite.context().close();
}

// ═══════════════ Das Dauerspiel ══════════════════════════════════════════
//
// Revier braucht als einziges Spiel keinen Raum und keine zweite Sitzung: die
// Welt laeuft ohnehin, und die Bots haben sie schon eingefaerbt. Zu tun bleibt,
// selbst eine Flaeche zu holen - ein Bild, auf dem nur fremdes Revier zu sehen
// waere, zeigt nicht, worum es geht.

async function revier(browser) {
  const seite = await spieler(browser, 'revier');
  await seite.goto(`${BASIS}/revier/`, { waitUntil: 'networkidle' });
  await seite.fill('#name', 'Ata');
  await seite.click('#losBtn');
  await seite.waitForFunction(
    () => !document.getElementById('hud').hasAttribute('hidden'),
    null, { timeout: 10000 },
  );
  await warte(800);

  // app.js ist ein gewoehnliches Skript, seine obersten `const` und
  // Funktionen liegen damit im globalen Namensraum - von hier aus erreichbar.
  const eigenes = () => seite.evaluate(() => stand.get(S.du)?.felder ?? 0);

  // Wer beitritt, faehrt sofort los, und zwar in eine zufaellige Richtung.
  // Nach ein paar Sekunden steht man also irgendwo mit offener Spur - eine
  // Schleife von dort schliesst sich nirgends. Erst nach Hause.
  const heimfahren = async () => {
    for (let n = 0; n < 90; n++) {
      const stand = await seite.evaluate(() => {
        const k = koepfe.get(S.du);
        if (!k) return null;
        let sx = 0, sy = 0, m = 0, spur = 0;
        for (let i = 0; i < S.boden.length; i++) {
          if (S.spur[i] === S.du) spur++;
          if (S.boden[i] !== S.du) continue;
          const x = i % S.w;
          sx += x; sy += (i - x) / S.w; m++;
        }
        if (!m) return null;
        const drin = S.boden[Math.floor(k.y) * S.w + Math.floor(k.x)] === S.du;
        schicke({
          t: 'dir',
          a: Math.round(Math.atan2(sy / m - k.y, sx / m - k.x) * 180 / Math.PI),
        });
        return { drin, spur };
      });
      if (stand && stand.drin && stand.spur === 0) return true;
      await warte(150);
    }
    return false;
  };

  let geschafft = false;
  for (let versuch = 0; versuch < 3 && !geschafft; versuch++) {
    if (!await heimfahren()) continue;
    const wo = await seite.evaluate(() => {
      const k = koepfe.get(S.du);
      return k ? { x: k.x, y: k.y, w: S.w, h: S.h } : null;
    });
    if (!wo) break;
    // In die Haelfte fahren, in der mehr Platz ist - die Aussenwand ist toedlich.
    const runde = [
      wo.x < wo.w / 2 ? 'ArrowRight' : 'ArrowLeft',
      wo.y < wo.h / 2 ? 'ArrowDown' : 'ArrowUp',
      wo.x < wo.w / 2 ? 'ArrowLeft' : 'ArrowRight',
      wo.y < wo.h / 2 ? 'ArrowUp' : 'ArrowDown',
    ];
    for (const taste of runde) {
      await seite.keyboard.press(taste);
      await warte(1700);
    }
    await warte(1200);
    geschafft = (await eigenes()) > 400;
  }
  if (!geschafft) throw new Error('keine Flaeche zustande gekommen');

  await knipsen(seite, 'revier-spiel.png');
  await seite.context().close();
}

// Wurm ist wie Revier eine Welt ohne Raum. Das Bild muss zwei Dinge zeigen,
// die eine frisch angemeldete Schlange beide nicht hat: eine gewachsene
// Laenge und jemanden, dem man begegnet. Beides wird deshalb abgewartet -
// erst gefressen, dann gesucht.

async function wurm(browser) {
  const seite = await spieler(browser, 'wurm');
  await seite.goto(`${BASIS}/wurm/`, { waitUntil: 'networkidle' });
  await seite.fill('#name', 'Ata');
  await seite.click('#losBtn');
  await seite.waitForFunction(
    () => !document.getElementById('hud').hasAttribute('hidden'),
    null, { timeout: 10000 },
  );

  // app.js ist ein gewoehnliches Skript, seine obersten `const` und Funktionen
  // liegen damit im globalen Namensraum - von hier aus erreichbar.
  const schritt = () => seite.evaluate(() => {
    const ich = schlangen.get(S.du);
    if (!ich) return null;
    const winkel = (dx, dy) => Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

    // Fremder Koerper voraus? Dann nichts wie weg - das hat Vorrang vor allem
    // anderen. Ohne diesen Absatz kroch die Aufnahme stur zum naechsten Ball
    // und war nach achtzig Sekunden immer noch bei achtzehn Energie, weil sie
    // jedem Bot in den Bauch gefahren war.
    let gefahr = false;
    for (const sn of schlangen.values()) {
      if (sn.id === S.du) continue;
      for (const [x, y] of sn.punkte) {
        const dx = x - ich.kx, dy = y - ich.ky;
        if (dx * dx + dy * dy > 260 * 260) continue;
        // Nur was vor einem liegt, ist gefaehrlich.
        if (Math.cos(ich.rot) * dx + Math.sin(ich.rot) * dy > 0) { gefahr = true; break; }
      }
      if (gefahr) { schicke({ t: 'dir', a: Math.round((ich.rot * 180) / Math.PI) + 90 }); break; }
    }
    // Wer schon gross genug ist, sucht Gesellschaft: ein Bild von einer
    // einzelnen Schlange im Leeren zeigt nicht, worum es geht.
    let naechste = null, weit = Infinity;
    for (const sn of schlangen.values()) {
      if (sn.id === S.du) continue;
      const d = Math.hypot(sn.kx - ich.kx, sn.ky - ich.ky);
      if (d < weit) { weit = d; naechste = sn; }
    }
    const gross = Number(document.getElementById('eigenMasse').textContent) >= 110;

    if (gefahr) {
      // schon gelenkt
    } else if (ich.kx < 420 || ich.ky < 420 || ich.kx > S.w - 420 || ich.ky > S.h - 420) {
      // Die Aussenwand ist toedlich und hat Vorrang vor jedem Ball.
      schicke({ t: 'dir', a: winkel(S.w / 2 - ich.kx, S.h / 2 - ich.ky) });
    } else if (gross && naechste && weit > 420) {
      schicke({ t: 'dir', a: winkel(naechste.kx - ich.kx, naechste.ky - ich.ky) });
    } else {
      let ziel = null, kurz = Infinity;
      for (const b of baelle.values()) {
        const d = (b.x - ich.kx) ** 2 + (b.y - ich.ky) ** 2;
        if (d < kurz) { kurz = d; ziel = b; }
      }
      if (ziel) schicke({ t: 'dir', a: winkel(ziel.x - ich.kx, ziel.y - ich.ky) });
    }

    let nah = Infinity;
    for (const sn of schlangen.values()) {
      if (sn.id === S.du) continue;
      nah = Math.min(nah, Math.hypot(sn.kx - ich.kx, sn.ky - ich.ky));
    }
    return {
      masse: Number(document.getElementById('eigenMasse').textContent),
      glieder: ich.punkte.length,
      nah,
    };
  });

  let lage = null;
  for (let n = 0; n < 600; n++) {
    lage = await schritt();
    // Lang genug fuer eine erkennbare Schlange, und jemand mit im Bild.
    if (lage && lage.masse >= 110 && lage.nah < 700) break;
    await warte(200);
  }
  console.log(`    Energie ${lage?.masse}, ${lage?.glieder} Glieder, naechster ${Math.round(lage?.nah ?? 0)}`);

  await warte(400);
  await knipsen(seite, 'wurm-spiel.png');
  await seite.context().close();
}

const SPIELE = {
  keep, cardchaos, seconds, luckyreflex, nochnie, maexchen, amehesten, imposter,
  flasche, cubes, wortleger,
  // Die zwoelf vom 09.08.2026
  werwolf, schwimmen, maumau, luegen, becher, kingscup, paare, snake,
  minenfeld, sudoku, wortgitter, patience,
  revier, wurm,
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
