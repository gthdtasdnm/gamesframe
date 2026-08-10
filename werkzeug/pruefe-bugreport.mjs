// Prueft den Bugreport gegen die Live-Seite: baut sich die Spieleliste aus
// spiele.json auf, wirkt der Filter, und fuehrt der Anleitungsdialog der
// Uebersicht mit vorgewaehltem Spiel dorthin?
import { chromium } from 'playwright';

const ZIEL = process.env.ZIEL ?? 'https://inf-zeus.de';
const AUS = process.argv[2] ?? '/tmp';
const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 390, height: 844 } });
const fehler = [];
seite.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
seite.on('pageerror', (e) => fehler.push(String(e)));

const soll = await (await fetch(ZIEL + '/bugreport/api/spiele')).json();
console.log('api/spiele:', soll.spiele.length, 'Spiele,', soll.alt.length, 'abgeschaltete');

// --- Formular -------------------------------------------------------------
await seite.goto(ZIEL + '/bugreport/?spiel=snake', { waitUntil: 'networkidle' });
const optionen = await seite.$$eval('#spiel option', (o) => o.map((x) => x.value));
console.log('Auswahlfeld:', optionen.length - 1, 'Spiele + Platzhalter');
console.log('?spiel=snake vorgewaehlt:', await seite.inputValue('#spiel'));
if (optionen.length - 1 !== soll.spiele.length) throw new Error('Formular und API sind nicht gleich lang');
await seite.screenshot({ path: AUS + '/bugreport-formular.png', fullPage: true });

// --- Liste und Filter -----------------------------------------------------
await seite.click('[data-tab="liste"]');
await seite.waitForTimeout(800);
const filter = await seite.$$eval('#filterSpiel option', (o) => o.length);
console.log('Filterfeld:', filter - 1, 'Spiele + „Alle Spiele"');
await seite.click('[data-filter-status=""]');
await seite.waitForTimeout(200);
const alleKarten = (await seite.$$('.bug')).length;
await seite.selectOption('#filterSpiel', soll.spiele[0].name);
await seite.waitForTimeout(200);
console.log('Karten: alle', alleKarten, '/ gefiltert auf', soll.spiele[0].titel + ':', (await seite.$$('.bug')).length);
await seite.selectOption('#filterSpiel', '');
await seite.waitForTimeout(200);
await seite.screenshot({ path: AUS + '/bugreport-liste.png', fullPage: true });

// --- Adminseite: bis zur Anmeldung, weiter geht es ohne Passwort nicht ----
await seite.goto(ZIEL + '/bugreport/admin', { waitUntil: 'networkidle' });
console.log('Admin-Filterfeld:', (await seite.$$('#filterSpiel option')).length - 1, 'Spiele');

// --- Uebersicht: fuehrt jeder Dialog zum passenden Spiel? -----------------
await seite.goto(ZIEL + '/spiele/', { waitUntil: 'networkidle' });
const knoepfe = await seite.$$('.info');
const ziele = [];
for (const knopf of knoepfe) {
  await knopf.click();
  await seite.waitForTimeout(60);
  ziele.push(await seite.getAttribute('#spielMelden', 'href'));
  await seite.keyboard.press('Escape');
  await seite.waitForTimeout(40);
}
console.log('Kacheln mit Meldelink:', ziele.length);
const fehlend = ziele.filter((h) => !/^\/bugreport\/\?spiel=[a-z0-9]+$/.test(h ?? ''));
if (fehlend.length) throw new Error('Kaputte Meldelinks: ' + fehlend.join(', '));
const namen = ziele.map((h) => h.split('=')[1]);
const unbekannt = namen.filter((n) => !soll.spiele.some((s) => s.name === n));
if (unbekannt.length) throw new Error('Kacheln zeigen auf unbekannte Spiele: ' + unbekannt.join(', '));
console.log('Alle Meldelinks zeigen auf Spiele, die der Bugreport kennt.');
await seite.click('.info');
await seite.waitForTimeout(120);
await seite.screenshot({ path: AUS + '/uebersicht-dialog.png' });

console.log(fehler.length ? 'KONSOLENFEHLER: ' + fehler.join(' | ') : 'Konsole sauber');
await browser.close();
