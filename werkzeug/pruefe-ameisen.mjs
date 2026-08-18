// Prueft an Ameisen das, was `probe.js` nicht kann: die Seite selbst.
//
// Die WebSocket-Probe fragt den Server ab und weiss nichts davon, ob ein Handy
// ueberhaupt ein Bild bekommt. Hier haengt daran aber alles: das Spiel ist
// eine Leinwand, auf die man tippt, und ein Laden, den man aufmacht.
//
// Zwei Dinge macht dieses Skript anders als die anderen Browserproben:
//
//   * Es startet sich eine **eigene Fassung** auf Port 8173, mit voller Kasse
//     (`START_MUENZEN`) und einem eigenen Ordner fuer die Baue. Ohne Geld
//     laesst sich der Laden nicht pruefen - der erste Kauf dauert im echten
//     Spiel Minuten. Und in die echten Baue soll eine Probe nicht schreiben.
//   * Es prueft mit `BASIS` auch gegen live, dann aber ohne die Kaufteile.
//
//   cd /root/werkzeug-screenshots && node pruefe-ameisen.mjs
//   BASIS=https://inf-zeus.de node pruefe-ameisen.mjs     (ohne A04/A05)
//
// A01  Seite baut sich auf, Konsole still, nichts fehlt
// A02  Der Bau steht: Huegel, Ameisen, Zahlen oben
// A03  Tippen wirft einen Kruemel - Beutel leerer, Stueck liegt da
// A04  Der Laden kauft wirklich: Stufe steigt, Preis steigt, Kasse sinkt
// A05  Ein zweiter Ausgang wird auch gezeichnet
// A06  390 px breit: nichts laeuft seitlich heraus
// A07  Bildrate: die Leinwand muss fluessig laufen
// A08  Neu geladen landet man im selben Bau
// A09  Konsole auch nach allem Getippe still

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const EIGEN = !process.env.BASIS;
const PORT = 8173;
const BASIS = process.env.BASIS ?? `http://127.0.0.1:${PORT}`;
const PFAD = EIGEN ? '/' : '/ameisen/';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const fehler = [];
const pruefe = (bedingung, text) => {
  if (bedingung) console.log(`  ✓ ${text}`);
  else { console.log(`  ✗ ${text}`); fehler.push(text); }
};

let kind = null;
if (EIGEN) {
  await mkdir('/tmp/ameisen-probe', { recursive: true });
  kind = spawn('/usr/local/bin/deno', [
    'run', '--allow-net', '--allow-read', '--allow-write=/tmp/ameisen-probe',
    '--allow-env', '--allow-sys', 'server.js',
  ], {
    cwd: '/var/www/html/ameisen',
    env: {
      ...process.env,
      PORT: String(PORT), HOST: '127.0.0.1', DENO_DIR: '/tmp/deno-check',
      START_MUENZEN: '50000', WELTEN_DIR: '/tmp/ameisen-probe',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let hoch = '';
  kind.stderr.on('data', (d) => { hoch += d.toString(); });
  await warte(2500);
  if (kind.exitCode !== null) {
    console.log(`Die eigene Fassung kam nicht hoch:\n${hoch.slice(0, 600)}`);
    process.exit(1);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE',
});

const page = await ctx.newPage();
const konsole = [];
const fehlgeschlagen = [];
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text()); });
page.on('pageerror', (e) => konsole.push(`Seitenfehler: ${e.message}`));
page.on('requestfailed', (r) => fehlgeschlagen.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) fehlgeschlagen.push(`${r.status()} ${r.url()}`); });

console.log(`Ameisen im Browser (${BASIS}${PFAD})\n`);

// ── A01 ────────────────────────────────────────────────────────────────────
const antwort = await page.goto(`${BASIS}${PFAD}`, { waitUntil: 'networkidle' });
pruefe(antwort?.status() === 200, `A01 Seite antwortet mit ${antwort?.status()}`);
await page.waitForFunction(() => S.dabei === true, null, { timeout: 12000 });
pruefe(konsole.length === 0, `A01 Konsole still (${konsole.join(' | ') || 'nichts'})`);
pruefe(fehlgeschlagen.length === 0, `A01 nichts fehlt (${fehlgeschlagen.join(' | ') || 'nichts'})`);

// Die Begruessung steht ueber dem Bau und muss weggehen.
await page.click('#wegZu');
pruefe(await page.locator('#weg').isHidden(), 'A01 Begruessung laesst sich schliessen');

// ── A02 ────────────────────────────────────────────────────────────────────
{
  await warte(1200);
  const lage = await page.evaluate(() => ({
    ameisen: ameisen.length,
    futter: futter.length,
    ausgaenge: S.ausgaenge.length,
    stand: S.stand?.ameisen ?? 0,
    kopf: !document.getElementById('kopf').hasAttribute('hidden'),
    fuss: !document.getElementById('fuss').hasAttribute('hidden'),
  }));
  pruefe(lage.ameisen === 3 && lage.stand === 3, `A02 drei Ameisen laufen (${lage.ameisen})`);
  pruefe(lage.futter > 0, `A02 es liegt Futter herum (${lage.futter} Stueck)`);
  pruefe(lage.ausgaenge === 1, `A02 ein Ausgang (${lage.ausgaenge})`);
  pruefe(lage.kopf && lage.fuss, 'A02 Zahlen oben und Beutel unten stehen');

  // Die Leinwand darf nicht leer sein - ein schwarzes Bild waere von aussen
  // nicht von einem fertigen Spiel zu unterscheiden.
  const bunt = await page.evaluate(() => {
    const c = document.getElementById('feld');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const farben = new Set();
    for (let i = 0; i < d.length; i += 4 * 997) {
      farben.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    }
    return farben.size;
  });
  pruefe(bunt > 6, `A02 die Leinwand ist wirklich gemalt (${bunt} Farbtoene)`);
}

// ── A03 ────────────────────────────────────────────────────────────────────
{
  const vorher = await page.evaluate(() => S.stand.beutel);
  const box = await page.locator('#feld').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForFunction((v) => S.stand.beutel < v, vorher, { timeout: 6000 })
    .catch(() => {});
  const nachher = await page.evaluate(() => S.stand.beutel);
  pruefe(nachher === vorher - 1, `A03 ein Korn weniger im Beutel (${vorher} -> ${nachher})`);

  // Auf den Huegel selbst darf nichts fallen.
  const aufHuegel = await page.evaluate(() => {
    const vor = S.stand.beutel;
    const c = document.getElementById('feld').getBoundingClientRect();
    const ev = new PointerEvent('pointerdown', {
      clientX: c.left + c.width / 2, clientY: c.top + c.height / 2, bubbles: true,
    });
    document.getElementById('feld').dispatchEvent(ev);
    return vor;
  });
  await warte(700);
  const jetzt = await page.evaluate(() => S.stand.beutel);
  pruefe(jetzt >= aufHuegel, `A03 der Huegel kostet kein Korn (${aufHuegel} -> ${jetzt})`);
}

// ── A04 und A05 ────────────────────────────────────────────────────────────
if (EIGEN) {
  await page.click('#ladenBtn');
  pruefe(await page.locator('#laden').isVisible(), 'A04 der Laden geht auf');

  const zeile = page.locator('#ladenListe li[data-id="ameise"]');
  const preisVorher = await page.evaluate(() => S.stand.preise.ameise);
  const kasseVorher = await page.evaluate(() => S.stand.muenzen);
  await zeile.locator('.kauf').click();
  await page.waitForFunction(() => S.stand.stufen.ameise === 1, null, { timeout: 6000 })
    .catch(() => {});
  const nach = await page.evaluate(() => ({
    stufe: S.stand.stufen.ameise,
    preis: S.stand.preise.ameise,
    kasse: S.stand.muenzen,
    knopf: document.querySelector('#ladenListe li[data-id="ameise"] .kauf').textContent,
    stufeText: document.querySelector('#ladenListe li[data-id="ameise"] .stufe').textContent,
  }));
  pruefe(nach.stufe === 1, `A04 die Stufe steht auf ${nach.stufe}`);
  pruefe(nach.preis > preisVorher, `A04 der Preis steigt (${preisVorher} -> ${nach.preis})`);
  pruefe(nach.kasse < kasseVorher, `A04 die Kasse sinkt (${kasseVorher} -> ${nach.kasse})`);
  pruefe(nach.knopf.includes(String(nach.preis).slice(0, 2)), `A04 der Knopf zeigt den neuen Preis (${nach.knopf})`);
  pruefe(nach.stufeText.includes('1'), `A04 die Zeile zeigt die Stufe (${nach.stufeText})`);
  await warte(800);
  pruefe(await page.evaluate(() => ameisen.length) === 4, 'A04 die gekaufte Ameise laeuft mit');

  // A05: der zweite Ausgang muss auch auf der Leinwand ankommen.
  await page.locator('#ladenListe li[data-id="ausgang"] .kauf').click();
  await page.waitForFunction(() => S.ausgaenge.length === 2, null, { timeout: 6000 })
    .catch(() => {});
  pruefe(await page.evaluate(() => S.ausgaenge.length) === 2, 'A05 der zweite Ausgang ist da');
  await page.click('#ladenZu');
  pruefe(await page.locator('#laden').isHidden(), 'A05 der Laden geht wieder zu');
} else {
  console.log('  – A04/A05 brauchen eine eigene Fassung mit Kasse (ohne BASIS starten)');
}

// ── A06 ────────────────────────────────────────────────────────────────────
{
  const ueber = await page.evaluate(() => {
    const b = document.documentElement.getBoundingClientRect();
    const raus = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null && el !== document.body) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > b.width + 1 || r.left < -1) raus.push(`${el.id || el.className || el.tagName}`);
    }
    return { raus, scroll: document.documentElement.scrollWidth, breite: b.width };
  });
  pruefe(ueber.scroll <= ueber.breite + 1, `A06 keine Seitenrolle (${ueber.scroll} bei ${ueber.breite})`);
  pruefe(ueber.raus.length === 0, `A06 nichts laeuft seitlich heraus (${ueber.raus.join(', ') || 'nichts'})`);
}

// ── A07 ────────────────────────────────────────────────────────────────────
{
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
  pruefe(bilder >= 30, `A07 Bildrate ${bilder}/s (mindestens 30)`);
}

// ── A08 ────────────────────────────────────────────────────────────────────
{
  const vorher = await page.evaluate(() => localStorage.getItem('ameisen_bau'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => S.dabei === true, null, { timeout: 12000 });
  const nachher = await page.evaluate(() => ({
    kennung: localStorage.getItem('ameisen_bau'),
    neu: S.stand ? null : true,
    stufe: S.stand?.stufen?.ameise ?? 0,
  }));
  pruefe(nachher.kennung === vorher, 'A08 dieselbe Kennung nach dem Neuladen');
  if (EIGEN) pruefe(nachher.stufe === 1, `A08 der gekaufte Ausbau ist noch da (Stufe ${nachher.stufe})`);
}

// ── A09 ────────────────────────────────────────────────────────────────────
pruefe(konsole.length === 0, `A09 Konsole auch danach still (${konsole.join(' | ') || 'nichts'})`);

await browser.close();
if (kind) { kind.kill('SIGTERM'); await warte(400); }

if (fehler.length) {
  console.log(`\n${fehler.length} Fehler.`);
  process.exit(1);
}
console.log('\nAlles gruen.');
