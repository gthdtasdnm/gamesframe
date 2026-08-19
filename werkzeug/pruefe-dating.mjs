// Prueft an ZWEI das, was `probe.js` nicht kann: die Seite selbst – und vor
// allem, dass der Browser die beiden wirklich **ohne einen Klick** in die
// private Lobby des Spiels traegt.
//
// Das ist die eine Behauptung, auf der das ganze Projekt steht, und die
// einzige, die sich nicht ueber WebSockets nachweisen laesst: der Server sagt
// nur „Raum K7QF in Becherbluff". Ob der iframe daraufhin auch wirklich in der
// Lobby von Becherbluff steht - und zwar in dieser und nicht auf deren
// Startseite - sieht man erst im Browser.
//
// Sie laeuft **gegen live**. Der Abend selbst wird dabei nicht angefasst: der
// Kreis wird ueber die Uebungsrunde geprueft, die sofort anfaengt und niemandem
// den Platz wegnimmt. Die Reservierung wird angelegt **und wieder abgesagt**,
// damit auf der echten Tafel kein Probename stehen bleibt.
//
//   cd /root/werkzeug-screenshots && node pruefe-dating.mjs
//
// D01  Startseite baut sich auf, Konsole still, nichts fehlt
// D02  Ohne Name und Seite geht der Knopf nicht
// D03  Der Countdown laeuft wirklich (zwei Messungen, drei Sekunden)
// D04  Reservieren: der Name steht auf der Tafel, Absagen nimmt ihn weg
// D05  Uebungsrunde: die Spielwahl steht, Kacheln sind teils schon vergeben
// D06  Nach der Wahl steht das Karussell - Maenner innen, Frauen aussen
// D07  Ein Uebungsmensch erreicht ihn: der Paar-Bildschirm kommt
// D08  Der iframe steht in der Lobby DIESES Raums - beide Bauarten
// D09  Der Chat nimmt eine Zeile an und zeigt sie als eigene
// D10  390 px breit: nichts laeuft seitlich heraus
// D11  Die Seite sagt Suchmaschinen ab (noindex) - sie soll geheim bleiben

import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const PFAD = `${BASIS}/dating/`;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const fehler = [];
const pruefe = (bedingung, text) => {
  if (bedingung) console.log(`  ✓ ${text}`);
  else { console.log(`  ✗ ${text}`); fehler.push(text); }
};

const browser = await chromium.launch();

/** Frische Seite; Rueckfragen werden bejaht, sonst haengt „Platz freigeben". */
async function neueSeite(breit = 1280) {
  const seite = await browser.newPage({ viewport: { width: breit, height: 900 } });
  seite.on('dialog', (d) => d.accept());
  return seite;
}

/** Sekunden aus einem Countdown der Form H:MM:SS oder MM:SS. */
function sekunden(text) {
  const teile = text.trim().split(':').map(Number);
  if (teile.some((n) => !Number.isFinite(n))) return NaN;
  return teile.reduce((s, n) => s * 60 + n, 0);
}

// ---------------------------------------------------------------------------
// Die Tafel
// ---------------------------------------------------------------------------

async function tafel() {
  const seite = await neueSeite();
  const laut = [];
  const kaputt = [];
  seite.on('console', (m) => { if (m.type() === 'error') laut.push(m.text()); });
  seite.on('requestfailed', (r) => kaputt.push(r.url()));

  await seite.goto(PFAD, { waitUntil: 'networkidle' });

  pruefe(await seite.locator('#screen-heim.active').isVisible(), 'D01 Startseite steht');
  pruefe(laut.length === 0, `D01 Konsole still (${laut.join(' | ') || '0 Meldungen'})`);
  pruefe(kaputt.length === 0, `D01 nichts fehlt (${kaputt.length} tote Anfragen)`);

  const zeit = (await seite.locator('#terminZeit').textContent()).trim();
  pruefe(/^\d{2}:\d{2} Uhr$/.test(zeit), `D01 der Termin steht oben: ${zeit}`);

  pruefe(
    await seite.locator('#reservierenBtn').isDisabled(),
    'D02 ohne Name und Seite ist der Knopf aus',
  );

  // D03: der Countdown muss laufen, nicht nur dastehen.
  const a = sekunden(await seite.locator('#countdown').textContent());
  await warte(3000);
  const b = sekunden(await seite.locator('#countdown').textContent());
  pruefe(
    Number.isFinite(a) && Number.isFinite(b) && a - b >= 2 && a - b <= 5,
    `D03 der Countdown laeuft: ${a} s, drei Sekunden spaeter ${b} s`,
  );

  // D04: reservieren, auf der Tafel nachsehen, wieder absagen.
  const name = 'Probe' + String(Date.now()).slice(-4);
  await seite.fill('#name', name);
  await seite.click('#anmeldung [data-seite="w"]');
  await seite.click('#reservierenBtn');
  await seite.waitForSelector('#meinPlatz:not([hidden])', { timeout: 8000 });

  const aufTafel = await seite.locator('#listeW li.ich .nm').textContent().catch(() => null);
  const meinPlatz = (await seite.locator('#mpZeile').textContent()).trim();
  pruefe(
    aufTafel?.trim() === name,
    `D04 der Name steht auf der Tafel: „${aufTafel?.trim()}" als ${meinPlatz}`,
  );
  pruefe(
    await seite.locator('#anmeldung').isHidden(),
    'D04 und das Formular ist weg, solange der Platz steht',
  );

  await seite.click('#absagenBtn');
  await seite.waitForSelector('#anmeldung:not([hidden])', { timeout: 8000 });
  const nochDa = await seite.locator('#listeW li.ich').count();
  pruefe(nochDa === 0, 'D04 nach dem Absagen ist der Name wieder weg');

  await seite.setViewportSize({ width: 390, height: 844 });
  await warte(400);
  const ueber = await seite.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  pruefe(ueber <= 1, `D10 Tafel bei 390 px ohne Ueberlauf (${ueber} px)`);

  await seite.close();
}

// ---------------------------------------------------------------------------
// Eine Uebungsrunde bis in den iframe
//
// Geprueft wird je Runde **ein bestimmtes Spiel**, nicht irgendeins seiner
// Sorte: die zwoelf verteilen sich auf vier Bestelldialekte und drei
// Lobby-Markups, und wer nur „irgendein Hash-Spiel" prueft, prueft bei jedem
// Lauf ein anderes und keins zuverlaessig.
//
// Die vier hier decken alles ab, was sich unterscheidet:
//   schwimmen   Sitz im localStorage hinlegen  (Bauart "schale", Dialekt raum)
//   keep        Socket.IO bestellen, sessionStorage aufraeumen
//   cardchaos   eigener Dialekt, eigenes Lobby-Markup, localStorage aufraeumen
//   wurm        offene Welt: kein Raum, kein Code, und das muss dastehen
// ---------------------------------------------------------------------------

/** Wo das jeweilige Spiel seinen Raumcode hinschreibt. */
const LOBBY = {
  // Card Chaos ist aelter als die gemeinsame Schale und heisst alles anders.
  cardchaos: { code: '#room-code', vis: '#room-vis' },
  standard: { code: '#roomCode', vis: '#roomVis' },
};
const lobbyVon = (name) => LOBBY[name] ?? LOBBY.standard;

/**
 * @param {string} spielName welches Spiel der Proband greifen soll
 * @param {{messen?: boolean, versuch?: number}} o
 */
async function runde(spielName, { messen = false, versuch = 1 } = {}) {
  const seite = await neueSeite();
  const laut = [];
  seite.on('console', (m) => { if (m.type() === 'error') laut.push(m.text()); });
  await seite.goto(PFAD, { waitUntil: 'networkidle' });

  await seite.fill('#name', 'Proband');
  await seite.click('#anmeldung [data-seite="m"]');
  await seite.click('#uebungBtn');

  await seite.waitForSelector('#screen-wahl.active', { timeout: 15000 });
  const kacheln = await seite.locator('.kachel').count();
  const vergeben = await seite.locator('.kachel.weg').count();

  // Die drei Uebungsleute greifen sich drei zufaellige Spiele. Erwischt einer
  // unseres, faengt die Runde von vorn an – dreimal, dann ist etwas kaputt.
  const kachel = seite.locator(`.kachel[data-spiel="${spielName}"]:not(.weg)`);
  if (await kachel.count() === 0) {
    await seite.close();
    if (versuch >= 4) {
      pruefe(false, `D05 ${spielName} war viermal hintereinander vergeben`);
      return;
    }
    return runde(spielName, { messen, versuch: versuch + 1 });
  }

  if (versuch === 1) {
    pruefe(
      kacheln === 12 && vergeben === 3,
      `D05 Spielwahl: ${kacheln} Kacheln, ${vergeben} von Uebungsleuten vergeben ` +
        `(zwoelf laut spiele.js – wer die Liste aendert, aendert hier mit)`,
    );
  }

  const art = await kachel.getAttribute('data-art');
  const spielTitel = (await kachel.locator('.kachel-titel').textContent()).trim();
  await kachel.click();

  await seite.waitForSelector('#screen-kreis.active', { timeout: 15000 });
  const maenner = await seite.locator('.fig.mann').count();
  const ichDa = await seite.locator('.fig.mann.ich').count();
  const legende = await seite.locator('.leg').count();
  pruefe(
    maenner === 4 && ichDa === 1 && legende === 4,
    `D06 Karussell: ${maenner} Maenner, eigene Figur markiert, ${legende} in der Legende (${spielName})`,
  );

  if (messen) {
    // Die Maenner drehen sich **innen**, die Frauen stehen **aussen** – das
    // war die Umkehrung gegenueber der ersten Fassung, und sie laesst sich
    // nur hier nachmessen: am Abstand zur Mitte, in Prozent der Arena.
    const abstand = async (wahl) => await seite.evaluate((w) => {
      const punkte = [...document.querySelectorAll(w)]
        .filter((n) => !n.classList.contains('fort'))
        .map((n) => Math.hypot(parseFloat(n.style.left) - 50, parseFloat(n.style.top) - 50))
        .filter((x) => Number.isFinite(x));
      return punkte.length ? punkte.reduce((a, b) => a + b, 0) / punkte.length : NaN;
    }, wahl);

    await warte(1200);
    const rM = await abstand('.fig.mann');
    const rF = await abstand('.fig.frau');
    pruefe(
      rM > 12 && rM < 22 && rF > 38,
      `D06 Maenner kreisen innen (${rM.toFixed(1)} % der Arena), ` +
        `Frauen warten aussen (${rF.toFixed(1)} %)`,
    );
  }

  await seite.waitForSelector('#screen-paar.active', { timeout: 90000 });
  pruefe(true, `D07 ein Uebungsmensch hat ihn erreicht (${spielTitel}, Bauart ${art})`);

  const rahmen = seite.frameLocator('#spielRahmen');

  if (art === 'welt') {
    // Wurm und Revier haben keine Raeume. Zu pruefen ist deshalb zweierlei:
    // dass die Welt wirklich aufgeht – und dass die Seite den Unterschied
    // ausspricht, statt eine private Lobby vorzutaeuschen.
    await seite.waitForFunction(
      () => /offene Welt/.test(document.getElementById('chatVerlauf').textContent),
      null,
      { timeout: 20000 },
    );
    const src = await seite.locator('#spielRahmen').getAttribute('src');
    pruefe(src === `/${spielName}/`, `D08/welt der iframe zeigt auf ${src} – ohne Raumcode`);
    await rahmen.locator('#feld').waitFor({ state: 'visible', timeout: 25000 });
    pruefe(true, 'D08/welt und die Welt baut sich im iframe wirklich auf');
    const hinweis = await seite.locator('#chatVerlauf').textContent();
    pruefe(
      /nicht allein/.test(hinweis),
      'D08/welt und es steht da, dass die beiden dort nicht unter sich sind',
    );
  } else {
    await seite.waitForFunction(
      () => /Raum [A-Z0-9]{3,5} steht/.test(document.getElementById('chatVerlauf').textContent),
      null,
      { timeout: 20000 },
    );
    const verlauf = await seite.locator('#chatVerlauf').textContent();
    const code = verlauf.match(/Raum ([A-Z0-9]{3,5}) steht/)[1];

    // Der Nachweis: was steht im iframe? Dass das Codefeld ueberhaupt sichtbar
    // ist, heisst schon, dass die Lobby offen steht – es liegt in ihr drin.
    const w = lobbyVon(spielName);
    await rahmen.locator(w.code).waitFor({ state: 'visible', timeout: 25000 });
    const imRahmen = (await rahmen.locator(w.code).textContent()).trim();
    const sicht = (await rahmen.locator(w.vis).textContent()).trim();
    const src = await seite.locator('#spielRahmen').getAttribute('src');

    pruefe(
      imRahmen.includes(code),
      `D08/${spielName} der iframe steht in Raum ${imRahmen} – derselbe, den ZWEI bestellt hat (${code})`,
    );
    // Die Schalenspiele schreiben „privat", die aelteren „Privat – nur mit
    // Code". Geprueft wird das Wort, nicht der Satz.
    pruefe(
      /privat/i.test(sicht),
      `D08/${spielName} und der Raum ist privat („${sicht}")`,
    );
    pruefe(src === `/${spielName}/#${code}`, `D08/${spielName} der iframe zeigt auf ${src}`);
  }

  await seite.fill('#chatText', 'Hallo!');
  await seite.press('#chatText', 'Enter');
  await warte(700);
  pruefe(
    await seite.locator('.cz.meins').count() === 1,
    `D09 die eigene Chatzeile steht auf der eigenen Seite (${spielName})`,
  );

  if (messen) {
    await seite.setViewportSize({ width: 390, height: 844 });
    await warte(400);
    const ueber = await seite.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    pruefe(ueber <= 1, `D10 Paar-Bildschirm bei 390 px ohne Ueberlauf (${ueber} px)`);
    pruefe(laut.length === 0, `D10 Konsole auch am Ende still (${laut.join(' | ')})`);
  }

  await seite.click('#fertigBtn').catch(() => {});
  await seite.close();
}

// ---------------------------------------------------------------------------

console.log(
`ZWEI gegen ${PFAD}\n`);
await tafel();
await runde('schwimmen', { messen: true });   // Schale: Sitz hinlegen
await runde('keep');                          // Socket.IO + sessionStorage
await runde('cardchaos');                     // eigener Dialekt, eigenes Markup
await runde('wurm');                          // offene Welt, kein Raum

// D11: die Seite muss Suchmaschinen absagen – sie soll geheim bleiben.
const kopf = await neueSeite();
const antwort = await kopf.goto(PFAD);
const robots = antwort.headers()['x-robots-tag'] ?? '';
const meta = await kopf.getAttribute('meta[name="robots"]', 'content').catch(() => null);
pruefe(
  robots.includes('noindex') && (meta ?? '').includes('noindex'),
  `D11 noindex steht im Header (${robots}) und in der Seite (${meta})`,
);
await kopf.close();

await browser.close();

if (fehler.length) {
  console.error(`\n${fehler.length} Punkt(e) rot:`);
  for (const f of fehler) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAlles gruen.');
