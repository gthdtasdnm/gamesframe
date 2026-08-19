// Browserprobe fuer den 18+-Stapel in „Wer am ehesten".
//
// Der Server kennt keine Abfrage - die haengt vollstaendig im Client, und
// damit ist sie genau die Sorte Sache, die eine Serverprobe nicht sieht.
// Geprueft wird:
//
//   1. Der Knopf ist da und der Modus laesst sich NICHT ohne Abfrage stellen.
//   2. „Lieber harmlos" faellt auf harmlos zurueck, nicht auf 18+.
//   3. „Ich bin 18 oder aelter" stellt um und merkt sich das.
//   4. Wer ueber einen geteilten Link in einen 18+-Raum kommt, wird gefragt,
//      auch wenn er die Raumliste nie gesehen hat.
//   5. Im 18+-Raum kommen tatsaechlich Fragen aus SCHMUTZIG.
//
//   node pruefe-amehesten-ab18.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASIS = process.env.BASIS ?? 'https://inf-zeus.de';
const URL = `${BASIS}/amehesten/`;

const quelle = readFileSync('/var/www/html/amehesten/fragen.js', 'utf8');
const schmutzig = new Set(
  quelle.split('export const SCHMUTZIG = [')[1].split('\n];')[0]
    .split('\n').map((z) => z.trim())
    .filter((z) => z.startsWith('"'))
    .map((z) => z.slice(1, z.lastIndexOf('"'))),
);
if (schmutzig.size < 100) throw new Error('SCHMUTZIG nicht gelesen: ' + schmutzig.size);

const fehler = [];
const muss = (b, t) => { if (!b) fehler.push(t); else console.log('  ok  ' + t); };

const browser = await chromium.launch();
// Ein eigener Kontext je Person - sonst teilen sie sich den `localStorage`,
// und die Bestaetigung des einen gaelte auch fuer die anderen. Genau das soll
// dieser Test ja auseinanderhalten.
const neuerKopf = () => browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'de-DE' });

// --- 1 bis 3: die Abfrage auf der Startseite --------------------------------
const host = await (await neuerKopf()).newPage();
host.on('pageerror', (e) => fehler.push('JS-Fehler: ' + e.message));
await host.goto(URL, { waitUntil: 'networkidle' });

muss(await host.locator('.seg[data-modus="ab18"]').count() === 1, 'der 18+-Knopf steht auf der Startseite');

await host.click('.seg[data-modus="ab18"]');
await host.waitForTimeout(300);
muss(await host.isVisible('#ab18Gate'), 'die Abfrage kommt, bevor der Modus steht');
muss(!(await host.locator('.seg[data-modus="ab18"]').getAttribute('class')).includes('sel'),
  'ohne Bestaetigung ist 18+ nicht ausgewaehlt');

await host.click('#ab18Nein');
await host.waitForTimeout(200);
muss(!(await host.isVisible('#ab18Gate')), 'Abbrechen schliesst die Abfrage');
muss((await host.locator('.seg[data-modus="harmlos"]').getAttribute('class')).includes('sel'),
  '„Lieber harmlos" faellt auf harmlos zurueck');

await host.click('.seg[data-modus="ab18"]');
await host.waitForTimeout(250);
await host.click('#ab18Ja');
await host.waitForTimeout(250);
muss((await host.locator('.seg[data-modus="ab18"]').getAttribute('class')).includes('sel'),
  'nach der Bestaetigung steht der Modus auf 18+');
muss(await host.evaluate(() => localStorage.getItem('amehesten_ab18')) === 'ja',
  'die Bestaetigung ist gemerkt');

// --- Raum aufmachen ---------------------------------------------------------
await host.fill('#name', 'Wirt');
await host.click('[data-vis="private"]');
await host.click('#createBtn');
await host.waitForSelector('#screen-lobby.active', { timeout: 8000 });
const code = (await host.textContent('#roomCode')).trim();
muss(/^[A-Z0-9]{4}$/.test(code), `Raum steht: ${code}`);
muss((await host.textContent('#roomVis')).includes('Schmutzig'),
  'im Warteraum steht, dass 18+ gespielt wird');

// --- 4: ueber den geteilten Link hinein, ohne je die Liste gesehen zu haben --
const gaeste = [];
for (const name of ['Gast1', 'Gast2']) {
  // Frischer Kopf: dieser Gast hat nie bestaetigt und die Raumliste nie
  // gesehen - er kommt nur mit dem Code herein.
  const p = await (await neuerKopf()).newPage();
  p.on('pageerror', (e) => fehler.push('JS-Fehler: ' + e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.fill('#name', name);
  await p.fill('#codeInput', code);
  await p.click('#joinBtn');
  await p.waitForSelector('#screen-lobby.active', { timeout: 8000 });
  await p.waitForTimeout(400);
  muss(await p.isVisible('#ab18Gate'), `${name} wird beim Beitritt ueber den Code gefragt`);
  await p.click('#ab18Ja');
  await p.waitForTimeout(200);
  await p.click('#readyBtn');
  gaeste.push(p);
}

await host.waitForTimeout(600);
await host.click('#startBtn');
await host.waitForSelector('#screen-game.active', { timeout: 8000 });
await host.waitForTimeout(400);

// --- 5: die Frage kommt wirklich aus dem 18+-Stapel -------------------------
const gesehen = [];
for (let i = 0; i < 4; i++) {
  const frage = (await host.textContent('#frageText')).trim();
  gesehen.push(frage);
  muss(schmutzig.has(frage), `Runde ${i + 1} zieht aus SCHMUTZIG: „${frage}"`);
  await host.click('#aktionen button:has-text("Andere Frage")').catch(() => {});
  await host.waitForTimeout(400);
}
muss(new Set(gesehen).size > 1, 'die Fragen wechseln beim Tauschen');
muss((await host.textContent('#modusTag')).includes('18+'), 'der Spielbildschirm zeigt den Stapel an');

await host.screenshot({ path: '/root/werkzeug-screenshots/_amehesten-ab18.png' });

await browser.close();
if (fehler.length) {
  console.log('\nFEHLER:');
  for (const f of fehler) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('\nALLES GRÜN');
