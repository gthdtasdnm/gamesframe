// Wie oft wird welches Spiel aufgemacht?
//
// Gezaehlt wird aus den Apache-Zugriffsprotokollen, nicht in den Spielen.
// Das hat einen Grund: sechsundzwanzig Spiele, vier davon ohne Server
// ueberhaupt (`art: "statisch"`). Ein Zaehler *in* den Spielen muesste in
// sechsundzwanzig Repos gepflegt werden, waere in den statischen gar nicht
// unterzubringen – und ein gemeinsamer Zaehldienst waere eine Abhaengigkeit,
// die alle Spiele teilen. Genau das soll es hier nicht geben (CLAUDE.md:
// „Ein Fehler in einem Spiel darf kein anderes mitreissen").
//
// Das Protokoll weiss es ohnehin schon. Es kostet nichts, faellt nie aus und
// deckt statische wie dynamische Spiele gleich ab.
//
// Gezaehlt wird ein **Aufruf der Spielseite**, also `GET /<spiel>/`:
//
//   · HEAD faellt raus – das sind die Statuspunkte auf /spiele/, nicht Leute.
//   · Bots, Crawler und der eigene Playwright fallen raus (siehe MASCHINE).
//   · Nur 200 und 304, nichts anderes.
//   · Pro IP, Spiel und **Stunde** zaehlt nur einer. Wer waehrend einer
//     Partie zehnmal neu laedt, ist trotzdem eine Person, die einmal spielt.
//
// Das ist keine Besucherstatistik und will keine sein. Es ist eine
// Reihenfolge – mehr braucht /spiele/ nicht.
//
//   node werkzeug/zaehlen.mjs            # Protokolle einlesen, Stand fortschreiben
//   node werkzeug/zaehlen.mjs --zeigen   # nur anzeigen, nichts schreiben
//   node werkzeug/zaehlen.mjs --still    # fortschreiben, nur eine Zeile sagen
//
// Der Stand liegt in `werkzeug/daten/spielzahlen.json`, tageweise. Die
// Protokolle halten vierzehn Tage vor; alles davor lebt nur noch in dieser
// Datei. Deshalb muss der Lauf **regelmaessig** kommen – dafuer gibt es den
// Cron-Eintrag (doku/beliebt.md).

import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync, statSync, chownSync, chmodSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAND = join(WURZEL, "werkzeug/daten/spielzahlen.json");
const LOGVERZEICHNIS = process.env.LOGDIR ?? "/var/log/apache2";
const LOGNAME = /^inf-zeus-ssl-access\.log(\.\d+(\.gz)?)?$/;

const NURZEIGEN = process.argv.includes("--zeigen");
/** Fuer den Cron-Lauf: nur die eine Zusammenfassungszeile, nicht die Tabelle. */
const STILL = process.argv.includes("--still");

// Alles, was kein Mensch mit Browser ist. Der eigene Pruefzug faehrt mit
// Playwright und meldet sich als „HeadlessChrome" – der zaehlt genauso wenig
// mit wie ein Suchmaschinenbot, sonst waere das meistgespielte Spiel immer
// das, an dem gerade gearbeitet wird.
const MASCHINE = /bot|crawl|spider|slurp|headless|curl|wget|python|libwww|okhttp|monitor|uptime|scanner|fetch|preview|probe|node-fetch|axios|go-http|java\//i;

const MONATE = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// ---------------------------------------------------------------- Spiele
const spieleJson = JSON.parse(readFileSync(join(WURZEL, "spiele.json"), "utf8"));
/** Werkzeuge sind keine Spiele – der Bugreport gehoert in keine Rangliste. */
const SPIELE = spieleJson.spiele.filter((s) => s.art !== "werkzeug").map((s) => s.name);
const IST_SPIEL = new Set(SPIELE);

// ---------------------------------------------------------------- Protokoll
/**
 * Combined-Format, so weit es hier gebraucht wird:
 *   IP - - [18/Aug/2026:12:02:21 +0000] "GET /keep/ HTTP/1.1" 200 4609 "…" "…"
 */
const ZEILE = /^(\S+) \S+ \S+ \[(\d\d)\/(\w\w\w)\/(\d{4}):(\d\d):\d\d:\d\d [^\]]*\] "(\w+) ([^" ]+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/;

function logdateien() {
  if (!existsSync(LOGVERZEICHNIS)) return [];
  return readdirSync(LOGVERZEICHNIS)
    .filter((n) => LOGNAME.test(n))
    .map((n) => join(LOGVERZEICHNIS, n))
    .sort();
}

function lies(pfad) {
  const roh = readFileSync(pfad);
  return (pfad.endsWith(".gz") ? gunzipSync(roh) : roh).toString("utf8");
}

/**
 * Liest alle vorhandenen Protokolle und gibt zurueck, was darin steht:
 * `{ "2026-08-18": { keep: 3, snake: 1 } }`.
 *
 * Die Entdopplung laeuft ueber ein Set aus IP, Spiel und Stunde. Es lebt nur
 * innerhalb eines Laufs – das reicht, weil immer alle vorhandenen Protokolle
 * auf einmal gelesen werden.
 */
function ausProtokollen() {
  const tage = {};
  const gesehen = new Set();
  let zeilen = 0, treffer = 0;

  for (const pfad of logdateien()) {
    let inhalt;
    try { inhalt = lies(pfad); }
    catch (e) { console.error(`  ! ${pfad}: ${e.message}`); continue; }

    for (const zeile of inhalt.split("\n")) {
      if (!zeile) continue;
      zeilen++;
      const m = ZEILE.exec(zeile);
      if (!m) continue;
      const [, ip, tag, monat, jahr, stunde, methode, pfadTeil, status, ua] = m;
      if (methode !== "GET") continue;                       // HEAD = Statuspunkt
      if (status !== "200" && status !== "304") continue;
      if (MASCHINE.test(ua)) continue;

      const spiel = (/^\/([a-z0-9_-]+)\/(index\.html)?$/.exec(pfadTeil) ?? [])[1];
      if (!spiel || !IST_SPIEL.has(spiel)) continue;

      const datum = `${jahr}-${MONATE[monat] ?? "00"}-${tag}`;
      const schluessel = `${ip}|${spiel}|${datum}|${stunde}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);

      (tage[datum] ??= {});
      tage[datum][spiel] = (tage[datum][spiel] ?? 0) + 1;
      treffer++;
    }
  }
  return { tage, zeilen, treffer };
}

// ---------------------------------------------------------------- Stand
function standLesen() {
  if (!existsSync(STAND)) return { tage: {}, zuletzt: null };
  try { return JSON.parse(readFileSync(STAND, "utf8")); }
  catch { return { tage: {}, zuletzt: null }; }
}

/**
 * Erst daneben schreiben, dann umbenennen – ein abgebrochener Lauf soll
 * keinen halben Stand hinterlassen. Eigentuemer und Rechte kommen mit: das
 * Skript laeuft im Cron als root.
 */
function standSchreiben(stand) {
  const vorher = existsSync(STAND) ? statSync(STAND) : null;
  const tmp = STAND + ".neu";
  writeFileSync(tmp, JSON.stringify(stand, null, 2) + "\n");
  if (vorher) {
    try { chownSync(tmp, vorher.uid, vorher.gid); chmodSync(tmp, vorher.mode & 0o7777); }
    catch { /* nicht root – dann bleibt es, wie es ist */ }
  }
  renameSync(tmp, STAND);
}

// ---------------------------------------------------------------- Anzeige
const heute = () => new Date().toISOString().slice(0, 10);

function summe(tage, seit) {
  const s = {};
  for (const [datum, zeile] of Object.entries(tage)) {
    if (seit && datum < seit) continue;
    for (const [spiel, n] of Object.entries(zeile)) s[spiel] = (s[spiel] ?? 0) + n;
  }
  return s;
}

function vorTagen(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function tabelle(stand) {
  const ges = summe(stand.tage);
  const d28 = summe(stand.tage, vorTagen(28));
  const d7 = summe(stand.tage, vorTagen(7));
  return SPIELE
    .map((s) => ({ spiel: s, gesamt: ges[s] ?? 0, tage28: d28[s] ?? 0, tage7: d7[s] ?? 0 }))
    .sort((a, b) => b.tage28 - a.tage28 || b.gesamt - a.gesamt || a.spiel.localeCompare(b.spiel));
}

function zeigen(stand) {
  const zeilen = tabelle(stand);
  const tage = Object.keys(stand.tage).sort();
  console.log(`\n  Aufrufe je Spiel – ${tage.length} Tage erfasst`
    + (tage.length ? ` (${tage[0]} bis ${tage.at(-1)})` : ""));
  console.log("  " + "".padEnd(48, "─"));
  console.log(`  ${"Spiel".padEnd(14)}${"7 Tage".padStart(9)}${"28 Tage".padStart(10)}${"gesamt".padStart(10)}`);
  for (const z of zeilen) {
    console.log(`  ${z.spiel.padEnd(14)}${String(z.tage7).padStart(9)}`
      + `${String(z.tage28).padStart(10)}${String(z.gesamt).padStart(10)}`);
  }
  console.log("  " + "".padEnd(48, "─"));

  const rang = join(WURZEL, "werkzeug/daten/rangstand.json");
  if (existsSync(rang)) {
    const r = JSON.parse(readFileSync(rang, "utf8"));
    console.log(`\n  Oben auf /spiele/ (Stand ${r.gerechnetAm}): ${r.oben.join(", ")}`);
    console.log("  Aendern tut sich das nur ueber werkzeug/rangfolge.mjs.");
  }
}

// ---------------------------------------------------------------- Adminseite
// Neben der Tabelle im Terminal gibt es eine Seite im Browser. Sie ist
// statisch – sie liest nur diese eine Datei und rechnet selbst.
//
// Wo die Datei hin soll, steht in `werkzeug/daten/panel-ziel.txt` (eine
// Zeile, ein Verzeichnis). Warum nicht hier im Quelltext: der Ordner der
// Adminseite heisst absichtlich nach nichts, und dieses Repo ist oeffentlich.
// Ein Pfad, der in GitHub steht, ist kein geheimer Pfad mehr. Fehlt die
// Datei, passiert hier gar nichts – auf einem anderen Rechner gibt es keine
// Adminseite.
const PANELZIEL = join(WURZEL, "werkzeug/daten/panel-ziel.txt");

function panelSchreiben(stand) {
  if (!existsSync(PANELZIEL)) return;
  const ziel = readFileSync(PANELZIEL, "utf8").trim();
  if (!ziel || !existsSync(ziel)) {
    console.error(`  ! Adminseite: ${ziel || "(leer)"} gibt es nicht`);
    return;
  }

  // Bewusst ohne Ports und Dienstnamen: die Seite haengt hinter einer
  // Passwortabfrage, aber eine Landkarte des Servers braucht sie nicht.
  const spiele = spieleJson.spiele
    .filter((s) => s.art !== "werkzeug")
    .map((s) => ({ name: s.name, titel: s.titel, art: s.art, kategorie: s.kategorie }));

  let oben = null, obenStand = null;
  const rang = join(WURZEL, "werkzeug/daten/rangstand.json");
  if (existsSync(rang)) {
    try {
      const r = JSON.parse(readFileSync(rang, "utf8"));
      oben = r.oben ?? null;
      obenStand = r.gerechnetAm ?? null;
    } catch { /* kaputter Rangstand darf die Seite nicht aufhalten */ }
  }

  const datei = join(ziel, "daten.json");
  const tmp = datei + ".neu";
  writeFileSync(tmp, JSON.stringify({
    erzeugt: new Date().toISOString(),
    zuletzt: stand.zuletzt,
    spiele, oben, obenStand,
    tage: stand.tage,
  }, null, 1) + "\n");
  try { chmodSync(tmp, 0o644); } catch { /* nicht root */ }
  renameSync(tmp, datei);
}

// ---------------------------------------------------------------- Lauf
const stand = standLesen();

if (!NURZEIGEN) {
  const { tage, zeilen, treffer } = ausProtokollen();
  const neu = Object.keys(tage).filter((d) => !(d in stand.tage)).length;
  // Tage aus den Protokollen ueberschreiben, aeltere behalten: der laufende
  // Tag ist immer unvollstaendig und wird morgen richtig nachgetragen.
  Object.assign(stand.tage, tage);
  stand.zuletzt = new Date().toISOString();
  standSchreiben(stand);
  panelSchreiben(stand);
  console.log(`  ${zeilen} Protokollzeilen, ${treffer} gezaehlte Aufrufe,`
    + ` ${Object.keys(tage).length} Tage im Protokoll (${neu} neu),`
    + ` ${Object.keys(stand.tage).length} Tage im Stand.`);
}

if (!STILL) zeigen(stand);
