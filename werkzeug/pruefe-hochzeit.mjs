// Prüft die Großansicht der Hochzeitsgalerie in einem echten Browser.
//
// Anlass: das Bild wurde nur an der Breite ausgerichtet und lief unten aus
// dem Schirm. Auf einem breiten Bildschirm war dadurch die Hälfte weg – ein
// Querformat auf 1900px Breite gezogen ist 1270px hoch, das Fenster aber nur
// 900px. Über HTTP ist so etwas nicht zu sehen; es braucht ein Layout.
//
// Gemessen statt geschaut: die Position des Bildes im Fenster gegen die
// Fenstergröße. Ein Screenshot beweist nichts, wenn ihn niemand ansieht.
//
//   GAST=<wort> node pruefe-hochzeit.mjs
//
// Verändert nichts: meldet sich nur an, klickt und misst.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASIS = 'https://inf-zeus.de/hochzeit';
const WORT = process.env.GAST || 'hochzeit2026';
const ZIEL = process.env.ZIEL || '/tmp/hochzeit-bilder';

const SCHIRME = [
  { name: 'Computer breit', width: 1920, height: 900 },
  { name: 'Computer klein', width: 1280, height: 720 },
  { name: 'Handy hoch', width: 390, height: 844, mobil: true },
];

let fehler = 0;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function pruefe(bedingung, was, warum) {
  console.log(`    ${bedingung ? '✓' : '✗'} ${was}${bedingung ? '' : '\n        ' + warum}`);
  if (!bedingung) fehler++;
}

await mkdir(ZIEL, { recursive: true });
const browser = await chromium.launch();

for (const schirm of SCHIRME) {
  console.log(`\n  ${schirm.name} (${schirm.width}x${schirm.height})`);
  const ctx = await browser.newContext({
    viewport: { width: schirm.width, height: schirm.height },
    isMobile: !!schirm.mobil,
    hasTouch: !!schirm.mobil,
    locale: 'de-DE',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const fehlerAufSeite = [];
  page.on('pageerror', (e) => fehlerAufSeite.push(e.message));

  await page.goto(`${BASIS}/?k=${encodeURIComponent(WORT)}`, { waitUntil: 'networkidle' });
  await page.goto(`${BASIS}/galerie`, { waitUntil: 'networkidle' });

  const kacheln = await page.locator('.kachel').count();
  if (kacheln === 0) {
    pruefe(false, 'Galerie zeigt Kacheln', 'keine einzige Kachel gefunden');
    await ctx.close();
    continue;
  }
  pruefe(true, `Galerie zeigt ${kacheln} Kacheln`);

  // Waagerechter Überlauf der Seite selbst – der klassische Handy-Fehler.
  const ueberlauf = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  pruefe(ueberlauf <= 0, 'kein waagerechter Überlauf', `${ueberlauf}px zu breit`);

  // Großansicht öffnen und das Bild vermessen.
  await page.locator('.kachel').first().click();
  await page.waitForSelector('.schau.auf', { timeout: 5000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('.schau-buehne img');
    return b && b.complete && b.naturalWidth > 0;
  }, { timeout: 15000 });
  await warte(400);

  const mass = await page.evaluate(() => {
    const bild = document.querySelector('.schau-buehne img');
    const leiste = document.querySelector('.schau-leiste');
    const b = bild.getBoundingClientRect();
    const l = leiste.getBoundingClientRect();
    return {
      bild: { oben: b.top, unten: b.bottom, links: b.left, rechts: b.right, h: b.height, w: b.width },
      leiste: { oben: l.top, unten: l.bottom },
      fenster: { w: innerWidth, h: innerHeight },
      natur: { w: bild.naturalWidth, h: bild.naturalHeight },
    };
  });

  const t = 1;   // ein Pixel Toleranz für Rundung
  pruefe(mass.bild.unten <= mass.fenster.h + t,
    'Bild endet innerhalb des Fensters',
    `Bild reicht bis ${Math.round(mass.bild.unten)}px, Fenster ist ${mass.fenster.h}px hoch ` +
    `– ${Math.round(mass.bild.unten - mass.fenster.h)}px abgeschnitten`);

  pruefe(mass.bild.oben >= -t, 'Bild beginnt innerhalb des Fensters',
    `Bild beginnt bei ${Math.round(mass.bild.oben)}px`);

  pruefe(mass.bild.unten <= mass.leiste.oben + t,
    'Bild liegt nicht unter der Knopfleiste',
    `Bild bis ${Math.round(mass.bild.unten)}px, Leiste beginnt bei ${Math.round(mass.leiste.oben)}px`);

  pruefe(mass.leiste.unten <= mass.fenster.h + t,
    'Knopfleiste ist vollständig sichtbar',
    `Leiste endet bei ${Math.round(mass.leiste.unten)}px von ${mass.fenster.h}px`);

  // Seitenverhältnis muss erhalten bleiben – sonst ist das Bild verzerrt.
  const sollVerhaeltnis = mass.natur.w / mass.natur.h;
  const istVerhaeltnis = mass.bild.w / mass.bild.h;
  pruefe(Math.abs(sollVerhaeltnis - istVerhaeltnis) < 0.02,
    'Bild ist nicht verzerrt',
    `Original ${sollVerhaeltnis.toFixed(3)}, angezeigt ${istVerhaeltnis.toFixed(3)}`);

  console.log(`      Bild ${Math.round(mass.bild.w)}x${Math.round(mass.bild.h)} ` +
    `bei y=${Math.round(mass.bild.oben)}..${Math.round(mass.bild.unten)}, ` +
    `Fenster ${mass.fenster.w}x${mass.fenster.h}`);

  // ── Bedienung ──────────────────────────────────────────────────────────
  // Nicht nur messen, ob es richtig aussieht, sondern klicken, ob es geht.
  // Anlass: nachdem das Bild absolut positioniert wurde, lag es über den
  // Pfeiltasten und fing deren Klicks ab – sichtbar waren sie weiterhin.
  // Ein Prüflauf, der nur Kästen vermisst, hätte das durchgewinkt.

  const trefferAn = async (auswahl) => await page.evaluate((s) => {
    const k = document.querySelector(s);
    const r = k.getBoundingClientRect();
    const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return oben === k || k.contains(oben);
  }, auswahl);

  pruefe(await trefferAn('.schau .blaettern.rechts'),
    'Weiter-Pfeil ist wirklich anklickbar', 'etwas anderes liegt darüber');
  pruefe(await trefferAn('.schau .zu'),
    'Schließen-Knopf ist wirklich anklickbar', 'etwas anderes liegt darüber');
  pruefe(await trefferAn('#schau-laden'),
    'Herunterladen-Knopf ist wirklich anklickbar', 'etwas anderes liegt darüber');

  // Klicks in try/catch: liegt etwas über dem Knopf, läuft Playwright in
  // eine Zeitüberschreitung und würde das Skript abbrechen – dann sähe
  // niemand die restlichen Prüfpunkte.
  const klick = async (auswahl) => {
    try {
      await page.locator(auswahl).click({ timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  };

  const standVor = await page.locator('#schau-angabe').innerText();
  const vor = await klick('.schau .blaettern.rechts');
  await warte(500);
  const standNach = await page.locator('#schau-angabe').innerText();
  pruefe(vor && standVor !== standNach,
    `Blättern wechselt das Bild (${standVor.trim()} -> ${standNach.trim()})`,
    vor ? `Anzeige blieb bei ${standVor.trim()}` : 'Klick kam nicht durch');

  const zurueck = await klick('.schau .blaettern.links');
  await warte(500);
  const standZurueck = await page.locator('#schau-angabe').innerText();
  pruefe(zurueck && standZurueck === standVor, 'Zurückblättern führt zum vorigen Bild',
    zurueck ? `${standZurueck.trim()} statt ${standVor.trim()}` : 'Klick kam nicht durch');

  // Auch die Tastatur – am Computer blättert man damit, nicht mit der Maus.
  await page.keyboard.press('ArrowRight');
  await warte(400);
  const nachTaste = await page.locator('#schau-angabe').innerText();
  pruefe(nachTaste !== standVor, 'Pfeiltaste blättert ebenfalls',
    `Anzeige blieb bei ${standVor.trim()}`);
  await page.keyboard.press('ArrowLeft');
  await warte(400);

  const datei = `${ZIEL}/grossansicht-${schirm.width}x${schirm.height}.png`;
  await page.screenshot({ path: datei });
  console.log(`      Bild abgelegt: ${datei}`);

  await klick('.schau .zu');
  await warte(300);
  pruefe(!(await page.locator('.schau.auf').count()),
    'Schließen schließt die Großansicht', 'Ansicht ist noch offen');

  pruefe(fehlerAufSeite.length === 0, 'keine Fehler in der Browserkonsole',
    fehlerAufSeite.join(' | '));

  await ctx.close();
}

await browser.close();
console.log(`\n  ${fehler === 0 ? 'Grün.' : fehler + ' Fehler.'}\n`);
process.exit(fehler === 0 ? 0 : 1);
