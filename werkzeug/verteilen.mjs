#!/usr/bin/env node
// Verteilt die gemeinsamen Teile aus /var/www/html/gemeinsam/ in die Spiele.
//
// Warum kopieren statt importieren: die Spiele sollen voneinander unabhaengig
// bleiben. Wuerden alle zur Laufzeit dieselbe Datei laden, riesse ein Fehler
// darin alle neun mit. So behaelt jedes Spiel eine vollstaendige eigene Kopie
// und laeuft auch dann weiter, wenn dieser Ordner verschwindet. Der Preis ist
// Drift - und genau die faengt dieses Skript ab.
//
//   node werkzeug/verteilen.mjs              alle Spiele schreiben
//   node werkzeug/verteilen.mjs --pruefen    nichts schreiben, nur Abweichungen
//                                            melden (Exitcode 1, wenn welche)
//   node werkzeug/verteilen.mjs --nur imposter [--nur flasche]
//
// `--nur` ist der Grund, warum ein Fehler im gemeinsamen Teil hier nicht
// gefaehrlich ist: ausrollen kann man Spiel fuer Spiel, mit `deno task probe`
// dazwischen.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const pruefen = argv.includes("--pruefen");
const nur = argv.reduce((liste, wert, i) => {
  if (argv[i - 1] === "--nur") liste.push(wert);
  return liste;
}, []);

const registry = JSON.parse(readFileSync(join(WURZEL, "spiele.json"), "utf8"));

const kurz = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);

// ---------------------------------------------------------------------------
// Die gemeinsamen Teile
//
// Jeder Eintrag sagt, wie er in eine Zieldatei kommt. `ganz` ersetzt die Datei
// vollstaendig, `block` nur den Kopf bis zu einem Endmarker - so behaelt jedes
// Spiel sein eigenes CSS unterhalb davon.
// ---------------------------------------------------------------------------

const TEILE = {
  bremse: { quelle: "gemeinsam/bremse.js", modus: "ganz" },
  raum: { quelle: "gemeinsam/raum.js", modus: "ganz" },
  statisch: { quelle: "gemeinsam/statisch.js", modus: "ganz" },
  schale: { quelle: "gemeinsam/schale.js", modus: "ganz" },
  lobbyCss: {
    quelle: "gemeinsam/lobby.css",
    modus: "block",
    endmarker: /Gemeinsame Lobby-Basis .* Ende/,
  },
};

for (const teil of Object.values(TEILE)) {
  teil.text = readFileSync(join(WURZEL, teil.quelle), "utf8");
  teil.hash = kurz(teil.text);
}

/**
 * Neuen Inhalt der Zieldatei berechnen - oder null, wenn schon alles stimmt.
 * Bei `block` bleibt alles ab der Zeile nach dem Endmarker unberuehrt.
 */
function neuerInhalt(teil, alt) {
  if (teil.modus === "ganz") return alt === teil.text ? null : teil.text;
  if (alt === null) return { fehler: "Zieldatei fehlt" };

  const zeilen = alt.split("\n");
  const ende = zeilen.findIndex((z) => teil.endmarker.test(z));
  if (ende < 0) return { fehler: "Endmarker nicht gefunden" };

  const neu = teil.text.replace(/\n$/, "") + "\n" +
    zeilen.slice(ende + 1).join("\n");
  return neu === alt ? null : neu;
}

// ---------------------------------------------------------------------------
// Durchlauf
// ---------------------------------------------------------------------------

let geschrieben = 0, abweichend = 0, fehler = 0;
const spiele = registry.spiele.filter((s) => !nur.length || nur.includes(s.name));

if (nur.length && !spiele.length) {
  console.error(`Kein Spiel namens ${nur.join(", ")} in spiele.json.`);
  process.exit(2);
}

for (const spiel of spiele) {
  for (const [name, relativ] of Object.entries(spiel.gemeinsam ?? {})) {
    const teil = TEILE[name];
    if (!teil) {
      console.error(`  ! ${spiel.name}: unbekannter Teil "${name}" in spiele.json`);
      fehler++;
      continue;
    }

    const ziel = join(WURZEL, spiel.name, relativ);
    let alt;
    try {
      alt = readFileSync(ziel, "utf8");
    } catch {
      // Eine ganze Datei darf neu entstehen - so kommt ein Spiel ueberhaupt
      // erst an raum.js. Ein Block braucht dagegen eine Datei, in die er
      // hineingehoert; fehlt sie, stimmt der Pfad in spiele.json nicht.
      if (teil.modus !== "ganz") {
        console.error(`  ! ${spiel.name}/${relativ} fehlt`);
        fehler++;
        continue;
      }
      alt = null;
    }

    const neu = neuerInhalt(teil, alt);
    if (neu === null) continue;
    if (neu?.fehler) {
      console.error(`  ! ${spiel.name}/${relativ}: ${neu.fehler}`);
      fehler++;
      continue;
    }

    abweichend++;
    if (pruefen) {
      console.log(`  ~ ${spiel.name}/${relativ} weicht ab (${name})`);
    } else {
      writeFileSync(ziel, neu);
      console.log(`  → ${spiel.name}/${relativ} (${name})`);
      geschrieben++;
    }
  }
}

console.log("");
for (const [name, teil] of Object.entries(TEILE)) {
  console.log(`  ${name.padEnd(9)} ${teil.hash}  ${teil.quelle}`);
}
console.log("");

if (fehler) {
  console.error(`${fehler} Fehler.`);
  process.exit(2);
}
if (pruefen) {
  console.log(abweichend
    ? `${abweichend} Abweichung(en) - "node werkzeug/verteilen.mjs" schreibt sie fest.`
    : `Alles gleich (${spiele.length} Spiele geprueft).`);
  process.exit(abweichend ? 1 : 0);
}
console.log(`${geschrieben} Datei(en) geschrieben, ${spiele.length} Spiele geprueft.`);
