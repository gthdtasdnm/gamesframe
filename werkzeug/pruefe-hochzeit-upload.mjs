// Prüft die Hochladen-Seite der Hochzeit in einem echten Browser, am
// Handy-Schirm.
//
// Anlass: wer im Dateimanager 150 Bilder bestätigt hat, sah danach minutenlang
// nichts. Das Betriebssystem packt in dieser Zeit HEIC aus und holt Bilder aus
// der Cloud – die Seite erfährt davon erst mit dem change-Ereignis. Bis dahin
// stand sie stumm da, und die Leute tippten ein zweites Mal oder gaben auf.
// Über HTTP ist das nicht zu sehen; es braucht einen Browser, der die Lücke
// zwischen Antippen und Ankommen tatsächlich durchlebt.
//
//   GAST=<wort> node pruefe-hochzeit-upload.mjs
//
// Teil 1 hält den Dateimanager absichtlich sieben Sekunden offen und schaut,
// was in der Zeit auf der Seite steht. Teil 2 lädt wirklich hoch – gegen einen
// abgefangenen Server, damit keine Probe-Bilder in der Galerie landen.

import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASIS = process.env.BASIS || 'https://inf-zeus.de/hochzeit';
const WORT = process.env.GAST || 'hochzeit2026';
const ANZAHL = Number(process.env.ANZAHL || 150);
const HANDY = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

let fehler = 0;
const ok = (b, t) => { console.log((b ? '  ✓ ' : '  ✗ ') + t); if (!b) fehler++; };

// Ein winziges gültiges JPEG – vervielfältigt reicht es, um die Liste zu füllen.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

const ordner = await mkdtemp(join(tmpdir(), 'hochzeit-upload-'));
const viele = [];
for (let i = 0; i < ANZAHL; i++) {
  const p = join(ordner, `bild-${String(i).padStart(4, '0')}.jpg`);
  await writeFile(p, JPEG);
  viele.push(p);
}
const dicke = [];
for (let i = 0; i < 6; i++) {
  const p = join(ordner, `dick-${i}.jpg`);
  await writeFile(p, Buffer.alloc(9 * 1024 * 1024, i));   // 9 MB: drei Stücke
  dicke.push(p);
}

const browser = await chromium.launch();

// ── Teil 1: die Wartezeit zwischen Bestätigen und Ankommen ────────────────

{
  const seite = await browser.newPage(HANDY);
  const meckern = [];
  seite.on('pageerror', (e) => meckern.push(String(e)));
  seite.on('console', (m) => { if (m.type() === 'error') meckern.push(m.text()); });
  await seite.goto(`${BASIS}/hochladen?k=${WORT}`, { waitUntil: 'networkidle' });

  console.log('1. Rückmeldung, solange das Gerät noch arbeitet');
  let waehler = null;
  seite.on('filechooser', (f) => { waehler = f; });
  await seite.getByRole('button', { name: /Auswählen/ }).click();

  await seite.waitForTimeout(700);
  ok(await seite.locator('#warten').isVisible(), 'sofort steht etwas da, die Seite ist nicht still');
  const frueh = (await seite.locator('#warten').innerText()).replace(/\s+/g, ' ');
  ok(/geöffnet/.test(frueh), `erste Meldung: ${frueh.slice(0, 40)}`);

  await seite.waitForTimeout(6500);
  const spaet = (await seite.locator('#warten').innerText()).replace(/\s+/g, ' ');
  ok(/bereitet die Bilder vor/.test(spaet), 'nach Sekunden: das Gerät bereitet die Bilder vor');
  ok(/\(\d+ s\)/.test(spaet), 'eine mitlaufende Uhr zeigt, dass es weitergeht');
  ok(await seite.locator('#warten button').isVisible(), 'ein Knopf beendet das Warten von Hand');

  console.log('\n2. Was nach dem Bestätigen passiert');
  const angefangen = Date.now();
  await waehler.setFiles(viele);
  await seite.locator('#gesamt').waitFor({ state: 'visible', timeout: 30000 });
  await seite.waitForFunction((n) => document.querySelectorAll('#liste li').length === n, ANZAHL, { timeout: 30000 });
  console.log(`  (${ANZAHL} Dateien eingelesen in ${Date.now() - angefangen} ms)`);
  ok(!(await seite.locator('#warten').isVisible()), 'der Wartekasten ist wieder weg');
  const stand = await seite.locator('#gesamt-text').innerText();
  ok(new RegExp(`${ANZAHL} Dateien ausgewählt`).test(stand), `Bestätigung in Zahlen: ${stand}`);
  ok(/Bereit/.test(await seite.locator('#meldung').innerText()), 'und im Klartext, was jetzt zu tun ist');

  console.log('\n3. Der Knopf ist erreichbar, nicht 150 Zeilen tiefer');
  const knopf = await seite.locator('#starten').boundingBox();
  const ersteZeile = await seite.locator('#liste li').first().boundingBox();
  ok(knopf.y < ersteZeile.y, 'Hochladen steht über der Liste');
  ok(await seite.locator('#starten').isVisible(), 'und ist ohne Scrollen im Bild');

  console.log('\n4. Zweimal antippen macht keine Dubletten');
  let nochmal = null;
  seite.on('filechooser', (f) => { nochmal = f; });
  await seite.getByRole('button', { name: /Auswählen/ }).click();
  await seite.waitForTimeout(300);
  await nochmal.setFiles(viele.slice(0, 20));
  await seite.waitForTimeout(1500);
  const nachher = await seite.locator('#liste li').count();
  ok(nachher === ANZAHL, `die Liste bleibt bei ${nachher} Zeilen`);
  ok(/schon in der Liste/.test(await seite.locator('#gesamt-text').innerText()), 'und sagt, dass es dieselben waren');

  ok(meckern.length === 0, meckern.length ? `Konsole: ${meckern[0]}` : 'keine Fehler in der Konsole');
  await seite.close();
}

// ── Teil 2: der Lauf selbst, gegen einen Server aus Papier ────────────────

{
  const seite = await browser.newPage(HANDY);
  const meckern = [];
  seite.on('pageerror', (e) => meckern.push(String(e)));
  seite.on('console', (m) => { if (m.type() === 'error') meckern.push(m.text()); });

  const angekommen = new Map();
  let nr = 0;
  await seite.route('**/api/upload/**', async (route) => {
    const r = route.request();
    const pfad = new URL(r.url()).pathname;
    const antwort = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (pfad.endsWith('/start')) {
      const sid = 's' + (++nr);
      angekommen.set(sid, 0);
      return antwort({ sid, empfangen: 0 });
    }
    if (pfad.endsWith('/fertig')) return antwort({ ok: true });
    const sid = pfad.split('/').filter(Boolean).at(-1);
    if (r.method() === 'PUT') {
      angekommen.set(sid, angekommen.get(sid) + (r.postDataBuffer()?.length || 0));
    }
    return antwort({ empfangen: angekommen.get(sid) || 0 });
  });

  await seite.goto(`${BASIS}/hochladen?k=${WORT}`, { waitUntil: 'networkidle' });
  await seite.locator('#dateien').setInputFiles(dicke);
  await seite.locator('#gesamt').waitFor({ state: 'visible' });

  console.log('\n5. Während des Hochladens');
  await seite.locator('#starten').click();
  await seite.waitForTimeout(400);
  ok(await seite.locator('#gesamt.laeuft').isVisible(), 'der Gesamtstand hängt sich an den unteren Rand');
  const kasten = await seite.locator('#gesamt').boundingBox();
  ok(kasten.y + kasten.height <= HANDY.viewport.height + 1, 'und bleibt im Bild, egal wie weit man scrollt');
  const zwischen = await seite.locator('#gesamt-text').innerText();
  ok(/Datei \d+ von 6/.test(zwischen), `Zählwerk läuft: ${zwischen}`);
  const breite = await seite.locator('#gesamt-fuellung').evaluate((e) => e.style.width);
  ok(breite && breite !== '0%', `der Balken bewegt sich (${breite})`);

  console.log('\n6. Am Ende');
  await seite.locator('#meldung').waitFor({ state: 'visible', timeout: 60000 });
  await seite.waitForFunction(() => !document.getElementById('starten').disabled, null, { timeout: 60000 });
  ok(/Alles angekommen/.test(await seite.locator('#meldung').innerText()), 'die Schlussmeldung sagt, dass alles da ist');
  ok(!(await seite.locator('#gesamt.laeuft').count()), 'die Leiste löst sich wieder vom Rand');
  const fertige = await seite.locator('#liste li.fertig').count();
  ok(fertige === 6, `alle ${fertige} Zeilen stehen auf fertig`);
  ok([...angekommen.values()].every((b) => b === 9 * 1024 * 1024), 'beim Server kam jede Datei vollständig an');
  ok(meckern.length === 0, meckern.length ? `Konsole: ${meckern[0]}` : 'keine Fehler in der Konsole');
  await seite.close();
}

await browser.close();
await rm(ordner, { recursive: true, force: true });
console.log(fehler ? `\n${fehler} Fehler.` : '\nGrün.');
process.exit(fehler ? 1 : 0);
