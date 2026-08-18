// Welche Spiele stehen oben auf /spiele/?
//
// Grundlage sind die Zahlen aus `zaehlen.mjs`. Dieses Skript entscheidet
// daraus die Reihenfolge – und schreibt sie **in die Datei**, nicht in ein
// JSON, das der Browser nachlaedt. Die Kacheln bleiben damit statisches HTML
// und stehen auch ohne JavaScript richtig (doku/startseite.md).
//
// ─── Die Huerde ───────────────────────────────────────────────────────────
//
// Eine Rangliste, die jeden Tag umspringt, ist keine. Wer gestern oben
// geschaut hat, soll heute dasselbe wiederfinden. Deshalb steht zwischen den
// Zahlen und der Seite absichtlich Reibung:
//
//   1. **Nur alle sieben Tage** wird ueberhaupt neu gerechnet (ABSTAND).
//      Der taegliche Cron-Lauf schaut nach und geht meistens wieder.
//   2. Gerechnet wird ueber **28 Tage** (FENSTER), nicht ueber gestern. Ein
//      einzelner guter Abend hebt niemanden.
//   3. Wer rein will, braucht **30 % mehr** als der Schwaechste oben
//      (VORSPRUNG). Gleichstand aendert nichts – der Sitzende bleibt.
//   4. Unter MINDEST Aufrufen im Fenster kommt niemand rein, egal wie die
//      Reihenfolge sonst aussaehe. Bei drei gegen zwei Aufrufen ist der
//      Unterschied Zufall, nicht Beliebtheit.
//   5. Wer gerade rein- oder rausgerutscht ist, ist **21 Tage** gesperrt
//      (RUHE). Sonst pendelt dasselbe Paar Woche fuer Woche.
//
// Zusammen heisst das: die Reihenfolge oben aendert sich hoechstens alle paar
// Wochen und nur, wenn ein Spiel deutlich haeufiger gespielt wird.
//
// ─── FEST ─────────────────────────────────────────────────────────────────
//
// Keep und Card Chaos stehen gesetzt auf den ersten beiden Plaetzen. Das ist
// eine Entscheidung, keine Messung – auch wenn die Zahlen sie gerade decken
// (beide fuehren die Liste ohnehin an). Wer das nicht mehr will, leert FEST;
// dann rechnet das Skript alle vier Plaetze aus.
//
//   node werkzeug/rangfolge.mjs            # nachschauen, ggf. neu setzen
//   node werkzeug/rangfolge.mjs --jetzt    # ABSTAND ueberspringen
//   node werkzeug/rangfolge.mjs --probe    # nur sagen, was passieren wuerde
//
// Danach `node werkzeug/pruefe-startseite.mjs` – der Lauf prueft alle Kacheln.

import { readFileSync, writeFileSync, existsSync, renameSync, statSync, chownSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZAHLEN = join(WURZEL, "werkzeug/daten/spielzahlen.json");
const RANG = join(WURZEL, "werkzeug/daten/rangstand.json");
const SEITE = join(WURZEL, "spiele/index.html");

// ---------------------------------------------------------------- Stellschrauben
const PLAETZE = 4;        // zwei Reihen zu zwei Kacheln auf dem Rechner
const FENSTER = 28;       // Tage, ueber die gezaehlt wird
const MINDEST = 10;       // Aufrufe im Fenster, sonst gar nicht erst dabei
const VORSPRUNG = 1.30;   // so viel mehr braucht ein Herausforderer
const ABSTAND = 7;        // Tage zwischen zwei Rechnungen
const RUHE = 21;          // Tage Sperre nach einem Wechsel
const FEST = ["keep", "cardchaos"];   // gesetzt, siehe oben

const GRUPPE = "gruppe-beliebt";
const TITEL = "Am meisten gespielt";
const UNTERTITEL = "Was hier oben steht, entscheiden die letzten vier Wochen – "
  + "und es aendert sich nur, wenn ein Spiel deutlich haeufiger aufgemacht wird.";

const JETZT = process.argv.includes("--jetzt");
const PROBE = process.argv.includes("--probe");

/**
 * Erst daneben schreiben, dann umbenennen – ein abgebrochener Lauf soll keine
 * halbe Seite hinterlassen. Eigentuemer und Rechte der alten Datei kommen
 * mit: dieses Skript laeuft im Cron als root, die Dateien hier gehoeren aber
 * nicht zwangslaeufig root.
 */
function schreibe(pfad, inhalt) {
  const alt = existsSync(pfad) ? statSync(pfad) : null;
  const tmp = pfad + ".neu";
  writeFileSync(tmp, inhalt);
  if (alt) {
    try { chownSync(tmp, alt.uid, alt.gid); chmodSync(tmp, alt.mode & 0o7777); }
    catch { /* nicht root – dann bleibt es, wie es ist */ }
  }
  renameSync(tmp, pfad);
}

const heute = new Date().toISOString().slice(0, 10);
const tageSeit = (datum) =>
  datum ? Math.floor((Date.parse(heute) - Date.parse(datum)) / 86400000) : Infinity;

// ---------------------------------------------------------------- Zahlen
if (!existsSync(ZAHLEN)) {
  console.error("Keine Zahlen da. Erst `node werkzeug/zaehlen.mjs` laufen lassen.");
  process.exit(1);
}
const zahlen = JSON.parse(readFileSync(ZAHLEN, "utf8"));

const grenze = new Date(Date.parse(heute) - FENSTER * 86400000).toISOString().slice(0, 10);
const punkte = {};
for (const [datum, zeile] of Object.entries(zahlen.tage ?? {})) {
  if (datum < grenze) continue;
  for (const [spiel, n] of Object.entries(zeile)) punkte[spiel] = (punkte[spiel] ?? 0) + n;
}
const wert = (s) => punkte[s] ?? 0;

// ---------------------------------------------------------------- Stand
const stand = existsSync(RANG)
  ? JSON.parse(readFileSync(RANG, "utf8"))
  : { oben: [], seit: {}, gerechnetAm: null };

// ---------------------------------------------------------------- Die Seite lesen
const seite = readFileSync(SEITE, "utf8");

/** Ein Abschnitt: die Ueberschrift, ihr Raster und die Kacheln darin. */
const ABSCHNITT = /<section class="gruppe" aria-labelledby="([\w-]+)">\n([\s\S]*?)\n<\/section>\n\n<main class="raster">\n([\s\S]*?)\n<\/main>/g;
const KACHEL = /^ {2}<article class="game"[\s\S]*?^ {2}<\/article>$/gm;

const abschnitte = [];
for (const m of seite.matchAll(ABSCHNITT)) {
  abschnitte.push({
    id: m[1],
    kopf: m[2],
    kacheln: (m[3].match(KACHEL) ?? []),
    roh: m[0],
  });
}
if (!abschnitte.length) {
  console.error("Keine Kategorien in spiele/index.html gefunden – Aufbau geaendert?");
  process.exit(1);
}

const nameVon = (kachel) => (/data-spiel="([\w-]+)"/.exec(kachel) ?? [])[1];
const alleKacheln = new Map();
for (const a of abschnitte) for (const k of a.kacheln) alleKacheln.set(nameVon(k), { kachel: k, in: a.id });

/**
 * Heimat und Platz stehen in der Kachel selbst. Beim ersten Lauf ist die
 * Kategorie, in der eine Kachel steht, ihre Heimat – danach traegt sie sie
 * mit, auch wenn sie oben steht, und findet damit ihren alten Platz wieder.
 */
function heimatSetzen() {
  for (const a of abschnitte) {
    if (a.id === GRUPPE) continue;
    a.kacheln.forEach((k, i) => {
      const name = nameVon(k);
      const eintrag = alleKacheln.get(name);
      if (/data-heimat="/.test(k)) { eintrag.heimat = (/data-heimat="([\w-]+)"/.exec(k) ?? [])[1]; }
      else {
        eintrag.kachel = k.replace(/(data-spiel="[\w-]+")/,
          `$1 data-heimat="${a.id}" data-platz="${i}"`);
        eintrag.heimat = a.id;
      }
      eintrag.platz ??= Number((/data-platz="(\d+)"/.exec(eintrag.kachel) ?? [])[1] ?? i);
    });
  }
  // Kacheln, die gerade oben stehen: Heimat und Platz stehen bereits drin.
  for (const [, e] of alleKacheln) {
    if (e.heimat) continue;
    e.heimat = (/data-heimat="([\w-]+)"/.exec(e.kachel) ?? [])[1] ?? null;
    e.platz = Number((/data-platz="(\d+)"/.exec(e.kachel) ?? [])[1] ?? 999);
  }
}
heimatSetzen();

const fehltHeimat = [...alleKacheln].filter(([, e]) => !e.heimat).map(([n]) => n);
if (fehltHeimat.length) {
  console.error(`Kacheln ohne Heimatkategorie: ${fehltHeimat.join(", ")} – von Hand nachtragen.`);
  process.exit(1);
}

// ---------------------------------------------------------------- Rechnen
const spielbar = [...alleKacheln.keys()];
const gesperrt = (s) => tageSeit(stand.seit?.[s]) < RUHE;

let oben = (stand.oben ?? []).filter((s) => alleKacheln.has(s));
let grund = null;

if (!oben.length) {
  // Erster Lauf: FEST vorn, dahinter die staerksten, die MINDEST schaffen.
  const rest = spielbar
    .filter((s) => !FEST.includes(s) && wert(s) >= MINDEST)
    .sort((a, b) => wert(b) - wert(a));
  oben = [...FEST.filter((s) => alleKacheln.has(s)), ...rest].slice(0, PLAETZE);
  grund = "erster Lauf";
} else if (!JETZT && tageSeit(stand.gerechnetAm) < ABSTAND) {
  grund = `zu frueh – zuletzt vor ${tageSeit(stand.gerechnetAm)} Tag(en), gewartet wird ${ABSTAND}`;
} else {
  // FEST gehoert immer dazu und immer nach vorn.
  for (const s of FEST) if (alleKacheln.has(s) && !oben.includes(s)) oben.unshift(s);
  oben = [...FEST.filter((s) => oben.includes(s)), ...oben.filter((s) => !FEST.includes(s))];
  oben = oben.slice(0, PLAETZE);

  const wechselbar = oben.filter((s) => !FEST.includes(s));
  const draussen = spielbar
    .filter((s) => !oben.includes(s) && wert(s) >= MINDEST && !gesperrt(s))
    .sort((a, b) => wert(b) - wert(a));

  // Freie Plaetze zuerst auffuellen – dafuer braucht es keinen Vorsprung.
  while (oben.length < PLAETZE && draussen.length) {
    const neu = draussen.shift();
    oben.push(neu);
    stand.seit[neu] = heute;
    grund = "Platz war frei";
  }

  // Dann der Tausch: der Schwaechste oben gegen den Staerksten draussen –
  // aber nur mit VORSPRUNG, und nur wenn beide aus der Ruhefrist heraus sind.
  const schwaechster = [...oben.filter((s) => !FEST.includes(s))]
    .sort((a, b) => wert(a) - wert(b))[0];
  const staerkster = draussen[0];
  if (schwaechster && staerkster && !gesperrt(schwaechster)
      && wert(staerkster) >= wert(schwaechster) * VORSPRUNG) {
    oben = oben.map((s) => (s === schwaechster ? staerkster : s));
    stand.seit[schwaechster] = heute;
    stand.seit[staerkster] = heute;
    grund = `${staerkster} (${wert(staerkster)}) verdraengt ${schwaechster} (${wert(schwaechster)})`;
  }

  // Reihenfolge innerhalb der Liste: auch hier nur mit Vorsprung tauschen,
  // sonst wandert dieselbe Kachel bei jedem Lauf eine Position.
  const beweglich = oben.filter((s) => !FEST.includes(s));
  for (let i = 0; i < beweglich.length - 1; i++) {
    if (wert(beweglich[i + 1]) >= wert(beweglich[i]) * VORSPRUNG) {
      [beweglich[i], beweglich[i + 1]] = [beweglich[i + 1], beweglich[i]];
      grund ??= `${beweglich[i]} zieht an ${beweglich[i + 1]} vorbei`;
    }
  }
  oben = [...FEST.filter((s) => oben.includes(s)), ...beweglich];

  // Wenn nichts passiert ist: sagen *warum*. „Kein Wechsel" allein laesst
  // offen, ob niemand nah genug dran war oder ob nur die Ruhefrist bremst –
  // und genau das will man im Cron-Protokoll unterscheiden koennen.
  if (!grund) {
    const schwach = [...oben.filter((x) => !FEST.includes(x))]
      .sort((a, b) => wert(a) - wert(b))[0];
    const naechster = spielbar
      .filter((x) => !oben.includes(x) && wert(x) >= MINDEST)
      .sort((a, b) => wert(b) - wert(a))[0];
    if (schwach && naechster && wert(naechster) >= wert(schwach) * VORSPRUNG) {
      grund = `${naechster} haette den Vorsprung, aber die Ruhefrist laeuft noch`
        + ` (${RUHE} Tage, seit ${stand.seit?.[gesperrt(naechster) ? naechster : schwach] ?? "?"})`;
    } else if (schwach && naechster) {
      grund = `kein Wechsel – ${naechster} (${wert(naechster)}) braucht`
        + ` ${Math.ceil(wert(schwach) * VORSPRUNG)} gegen ${schwach} (${wert(schwach)})`;
    } else {
      grund = "kein Wechsel – kein Herausforderer ueber MINDEST";
    }
  }
  void wechselbar;
}

const vorher = stand.oben ?? [];
const geaendert = vorher.join(",") !== oben.join(",");

console.log(`  Fenster ${FENSTER} Tage (ab ${grenze}), ${PLAETZE} Plaetze, Vorsprung ${VORSPRUNG}x`);
console.log(`  vorher : ${vorher.length ? vorher.join(", ") : "–"}`);
console.log(`  nachher: ${oben.join(", ")}   [${grund}]`);
for (const s of oben) console.log(`    ${s.padEnd(14)} ${String(wert(s)).padStart(4)} Aufrufe`
  + (FEST.includes(s) ? "   (gesetzt)" : ""));

// ---------------------------------------------------------------- Seite schreiben
/** Die Kachel mit ihrer aktuellen Heimat-/Platzangabe. */
const kachelVon = (name) => alleKacheln.get(name).kachel;

function neueSeite() {
  let neu = seite;
  const neuerRoh = new Map();   // Abschnitt-Id -> wie er nachher dasteht

  // 1. Alle bestehenden Abschnitte durch ihre neue Besetzung ersetzen.
  for (const a of abschnitte) {
    if (a.id === GRUPPE) continue;
    const drin = [...alleKacheln]
      .filter(([n, e]) => e.heimat === a.id && !oben.includes(n))
      .sort((x, y) => x[1].platz - y[1].platz)
      .map(([n]) => kachelVon(n));
    if (!drin.length) {
      console.error(`Kategorie „${a.id}" bliebe leer – das laesst diese Rechnung nicht zu.`);
      process.exit(1);
    }
    const roh = a.roh.replace(
      /(<main class="raster">\n)[\s\S]*?(\n<\/main>)/,
      (_, auf, zu) => auf + drin.join("\n\n") + zu);
    neuerRoh.set(a.id, roh);
    neu = neu.replace(a.roh, () => roh);
  }

  // 2. Den Abschnitt oben neu bauen (oder entfernen, wenn nichts oben steht).
  const alterOben = abschnitte.find((a) => a.id === GRUPPE);
  const block = oben.length
    ? `<section class="gruppe" aria-labelledby="${GRUPPE}">\n`
      + `  <h2 class="gruppe-titel" id="${GRUPPE}">${TITEL}</h2>\n`
      + `  <p class="gruppe-sub">${UNTERTITEL}</p>\n`
      + `</section>\n\n<main class="raster">\n`
      + oben.map(kachelVon).join("\n\n")
      + `\n</main>`
    : "";

  if (alterOben) {
    // Der Abschnitt steht schon in der Datei – er wird ersetzt oder, wenn
    // nichts mehr oben steht, samt der Leerzeile danach entfernt.
    neu = block
      ? neu.replace(alterOben.roh, () => block)
      : neu.replace(alterOben.roh + "\n\n", "").replace(alterOben.roh, "");
  } else if (block) {
    // Vor die erste Kategorie – dort faengt die Liste an. Ersetzt wird der
    // **neue** Text dieses Abschnitts: Schritt 1 hat ihn schon angefasst.
    const erste = abschnitte.find((a) => a.id !== GRUPPE);
    const ziel = neuerRoh.get(erste.id) ?? erste.roh;
    neu = neu.replace(ziel, () => block + "\n\n" + ziel);
  }
  return neu;
}

const gebaut = neueSeite();

// Sicherheitsnetz: es muss genau so viele Kacheln geben wie vorher, und jede
// genau einmal. Ein Textumbau, der eine Kachel verliert, faellt sonst erst
// dem naechsten Menschen auf.
const vorherZahl = (seite.match(/<article class="game"/g) ?? []).length;
const nachherZahl = (gebaut.match(/<article class="game"/g) ?? []).length;
const namen = [...gebaut.matchAll(/data-spiel="([\w-]+)"/g)].map((m) => m[1]);
if (vorherZahl !== nachherZahl || new Set(namen).size !== nachherZahl) {
  console.error(`Abbruch: ${vorherZahl} Kacheln vorher, ${nachherZahl} nachher,`
    + ` ${new Set(namen).size} verschiedene. Nichts geschrieben.`);
  process.exit(1);
}

if (PROBE) {
  console.log(`\n  --probe: nichts geschrieben (${geaendert ? "es gaebe eine Aenderung" : "keine Aenderung"}).`);
  process.exit(0);
}

if (gebaut !== seite) {
  schreibe(SEITE, gebaut);
  console.log(`\n  spiele/index.html neu geschrieben (${nachherZahl} Kacheln).`);
  console.log("  Jetzt `node werkzeug/pruefe-startseite.mjs`.");
} else {
  console.log("\n  spiele/index.html bleibt, wie sie ist.");
}

if (geaendert || !stand.gerechnetAm) {
  for (const s of oben) stand.seit[s] ??= heute;
}
stand.oben = oben;
if (grund && !grund.startsWith("zu frueh")) stand.gerechnetAm = heute;
schreibe(RANG, JSON.stringify(stand, null, 2) + "\n");
