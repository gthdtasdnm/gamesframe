// Prueft „Cubes" im echten Browser – und zwar das, was die serverseitige
// probe.js **nicht** sehen kann: was in den Quadraten steht und welche davon
// anfassbar sind.
//
// Anlass: die Beschriftung haing einmal am Wert statt an der Rundenart. Regel
// war „Wert 1 zeigt keine Zahl" – gedacht fuer Runde 1, wo jedes Quadrat 1
// wert ist. In Runde 3 stand damit ein **+1 ohne Zahl** im Raster, und genau
// dort ist die Zahl das Einzige, was ein Plus- von einem Minusfeld
// unterscheidet: die beiden sehen absichtlich gleich aus. Der Server war
// dabei die ganze Zeit richtig, die Probe gruen.
//
//   node pruefe-cubes.mjs

import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const fehler = [];
const namen = ['Ata', 'Mira', 'Nuri'];
const seiten = [];

for (const name of namen) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fehler.push(`${name}: ${e.message}`));
  await page.goto(`${BASIS}/cubes/`, { waitUntil: 'networkidle' });
  await page.fill('#name', name);
  seiten.push(page);
}
const [host, ...gaeste] = seiten;
console.log('ok  drei Sitzungen geladen');

await host.click('#createBtn');
await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
const code = (await host.textContent('#roomCode')).trim();
for (const g of gaeste) {
  await g.fill('#codeInput', code);
  await g.click('#joinBtn');
  await g.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  await g.click('#readyBtn');
}
await host.click('#startBtn');
await host.waitForSelector('#screen-game.active', { timeout: 15000 });
await warte(800);

/** Liest das Raster so aus, wie es dasteht. */
const raster = (page) =>
  page.evaluate(() => ({
    art: document.getElementById('artTag').textContent.trim(),
    zellen: [...document.querySelectorAll('.zelle')].map((el) => ({
      an: el.classList.contains('an'),
      mein: el.classList.contains('mein'),
      minus: el.classList.contains('minus'),
      text: el.querySelector('.zahl').textContent.trim(),
      zeiger: getComputedStyle(el).cursor,
    })),
  }));

const hostKnopf = async (text) => {
  const b = host.locator('#aktionen button', { hasText: text }).first();
  await b.waitFor({ timeout: 20000 });
  await b.click();
};

// --- Runde 1: volles Raster, eigene anfassbar, fremde nicht -----------------

{
  const { zellen } = await raster(host);
  if (zellen.length !== 25) throw new Error('Das Raster hat ' + zellen.length + ' Zellen');
  const belegt = zellen.filter((z) => z.an).length;
  if (belegt !== 25) throw new Error(`Raster nicht voll: ${belegt} von 25 besetzt`);
  console.log('ok  R1: alle 25 Zellen besetzt');

  const meine = zellen.filter((z) => z.mein);
  if (!meine.length) throw new Error('Kein einziges eigenes Quadrat');
  if (meine.length === 25) throw new Error('Alle Quadrate gehoeren einem – zu dritt unmoeglich');
  if (!meine.every((z) => z.zeiger === 'pointer')) {
    throw new Error('Ein eigenes Quadrat sieht nicht anfassbar aus');
  }
  if (zellen.filter((z) => z.an && !z.mein).some((z) => z.zeiger === 'pointer')) {
    throw new Error('Ein fremdes Quadrat lockt mit dem Zeigefinger');
  }
  console.log(`ok  R1: ${meine.length} eigene mit Zeigefinger, die fremden ohne`);

  if (zellen.some((z) => z.an && z.text !== '')) {
    throw new Error('In Runde 1 steht eine Zahl im Quadrat: ' +
      zellen.find((z) => z.an && z.text !== '').text);
  }
  console.log('ok  R1: keine Zahlen – es geht nur ums Tempo');
}

// Ein fremdes Quadrat anzuklicken darf nichts tun. Das prueft hier nicht die
// Regel (das macht probe.js am Server), sondern dass der Client sie nicht
// heimlich umgeht.
{
  const vorher = await host.textContent('.chip.me .chip-zahl');
  const fremd = host.locator('.zelle.an:not(.mein)').first();
  await fremd.click({ timeout: 2000 }).catch(() => {});
  await warte(400);
  const nachher = await host.textContent('.chip.me .chip-zahl');
  if (vorher !== nachher) throw new Error('Klick auf ein fremdes Quadrat hat gepunktet');
  console.log('ok  R1: Klick auf ein fremdes Quadrat bleibt folgenlos');
}

// --- Runde 2: in jedem Quadrat die Restzahl 1 bis 4 -------------------------

await hostKnopf('Runde beenden');
await hostKnopf('Weiter');
await host.waitForSelector('#raster:not([hidden])', { timeout: 15000 });
await warte(900);

{
  const { zellen } = await raster(host);
  const besetzt = zellen.filter((z) => z.an);
  if (besetzt.length !== 25) throw new Error('R2: Raster nicht voll');
  for (const z of besetzt) {
    if (!/^[1-4]$/.test(z.text)) {
      throw new Error(`R2: Quadrat zeigt „${z.text}" statt einer Restzahl 1–4`);
    }
  }
  console.log('ok  R2: jedes Quadrat zeigt seine Restzahl (1–4)');
}

// --- Runde 3: jedes Quadrat mit Vorzeichen, auch die Einsen -----------------

await hostKnopf('Runde beenden');
await hostKnopf('Weiter');
await host.waitForSelector('#raster:not([hidden])', { timeout: 15000 });
await warte(900);

{
  const { zellen } = await raster(host);
  const besetzt = zellen.filter((z) => z.an);
  if (besetzt.length !== 25) throw new Error('R3: Raster nicht voll');

  for (const z of besetzt) {
    // Genau hier lag der Fehler: ein „+1" kam ohne Zahl heraus.
    if (!/^[+−][1-3]$/.test(z.text)) {
      throw new Error(`R3: Quadrat zeigt „${z.text}" statt +1…+3 oder −1…−3`);
    }
    if (z.minus !== z.text.startsWith('−')) {
      throw new Error(`R3: Vorzeichen „${z.text}" passt nicht zum Minus-Merkmal`);
    }
  }
  const einsen = besetzt.filter((z) => /[1]$/.test(z.text)).length;
  console.log(`ok  R3: alle 25 mit Vorzeichen beschriftet, darunter ${einsen} Einser`);

  // Und der Kern der Runde: Minus sieht aus wie Plus. Waeren die Minusfelder
  // anders gemustert oder gerahmt, waere die Falle keine.
  const unterschied = await host.evaluate(() => {
    const plus = document.querySelector('.zelle.mein.an:not(.minus)');
    const minus = document.querySelector('.zelle.mein.an.minus');
    if (!plus || !minus) return null;
    const a = getComputedStyle(plus), b = getComputedStyle(minus);
    return ['backgroundImage', 'boxShadow', 'borderColor']
      .filter((k) => a[k] !== b[k]);
  });
  if (unterschied === null) {
    console.log('--  R3: gerade kein eigenes Paar aus Plus und Minus im Bild, Optik nicht geprüft');
  } else if (unterschied.length) {
    throw new Error('R3: Minusfeld sieht anders aus als Plusfeld (' +
      unterschied.join(', ') + ') – dann ist es keine Falle mehr');
  } else {
    console.log('ok  R3: eigenes Minusfeld sieht aus wie ein eigenes Plusfeld');
  }
}

if (fehler.length) throw new Error('Seitenfehler: ' + fehler.join(' | '));
console.log('\nALLES GRÜN');

await browser.close();
