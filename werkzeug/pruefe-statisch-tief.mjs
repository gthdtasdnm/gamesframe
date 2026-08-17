// Tiefenprobe für die vier Spiele ohne Server – die Fortsetzung von
// `pruefe-statisch.mjs`. Jene fragt: baut sich die Seite auf? Diese fragt, was
// danach kommt und was man nur im laufenden Spiel sieht:
//
//   E02  Neu laden mitten im Spiel – bleibt der Stand?
//   E03  „Neues Spiel" räumt wirklich auf. Vor allem die Uhr: ein zweiter
//        `setInterval` fällt nicht auf, außer man misst nach. Er ließe die
//        Anzeige doppelt so schnell laufen und verdürbe jede Bestzeit.
//   E04  Wortgitter im Einzelnen – Wortlisten, Wort des Tages, Tageswechsel,
//        kaputter Speicher, doppelte Buchstaben. Wortgitter ist das einzige
//        Spiel ohne `probe.js`; was hier nicht geprüft wird, ist gar nicht
//        geprüft.
//
//   cd /root/werkzeug-screenshots && node pruefe-statisch-tief.mjs
//   … --nur wortgitter          nur ein Spiel
//
// Versioniert liegt die Datei in /var/www/html/werkzeug/ – wer sie hier ändert,
// kopiert sie dorthin zurück.

import { chromium } from "playwright";
import { GUELTIG, LOESUNGEN } from "/var/www/html/wortgitter/woerter.js";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const nurArg = process.argv.indexOf("--nur");
const NUR = nurArg > -1 ? process.argv[nurArg + 1] : null;

let gruen = 0, rot = 0;
const befunde = [];

function pruefe(spiel, test, bedingung, text) {
  if (bedingung) {
    gruen++;
    console.log(`  ok   ${test.padEnd(5)} ${text}`);
  } else {
    rot++;
    befunde.push(`${spiel} ${test}: ${text}`);
    console.error(`  FEHL ${test.padEnd(5)} ${text}`);
  }
}

const browser = await chromium.launch();

/** Eine Seite mit Konsolenwache. Wirft der Aufbau etwas, ist das ein Befund. */
async function seiteAuf(spiel, vorLaden) {
  const seite = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const konsole = [];
  seite.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  seite.on("pageerror", (e) => konsole.push(String(e)));
  seite.konsole = konsole;
  // localStorage lässt sich erst setzen, wenn die Herkunft feststeht – deshalb
  // einmal leer laden, säen, dann richtig laden.
  await seite.goto(`${BASIS}/${spiel}/`, { waitUntil: "domcontentloaded" });
  if (vorLaden) {
    await seite.evaluate(vorLaden);
    await seite.reload({ waitUntil: "domcontentloaded" });
  }
  return seite;
}

/**
 * Der Uhrentest. Nach `wieOft` Neustarts muss die Anzeige in drei Sekunden um
 * drei Sekunden weiterlaufen – nicht um sechs, nicht um zwölf. Genau das
 * passiert, wenn ein alter `setInterval` weiterläuft.
 */
async function uhrLaeuftEinfach(seite, leseZeit) {
  const a = await seite.evaluate(leseZeit);
  await seite.waitForTimeout(3200);
  const b = await seite.evaluate(leseZeit);
  return { von: a, bis: b, schritt: b - a };
}

// ══════════════════════════════════════════════════════════ Minenfeld
async function minenfeld() {
  console.log("\nminenfeld");
  const seite = await seiteAuf("minenfeld");
  await seite.waitForSelector(".mfeld .mz");

  // E02: aufdecken, neu laden. Minenfeld hebt bewusst nur Stufe und Bestzeit
  // auf – das Feld ist nach dem Neuladen ein neues. Geprüft wird, dass daraus
  // ein sauberer Zustand wird und nicht ein halber.
  await seite.locator(".mfeld .mz").nth(40).click();
  await seite.waitForTimeout(200);
  const offenVorher = await seite.locator(".mfeld .mz.auf").count();
  pruefe("minenfeld", "E02", offenVorher > 0, `Klick deckt auf (${offenVorher} Felder)`);
  await seite.reload({ waitUntil: "domcontentloaded" });
  await seite.waitForSelector(".mfeld .mz");
  const offenNachher = await seite.locator(".mfeld .mz.auf").count();
  pruefe("minenfeld", "E02", offenNachher === 0,
    `nach Neuladen frisches Feld (${offenNachher} offen) – Stand wird bewusst nicht gehalten`);

  // E03: viermal „Neues Feld", dann erster Klick startet die Uhr. Sie darf
  // danach genau einfach laufen.
  for (let i = 0; i < 4; i++) {
    await seite.getByRole("button", { name: "Neues Feld" }).click();
    await seite.waitForTimeout(60);
  }
  await seite.locator(".mfeld .mz").nth(40).click();
  const uhr = await uhrLaeuftEinfach(seite, () =>
    Number(document.getElementById("stand").textContent.match(/⏱\s*(\d+)/)?.[1] ?? -1));
  pruefe("minenfeld", "E03", uhr.schritt >= 2 && uhr.schritt <= 4,
    `Uhr nach 4× Neu: ${uhr.von}s → ${uhr.bis}s in 3,2 s (Schritt ${uhr.schritt})`);

  const felder = await seite.locator(".mfeld .mz").count();
  pruefe("minenfeld", "E03", felder === 81, `Neues Feld baut wieder ${felder} Zellen`);
  pruefe("minenfeld", "E01", seite.konsole.length === 0,
    `Konsole still (${seite.konsole.join(" | ")})`);
  await seite.close();
}

// ══════════════════════════════════════════════════════════ Sudoku
async function sudoku() {
  console.log("\nsudoku");
  const seite = await seiteAuf("sudoku");
  await seite.waitForSelector(".sgitter .sz");

  // E02: eine Zahl setzen, neu laden.
  const leer = seite.locator(".sgitter .sz:not(.vor)").first();
  await leer.click();
  // Ausdrücklich die Zifferntaste im Zahlenfeld: `getByRole("button", …"5")`
  // trifft sonst die erste Gitterzelle, in der eine 5 vorgegeben steht.
  await seite.locator(".spad .zahl", { hasText: /^5$/ }).click();
  await seite.waitForTimeout(150);
  const gesetzt = await seite.locator(".sgitter .sz:not(.vor)")
    .evaluateAll((zs) => zs.filter((z) => z.textContent.trim()).length);
  pruefe("sudoku", "E02", gesetzt > 0, `Zahl lässt sich setzen (${gesetzt} eigene)`);
  await seite.reload({ waitUntil: "domcontentloaded" });
  await seite.waitForSelector(".sgitter .sz");
  await seite.waitForTimeout(200);
  const nachher = await seite.locator(".sgitter .sz:not(.vor)")
    .evaluateAll((zs) => zs.filter((z) => z.textContent.trim()).length);
  pruefe("sudoku", "E02", nachher === 0,
    `nach Neuladen frisches Rätsel (${nachher} eigene) – Stand wird bewusst nicht gehalten`);

  // E03: viermal „Neues Rätsel" – der Bau läuft über setTimeout, deshalb je
  // ein Moment Luft.
  for (let i = 0; i < 4; i++) {
    await seite.getByRole("button", { name: "Neues Rätsel" }).click();
    await seite.waitForTimeout(250);
  }
  const vor = await seite.locator(".sgitter .sz.vor").count();
  pruefe("sudoku", "E03", vor >= 20, `Neues Rätsel hat ${vor} vorgegebene Zahlen`);
  const uhr = await uhrLaeuftEinfach(seite, () => {
    const m = document.getElementById("stand").textContent.match(/(\d+):(\d\d)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  });
  pruefe("sudoku", "E03", uhr.schritt >= 2 && uhr.schritt <= 4,
    `Uhr nach 4× Neu: ${uhr.von}s → ${uhr.bis}s in 3,2 s (Schritt ${uhr.schritt})`);
  // E04 (Bugreport 6): ein falscher Eintrag wird nicht mehr rot. Damit der
  // Eintrag sicher falsch ist, kommt eine Zahl in die Reihe, in der sie schon
  // vorgegeben steht - zweimal dieselbe Zahl in einer Reihe geht nie auf.
  const ziel = await seite.evaluate(() => {
    const zellen = [...document.querySelectorAll(".sgitter .sz")];
    for (let r = 0; r < 9; r++) {
      const reihe = zellen.slice(r * 9, r * 9 + 9);
      const vor = reihe.find((z) => z.classList.contains("vor") && z.textContent.trim());
      const leer = reihe.find((z) => !z.classList.contains("vor") && !z.textContent.trim());
      if (vor && leer) return { i: zellen.indexOf(leer), zahl: vor.textContent.trim() };
    }
    return null;
  });
  pruefe("sudoku", "E04", !!ziel, "Reihe mit Vorgabe und Lücke gefunden");
  if (ziel) {
    await seite.locator(".sgitter .sz").nth(ziel.i).click();
    await seite.locator(".spad .zahl", { hasText: new RegExp(`^${ziel.zahl}$`) }).click();
    await seite.waitForTimeout(150);
    const steht = await seite.locator(".sgitter .sz").nth(ziel.i).textContent();
    pruefe("sudoku", "E04", steht.trim() === ziel.zahl,
      `Die falsche ${ziel.zahl} steht im Feld`);
    const rot = await seite.locator(".sgitter .sz.falsch").count();
    pruefe("sudoku", "E04", rot === 0,
      `Kein Feld ist als falsch markiert (${rot}) - klassisch wie im Zeitungsraetsel`);
    // Ein Fehlerzaehler waere dasselbe in Zahlen: oben steht nur die Uhr.
    const stand = (await seite.textContent("#stand")).trim();
    pruefe("sudoku", "E04", !/fehler/i.test(stand), `oben steht nur die Uhr (${stand})`);
  }

  pruefe("sudoku", "E01", seite.konsole.length === 0,
    `Konsole still (${seite.konsole.join(" | ")})`);
  await seite.close();
}

// ══════════════════════════════════════════════════════════ Patience
async function patience() {
  console.log("\npatience");
  const seite = await seiteAuf("patience");
  await seite.waitForSelector(".ptisch .pspalte");

  // E02: ziehen, neu laden.
  await seite.locator(".poben .pk.platz, .poben .pk").first().click();
  await seite.waitForTimeout(150);
  const zuegeVor = await seite.evaluate(() =>
    Number(document.getElementById("stand").textContent.match(/(\d+)\s*Züge/)?.[1] ?? -1));
  pruefe("patience", "E02", zuegeVor >= 1, `Ziehen zählt (${zuegeVor} Züge)`);
  await seite.reload({ waitUntil: "domcontentloaded" });
  await seite.waitForSelector(".ptisch .pspalte");
  const zuegeNach = await seite.evaluate(() =>
    Number(document.getElementById("stand").textContent.match(/(\d+)\s*Züge/)?.[1] ?? -1));
  pruefe("patience", "E02", zuegeNach === 0,
    `nach Neuladen frische Partie (${zuegeNach} Züge) – Stand wird bewusst nicht gehalten`);

  // E03: der Fall, für den in `neu()` eigens ein `clearInterval` steht.
  for (let i = 0; i < 4; i++) {
    await seite.getByRole("button", { name: "Neues Spiel" }).click();
    await seite.waitForTimeout(60);
  }
  const uhr = await uhrLaeuftEinfach(seite, () => {
    const m = document.getElementById("stand").textContent.match(/(\d+):(\d\d)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  });
  pruefe("patience", "E03", uhr.schritt >= 2 && uhr.schritt <= 4,
    `Uhr nach 4× Neu: ${uhr.von}s → ${uhr.bis}s in 3,2 s (Schritt ${uhr.schritt})`);

  // E03: auch der Umschalter „Drei ziehen" ruft neu() – dieselbe Falle.
  await seite.getByRole("button", { name: "Drei ziehen" }).click();
  await seite.waitForTimeout(60);
  await seite.getByRole("button", { name: "Eine ziehen" }).click();
  const uhr2 = await uhrLaeuftEinfach(seite, () => {
    const m = document.getElementById("stand").textContent.match(/(\d+):(\d\d)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  });
  pruefe("patience", "E03", uhr2.schritt >= 2 && uhr2.schritt <= 4,
    `Uhr nach Umschalten: Schritt ${uhr2.schritt}`);

  const karten = await seite.locator(".ptisch .pk").count();
  pruefe("patience", "E03", karten >= 28, `Tisch wieder aufgebaut (${karten} Karten)`);
  pruefe("patience", "E01", seite.konsole.length === 0,
    `Konsole still (${seite.konsole.join(" | ")})`);
  await seite.close();
}

// ══════════════════════════════════════════════════════════ Wortgitter
/** Dieselbe Regel wie im Spiel, unabhängig noch einmal geschrieben. */
function bewerteUnabhaengig(versuch, wort) {
  const wert = new Array(5).fill("weg");
  const rest = {};
  for (let i = 0; i < 5; i++) {
    if (versuch[i] === wort[i]) wert[i] = "treffer";
    else rest[wort[i]] = (rest[wort[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (wert[i] === "treffer") continue;
    if (rest[versuch[i]] > 0) { wert[i] = "drin"; rest[versuch[i]]--; }
  }
  return wert;
}

const tagNr = () => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

async function tippe(seite, wort) {
  for (const b of wort) await seite.keyboard.press(`Key${b}`);
  await seite.keyboard.press("Enter");
  await seite.waitForTimeout(200);
}

/** Wie `tippe`, aber über die Tasten auf dem Schirm – die kennen auch ÄÖÜ. */
async function tippeKlick(seite, wort) {
  for (const b of wort) {
    await seite.locator(".tk", { hasText: new RegExp(`^${b}$`) }).first().click();
  }
  await seite.locator(".tk", { hasText: /^⏎$/ }).first().click();
  await seite.waitForTimeout(250);
}

async function wortgitter() {
  console.log("\nwortgitter");
  const TAG = tagNr();
  const WORT = LOESUNGEN[TAG % LOESUNGEN.length];

  // E04 ohne Browser: die Listen selbst.
  const form = /^[A-ZÄÖÜ]{5}$/;
  pruefe("wortgitter", "E04", LOESUNGEN.every((w) => form.test(w)),
    `alle ${LOESUNGEN.length} Lösungen sind fünf Großbuchstaben`);
  pruefe("wortgitter", "E04", LOESUNGEN.every((w) => GUELTIG.has(w)),
    "jede Lösung steht auch in der Rateliste – sonst wäre sie nicht eingebbar");
  pruefe("wortgitter", "E04", new Set(LOESUNGEN).size === LOESUNGEN.length,
    "keine Lösung doppelt");
  pruefe("wortgitter", "E04", [...GUELTIG].every((w) => form.test(w)),
    `alle ${GUELTIG.size} gültigen Wörter haben dieselbe Form`);

  // E01/E04: Wort des Tages ist für alle dasselbe und hängt nur am Tag.
  const seite = await seiteAuf("wortgitter");
  await seite.waitForSelector(".wgitter .wk");

  // E04: doppelte Buchstaben. Ein Ratewort aus der Liste, das einen Buchstaben
  // des Tageswortes zweimal enthält – daran scheitern naive Bewerter.
  const doppelt = [...GUELTIG].find((w) => {
    if (w === WORT) return false;
    const z = {};
    for (const b of w) z[b] = (z[b] ?? 0) + 1;
    return Object.entries(z).some(([b, n]) => n >= 2 && WORT.includes(b));
  });
  if (doppelt) {
    await tippe(seite, doppelt);
    const gesehen = await seite.locator(".wgitter .wzeile").first().locator(".wk")
      .evaluateAll((ks) => ks.map((k) =>
        k.classList.contains("treffer") ? "treffer"
          : k.classList.contains("drin") ? "drin" : "weg"));
    const erwartet = bewerteUnabhaengig(doppelt, WORT);
    pruefe("wortgitter", "E04", JSON.stringify(gesehen) === JSON.stringify(erwartet),
      `„${doppelt}" gegen „${WORT}": ${gesehen.join(",")} (erwartet ${erwartet.join(",")})`);
  }

  // E02: neu laden – hier soll der Stand bleiben, als einziges der vier.
  await seite.reload({ waitUntil: "domcontentloaded" });
  await seite.waitForSelector(".wgitter .wk");
  const ersteZeile = await seite.locator(".wgitter .wzeile").first().locator(".wk")
    .evaluateAll((ks) => ks.map((k) => k.textContent).join(""));
  pruefe("wortgitter", "E02", ersteZeile === doppelt,
    `Stand überlebt das Neuladen (erste Zeile „${ersteZeile}")`);

  // E04: unbekanntes Wort wird abgelehnt und verbraucht keinen Versuch.
  const zeilenVor = await seite.evaluate(() =>
    JSON.parse(localStorage.getItem("wortgitter-stand")).zeilen.length);
  await tippe(seite, "XXXXX");
  const zeilenNach = await seite.evaluate(() =>
    JSON.parse(localStorage.getItem("wortgitter-stand")).zeilen.length);
  const hinweis = await seite.locator("#hint").textContent();
  pruefe("wortgitter", "E04", zeilenNach === zeilenVor,
    `unbekanntes Wort kostet keinen Versuch (${zeilenVor} → ${zeilenNach}, „${hinweis.trim()}")`);

  // E04: Tageswechsel. Ein Stand von gestern – auch ein fertiger – darf heute
  // nicht mehr gelten, sonst sitzt man vor dem Ergebnis von gestern.
  const gestern = await seiteAuf("wortgitter", () => {
    localStorage.setItem("wortgitter-stand", JSON.stringify({
      tag: Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(),
        new Date().getDate()) / 86400000) - 1,
      zeilen: [{ wort: "HALLO", wert: ["weg", "weg", "weg", "weg", "weg"] },
        { wort: "WELLE", wert: ["weg", "weg", "weg", "weg", "weg"] }],
      fertig: true, gewonnen: false,
    }));
  });
  await gestern.waitForSelector(".wgitter .wk");
  const alteZeile = await gestern.locator(".wgitter .wzeile").first().locator(".wk")
    .evaluateAll((ks) => ks.map((k) => k.textContent).join(""));
  const fertigBox = await gestern.locator(".fertigbox").count();
  pruefe("wortgitter", "E04", alteZeile.trim() === "",
    `Stand von gestern gilt nicht mehr (erste Zeile „${alteZeile}")`);
  pruefe("wortgitter", "E04", fertigBox === 0,
    "kein Ergebniskasten von gestern");
  await gestern.close();

  // E04: kaputter Speicher darf das Spiel nicht kosten.
  const kaputt = await seiteAuf("wortgitter", () => {
    localStorage.setItem("wortgitter-stand", "{das ist kein JSON");
  });
  const kaputtFelder = await kaputt.locator(".wgitter .wk").count();
  pruefe("wortgitter", "E04", kaputtFelder === 30,
    `kaputter Speichereintrag: Spiel baut sich trotzdem auf (${kaputtFelder} Felder)`);
  pruefe("wortgitter", "E04", kaputt.konsole.length === 0,
    `dabei still (${kaputt.konsole.join(" | ")})`);
  await kaputt.close();

  // E05: die Kästchengröße auf einem Handy, und zwar **vor** dem ersten
  // Buchstaben. Bugreport 7: „auf dem Handy ist das Wort zu klein, erst nach
  // dem Schreiben wird es richtig skaliert". Das Gitter hing an der
  // Inhaltsbreite und war leer 4 px breit; getippt wuchs es auf die richtige
  // Größe. Gemessen wird deshalb auf leerem Brett – sonst fällt genau dieser
  // Fehler nicht auf.
  const handy = await seiteAuf("wortgitter", () => localStorage.clear());
  await handy.waitForSelector(".wgitter .wk");
  const kasten = await handy.locator(".wk").first().boundingBox();
  pruefe("wortgitter", "E05", kasten.width >= 40,
    `leeres Kästchen ist ${Math.round(kasten.width)} px breit (vor dem Fix: 4 px)`);

  // E05: Übungswörter. Bugreport 9 – „neues Spiel anfangen Knopf fehlt". Der
  // Knopf muss dastehen, ein anderes Wort geben und Serie und Tagesstand in
  // Ruhe lassen.
  await handy.evaluate(() => localStorage.setItem("wortgitter-stat",
    JSON.stringify({ gespielt: 3, gewonnen: 3, serie: 3, beste: 3 })));
  await handy.click("#aktionen .btn");
  await handy.waitForTimeout(300);
  const uebungWort = await handy.evaluate(() =>
    JSON.parse(localStorage.getItem("wortgitter-uebung") ?? "null")?.wort);
  pruefe("wortgitter", "E05", typeof uebungWort === "string" && uebungWort !== WORT,
    `„Neues Wort" gibt ein anderes als das Tageswort (${uebungWort} statt ${WORT})`);

  await tippeKlick(handy, uebungWort);
  const serie = await handy.evaluate(() =>
    JSON.parse(localStorage.getItem("wortgitter-stat")).serie);
  const geloest = await handy.locator(".fertigbox").count();
  pruefe("wortgitter", "E05", geloest === 1 && serie === 3,
    `ein gelöstes Übungswort lässt die Serie in Ruhe (${serie})`);
  const tagesstand = await handy.evaluate(() => localStorage.getItem("wortgitter-stand"));
  pruefe("wortgitter", "E05", !tagesstand || JSON.parse(tagesstand).zeilen.length === 0,
    "und den Tagesstand auch");

  await handy.locator("#aktionen .btn").nth(1).click();
  await handy.waitForTimeout(300);
  const wiederTag = await handy.evaluate(() => localStorage.getItem("wortgitter-uebung"));
  const leer = await handy.locator(".wgitter .wzeile").first().locator(".wk")
    .evaluateAll((ks) => ks.map((k) => k.textContent).join("").trim());
  pruefe("wortgitter", "E05", wiederTag === null && leer === "",
    "der Weg zurück zum Wort des Tages führt auf ein leeres Brett");
  pruefe("wortgitter", "E05", handy.konsole.length === 0,
    `dabei still (${handy.konsole.join(" | ")})`);
  await handy.close();

  pruefe("wortgitter", "E01", seite.konsole.length === 0,
    `Konsole still (${seite.konsole.join(" | ")})`);
  await seite.close();
}

const ALLE = { minenfeld, sudoku, patience, wortgitter };
for (const [name, fn] of Object.entries(ALLE)) {
  if (NUR && NUR !== name) continue;
  await fn();
}

await browser.close();
console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
