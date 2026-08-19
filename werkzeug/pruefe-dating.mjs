// Prueft an ZWEI das, was `probe.js` nicht kann: dass der Browser die beiden
// wirklich **ohne einen Klick** in die private Lobby des Spiels traegt.
//
// Das ist die eine Behauptung, auf der das ganze Projekt steht, und es ist die
// einzige, die sich nicht ueber WebSockets nachweisen laesst: der Server sagt
// nur „Raum K7QF in Paare". Ob der iframe daraufhin auch wirklich in der Lobby
// von Paare steht - und zwar in dieser und nicht auf deren Startseite - sieht
// man erst im Browser.
//
// Sie laeuft **gegen live**, und zwar ueber die Uebungsrunde: die faengt sofort
// an, statt auf den Zehn-Minuten-Takt zu warten, und verbraucht niemanden, der
// gerade wartet. Der Preis ist ein echter privater Raum je Bauart und Lauf;
// die Bremse der Spiele laesst zwoelf in zehn Minuten zu.
//
//   cd /root/werkzeug-screenshots && node pruefe-dating.mjs
//
// D01  Startseite baut sich auf, Konsole still, nichts fehlt
// D02  Ohne Name und Seite geht der Knopf nicht
// D03  Uebungsrunde: die Spielwahl steht, Kacheln sind teils schon vergeben
// D04  Nach der Wahl steht der Kreis - Maenner mit Spiel, eigene Figur markiert
// D05  Ein Uebungsmensch erreicht ihn: der Paar-Bildschirm kommt
// D06  Der iframe steht in der Lobby DIESES Raums - Bauart "schale"
// D07  Dasselbe fuer Bauart "hash" (anderer Weg hinein, zweiter Lauf)
// D08  Der Chat nimmt eine Zeile an und zeigt sie als eigene
// D09  390 px breit: nichts laeuft seitlich heraus
// D10  Die Seite sagt Suchmaschinen ab (noindex) - sie soll geheim bleiben

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

/**
 * Eine ganze Uebungsrunde als Mann, bis der iframe steht.
 * @param {"schale"|"hash"} art welche Bauart der Uebergabe geprueft wird
 */
async function runde(art, { mitKonsole = false } = {}) {
  const seite = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const laut = [];
  const kaputt = [];
  seite.on('console', (m) => { if (m.type() === 'error') laut.push(m.text()); });
  seite.on('requestfailed', (r) => kaputt.push(r.url()));

  await seite.goto(PFAD, { waitUntil: 'networkidle' });

  if (mitKonsole) {
    pruefe(await seite.locator('#screen-heim.active').isVisible(), 'D01 Startseite steht');
    pruefe(laut.length === 0, `D01 Konsole still (${laut.length} Meldungen)`);
    pruefe(kaputt.length === 0, `D01 nichts fehlt (${kaputt.length} tote Anfragen)`);
    pruefe(
      await seite.locator('#anmeldenBtn').isDisabled(),
      'D02 ohne Name und Seite ist der Knopf aus',
    );
  }

  await seite.fill('#name', 'Proband');
  await seite.click('[data-seite="m"]');
  pruefe(
    !(await seite.locator('#uebungBtn').isDisabled()),
    `D02 mit Name und Seite geht der Knopf (${art})`,
  );

  await seite.click('#uebungBtn');
  await seite.waitForSelector('#screen-wahl.active', { timeout: 15000 });
  const kacheln = await seite.locator('.kachel').count();
  const vergeben = await seite.locator('.kachel.weg').count();
  pruefe(
    kacheln === 10 && vergeben === 3,
    `D03 Spielwahl: ${kacheln} Kacheln, ${vergeben} schon von Uebungsleuten vergeben (${art})`,
  );

  // Gezielt eine Kachel der gesuchten Bauart nehmen, die noch frei ist.
  const kachel = seite.locator(`.kachel[data-art="${art}"]:not(.weg)`).first();
  const spielName = await kachel.getAttribute('data-spiel');
  const spielTitel = (await kachel.locator('.kachel-titel').textContent()).trim();
  await kachel.click();

  await seite.waitForSelector('#screen-kreis.active', { timeout: 15000 });
  const maenner = await seite.locator('.fig.mann').count();
  const ichDa = await seite.locator('.fig.mann.ich').count();
  const legende = await seite.locator('.leg').count();
  pruefe(
    maenner === 4 && ichDa === 1 && legende === 4,
    `D04 Kreis: ${maenner} Maenner, eigene Figur markiert, ${legende} in der Legende (${art})`,
  );

  // Jetzt laufen die Uebungsleute los. Einer erreicht ihn - hoechstens zwei
  // Freigabewellen zu 18 s, plus Laufzeit.
  await seite.waitForSelector('#screen-paar.active', { timeout: 90000 });
  pruefe(true, `D05 ein Uebungsmensch hat ihn erreicht (${art}, ${spielTitel})`);

  // Der Raumcode steht in der Systemzeile im Chat: "Raum K7QF steht."
  await seite.waitForFunction(
    () => /Raum [A-Z0-9]{3,5} steht/.test(document.getElementById('chatVerlauf').textContent),
    null,
    { timeout: 20000 },
  );
  const verlauf = await seite.locator('#chatVerlauf').textContent();
  const code = verlauf.match(/Raum ([A-Z0-9]{3,5}) steht/)[1];

  // Und hier kommt der Nachweis: was steht im iframe?
  const rahmen = seite.frameLocator('#spielRahmen');
  await rahmen.locator('#roomCode').waitFor({ state: 'visible', timeout: 25000 });
  const imRahmen = (await rahmen.locator('#roomCode').textContent()).trim();
  const sicht = (await rahmen.locator('#roomVis').textContent()).trim();
  const src = await seite.locator('#spielRahmen').getAttribute('src');

  pruefe(
    imRahmen === code,
    `D06/${art} der iframe steht in Raum ${imRahmen} – derselbe, den ZWEI bestellt hat (${code})`,
  );
  // Die Schalenspiele schreiben "privat", die vier aelteren
  // "Privat – nur mit Code". Geprueft wird das Wort, nicht der Satz.
  pruefe(
    /^privat/i.test(sicht),
    `D06/${art} und der Raum ist privat ("${sicht}") – steht in keiner oeffentlichen Liste`,
  );
  pruefe(
    src === `/${spielName}/#${code}`,
    `D06/${art} der iframe zeigt auf ${src}`,
  );
  // Ohne einen einzigen Klick im Spiel: die Lobby, nicht die Startseite.
  const inLobby = await rahmen.locator('#screen-lobby.active, #screen-lobby.on').count();
  pruefe(
    inLobby === 1,
    `D06/${art} und zwar in der Lobby, ohne dass jemand im Spiel etwas anklicken musste`,
  );

  // Chat
  await seite.fill('#chatText', 'Hallo!');
  await seite.press('#chatText', 'Enter');
  await warte(600);
  const meins = await seite.locator('.cz.meins').count();
  pruefe(meins === 1, `D08 die eigene Chatzeile steht rechts (${art})`);

  if (mitKonsole) {
    // Handy: nichts darf seitlich herauslaufen.
    await seite.setViewportSize({ width: 390, height: 844 });
    await warte(400);
    const ueber = await seite.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    pruefe(ueber <= 1, `D09 bei 390 px laeuft nichts heraus (${ueber} px)`);
    pruefe(laut.length === 0, `D09 Konsole auch am Ende still (${laut.join(' | ')})`);
  }

  await seite.click('#fertigBtn').catch(() => {});
  await seite.close();
}

console.log(`ZWEI gegen ${PFAD}\n`);

// Erst die Schalen-Bauart (Sitz im localStorage), dann die Hash-Bauart.
await runde('schale', { mitKonsole: true });
await runde('hash');

// D10: die Seite muss Suchmaschinen absagen - sie soll geheim bleiben.
const kopf = await browser.newPage();
const antwort = await kopf.goto(PFAD);
const robots = antwort.headers()['x-robots-tag'] ?? '';
const meta = await kopf.getAttribute('meta[name="robots"]', 'content').catch(() => null);
pruefe(
  robots.includes('noindex') && (meta ?? '').includes('noindex'),
  `D10 noindex steht im Header (${robots}) und in der Seite (${meta})`,
);
await kopf.close();

await browser.close();

if (fehler.length) {
  console.error(`\n${fehler.length} Punkt(e) rot:`);
  for (const f of fehler) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAlles gruen.');
