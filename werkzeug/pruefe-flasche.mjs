// Prueft „Flaschendrehen" im echten Browser – und zwar genau das, was die
// serverseitige probe.js **nicht** sehen kann: ob die Flasche auf dem Schirm
// tatsaechlich auf die Person zeigt, die der Server ausgewaehlt hat.
//
// Anlass: der Client hatte einen -90-Grad-Versatz in der Platzierung, den der
// Server nicht kennt. Die Probe war gruen, die Namen standen richtig im Kreis,
// die Markierung sass auf der richtigen Person – und die Flasche zeigte
// trotzdem eine Vierteldrehung daneben. So etwas faellt nur am gerenderten
// Bild auf.
//
//   node pruefe-flasche.mjs

import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const fehler = [];
const namen = ['Ata', 'Mira', 'Nuri', 'Jo', 'Sam'];
const seiten = [];

for (const name of namen) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fehler.push(`${name}: ${e.message}`));
  await page.goto(`${BASIS}/flasche/`, { waitUntil: 'networkidle' });
  await page.fill('#name', name);
  seiten.push(page);
}
const [host, ...gaeste] = seiten;
console.log('ok  fünf Sitzungen geladen');

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
await warte(600);
console.log(`ok  Raum ${code}, Partie läuft`);

/** Die tatsaechliche Drehung der Flasche aus der Matrix im DOM lesen. */
async function flaschenWinkel(page) {
  return await page.$eval('#flasche', (el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    // Bei einer reinen Drehung liefert atan2(b, a) den Drehwinkel selbst –
    // keinen Richtungsvektor. Ein Versatz waere hier also falsch: die Flasche
    // zeigt bei 0 Grad nach oben, und genau darauf bezieht sich auch --grad
    // der Plätze.
    const g = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    return ((g % 360) + 360) % 360;
  });
}

/** Der Winkel, an dem ein Platz im Kreis liegt – aus dessen eigener --grad. */
async function platzWinkel(page, name) {
  return await page.$$eval('.platz', (els, n) => {
    const el = els.find((e) => e.querySelector('.platz-name')?.textContent.trim().startsWith(n));
    if (!el) return null;
    const g = parseFloat(el.style.getPropertyValue('--grad'));
    return ((g % 360) + 360) % 360;
  }, name);
}

let geprueft = 0;
for (let runde = 1; runde <= 3; runde++) {
  // Wer dran ist, hat den grossen Knopf.
  let dreher = null;
  for (const s of seiten) {
    const t = (await s.textContent('#phasenText')).trim();
    if (t === 'Du drehst') { dreher = s; break; }
  }
  if (!dreher) throw new Error(`Runde ${runde}: niemand hat den Drehknopf`);
  await dreher.click('#aktionen .btn.primary');

  await host.waitForFunction(() => {
    const t = document.getElementById('phasenText')?.textContent ?? '';
    return /zeigt auf/.test(t);
  }, { timeout: 20000 });
  // Die CSS-Transition muss ausgelaufen sein, sonst misst man mitten in der
  // Drehung.
  await warte(900);

  // Auf wen zeigt das Spiel laut Text und Markierung?
  const text = (await host.textContent('#phasenText')).trim();
  const ziel = (await host.$eval('.platz.ziel .platz-name', (e) => e.textContent.trim()))
    .replace(' (du)', '');
  if (!text.includes(ziel) && text !== 'Sie zeigt auf dich') {
    throw new Error(`Text „${text}" passt nicht zur Markierung auf ${ziel}`);
  }

  // Und wohin zeigt die Flasche wirklich?
  const wFlasche = await flaschenWinkel(host);
  const wPlatz = await platzWinkel(host, ziel);
  if (wPlatz === null) throw new Error(`Platz von ${ziel} nicht gefunden`);
  const abstand = Math.min(
    Math.abs(wFlasche - wPlatz),
    360 - Math.abs(wFlasche - wPlatz),
  );
  // Grosszuegig, aber weit unter einem Platzabstand (bei fünf Leuten 72°).
  if (abstand > 8) {
    throw new Error(
      `Die Flasche zeigt auf ${wFlasche.toFixed(1)}°, ${ziel} sitzt bei ` +
      `${wPlatz.toFixed(1)}° – ${abstand.toFixed(1)}° daneben`);
  }
  console.log(`ok  R${runde}: Flasche bei ${wFlasche.toFixed(1)}°, ${ziel} bei ` +
    `${wPlatz.toFixed(1)}° (${abstand.toFixed(1)}° Abweichung)`);
  geprueft++;

  // Alle fuenf muessen dieselbe Person markiert haben.
  for (const s of seiten) {
    const z = (await s.$eval('.platz.ziel .platz-name', (e) => e.textContent.trim()))
      .replace(' (du)', '');
    if (z !== ziel) throw new Error(`Ein Client markiert ${z} statt ${ziel}`);
  }

  // Weiter: die getroffene Person waehlt und schliesst ab.
  for (const s of seiten) {
    const w = s.locator('#aktionen .btn.wahl.wahrheit');
    if (await w.count()) { await w.click(); break; }
  }
  await host.waitForSelector('#karte:not([hidden])', { timeout: 15000 });
  const karte = (await host.textContent('#karteText')).trim();
  if (!karte) throw new Error('Karte ohne Text');
  for (const s of seiten) {
    const f = s.locator('#aktionen .btn.primary');
    if (await f.count()) { await f.click(); break; }
  }
  await warte(700);
}

if (geprueft < 3) throw new Error('Es wurden nicht drei Drehungen geprüft');
console.log('ok  alle fünf Geräte markieren dieselbe Person');

if (fehler.length) throw new Error('Seitenfehler: ' + fehler.join(' | '));
console.log('\nALLES GRÜN');

await browser.close();
