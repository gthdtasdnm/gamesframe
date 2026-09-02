import { chromium } from 'playwright';
const URL = 'https://inf-zeus.de/0913bf53f6a1/';
const b = await chromium.launch();
const k = await b.newContext({
    // Deutscher Browser: die Seiten sind dreisprachig und richten sich
    // beim ersten Besuch nach der Spracheinstellung.
    locale: "de-DE", httpCredentials: { username: 'zeus', password: '84YQe1URkfTJ' },
  viewport: { width: 900, height: 1200 } });
const s = await k.newPage();
const fehler = [];
s.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
s.on('pageerror', (e) => fehler.push('pageerror: ' + e.message));
await s.goto(URL, { waitUntil: 'networkidle' });
await s.waitForSelector('.zeile', { timeout: 5000 });

const kacheln = await s.$$eval('.zahl', (n) => n.map((x) => x.querySelector('b').textContent + ' ' + x.querySelector('span').textContent));
const balken = (await s.$$('#verlauf div')).length;
const zeilen = await s.$$eval('.zeile', (n) => n.slice(0, 3).map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
console.log('Kacheln:', kacheln.join(' | '));
console.log('Verlaufsbalken:', balken);
console.log('Top 3:', zeilen);

// Umschalter durchklicken, danach ein Spiel waehlen
for (const t of ['14 Tage', '90 Tage', 'alles', '28 Tage']) await s.click(`#zeitraum button:text-is("${t}")`);
for (const t of ['7 Tage', 'gesamt', '28 Tage']) await s.click(`#kennzahl button:text-is("${t}")`);
await s.click('.zeile');
const titel = await s.textContent('#verlauf-titel');
console.log('Nach Klick auf erste Zeile:', titel, '| Balken:', (await s.$$('#verlauf div')).length);
await s.screenshot({ path: '/tmp/claude-0/-var-www-html/1f4f35e1-f0ac-4643-9bac-f07e032c9bd5/scratchpad/panel.png', fullPage: true });
console.log(fehler.length ? 'FEHLER: ' + fehler.join(' / ') : 'keine Konsolenfehler');
await b.close();
