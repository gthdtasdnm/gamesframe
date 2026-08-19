// Keep: Toene und Effekte. Kein Browser, kein Dienst - nur die drei Dateien
// aus `keep/public/`.
//
// Der Grund steht in CLAUDE.md, Falle 4: in reinem JS geht ein unbekannter
// Name glatt durch jede Pruefung, und `sfx.jubelWasAuchImmer()` faellt erst
// auf, wenn im Spiel genau dieser Fall eintritt - beim Fuenfling also
// vielleicht nie. Deshalb wird hier jeder Aufruf, den `app.js` schreibt,
// gegen das gehalten, was die Module wirklich anbieten.
//
//   E01  Jede Stimme, die app.js ruft, gibt es in sfx.js.
//   E02  Jeder Effekt, den app.js ruft, gibt es in fx.js.
//   E03  Kein Aufruf zeigt mehr auf etwas Abgeschafftes.
//   E04  Jede Klasse, die der Code setzt, kennt auch styles.css.
//   E05  Ton aus bleibt aus - auch nach einem Neuladen.
//   E06  Ohne AudioContext faellt der Ton aus, nicht das Spiel.
//   E07  Der Schalter auf der Startseite und der Code meinen dasselbe.
//   E08  Die beiden Fallen aus CLAUDE.md (Steuerzeichen, deutsche
//        Anfuehrungszeichen in JS-Strings) sind in den neuen Dateien nicht
//        zugeschnappt.
//
//   node werkzeug/pruefe-keep-effekte.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8");

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

// Ein localStorage, damit sfx.js sich wie im Browser verhaelt. Muss stehen,
// bevor das Modul geladen wird - es liest die Einstellung beim Import.
const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
globalThis.window = globalThis;

const APP = lies("keep/public/app.js");
const FXQ = lies("keep/public/fx.js");
const CSS = lies("keep/public/styles.css");
const HTML = lies("keep/public/index.html");

const { sfx, freischalten, istStumm, setStumm } = await import("../keep/public/sfx.js");
const FX = await import("../keep/public/fx.js");

// ---------------------------------------------------------------- E01/E02
const gerufen = (quelle, praefix) =>
  [...new Set([...quelle.matchAll(new RegExp(`\\b${praefix}\\.([A-Za-zÄÖÜäöü]+)\\s*\\(`, "g"))].map((m) => m[1]))].sort();

const stimmen = gerufen(APP, "sfx");
pruefe("E01", stimmen.length >= 12, `app.js ruft ${stimmen.length} Stimmen: ${stimmen.join(", ")}`);
for (const name of stimmen) {
  pruefe("E01", typeof sfx[name] === "function", `sfx.${name}() gibt es`);
}

const effekte = gerufen(APP, "FX");
pruefe("E02", effekte.length >= 6, `app.js ruft ${effekte.length} Effekte: ${effekte.join(", ")}`);
for (const name of effekte) {
  pruefe("E02", typeof FX[name] === "function", `FX.${name}() gibt es`);
}

// Umgekehrt: was nie gerufen wird, ist toter Code - und toter Code in einer
// Datei voller Toene faellt niemandem auf, weil man ihn ja nicht hoert.
const totFX = Object.keys(FX).filter((k) => typeof FX[k] === "function" && !effekte.includes(k));
pruefe("E02", totFX.length === 0, totFX.length ? `nie gerufen: ${totFX.join(", ")}` : "kein Effekt liegt ungenutzt herum");
const totSfx = Object.keys(sfx).filter((k) => !stimmen.includes(k));
pruefe("E01", totSfx.length === 0, totSfx.length ? `nie gerufen: ${totSfx.join(", ")}` : "keine Stimme liegt ungenutzt herum");

// ---------------------------------------------------------------- E03
for (const alt of ["celebrate(", "renderReels(", "symbolEl("]) {
  const treffer = APP.split("\n").filter((z) => z.includes(alt) && !z.trimStart().startsWith("*") && !z.trimStart().startsWith("//"));
  pruefe("E03", treffer.length === 0, `nichts ruft mehr ${alt}…)${treffer.length ? " -> " + treffer[0].trim() : ""}`);
}

// ---------------------------------------------------------------- E04
// Jede Klasse, die JS setzt, muss in styles.css eine Regel haben - sonst
// passiert beim Rollen, Landen oder Zittern schlicht nichts.
const klassen = [
  "rollt", "spannung", "land", "gewinn", "gewinn-gross", "halt-an", "held",
  "eilig", "wackel", "wackel-klein", "bump", "hot", "low",
  "fx-zahl", "fx-welle", "fx-funke", "fx-muenze", "fx-konfetti",
  "burst", "jackpot", "gross", "schlecht",
  "flash", "flash-gross", "flash-jackpot", "flash-schlecht", "fx-lage",
];
for (const k of klassen) {
  const gesetzt = APP.includes(`'${k}'`) || APP.includes(`"${k}"`) || APP.includes(`${k}'`)
    || FXQ.includes(`'${k}'`) || FXQ.includes(`${k} `) || FXQ.includes(`fx-${k}`);
  const gestylt = new RegExp(`[.#]${k.replace(/-/g, "\\-")}[\\s,.:{)]`).test(CSS);
  pruefe("E04", gestylt, `styles.css kennt .${k}${gesetzt ? "" : " (im Code nicht gefunden - Liste veraltet?)"}`);
}

// ---------------------------------------------------------------- E05
setStumm(true);
pruefe("E05", istStumm() === true, "Ton aus laesst sich setzen");
pruefe("E05", speicher.get("keep-ton") === "aus", "und steht im localStorage");
const frisch = await import(`../keep/public/sfx.js?neu=${Date.now()}`);
pruefe("E05", frisch.istStumm() === true, "ein frisch geladenes Modul startet stumm");
setStumm(false);
pruefe("E05", istStumm() === false, "und laesst sich wieder anschalten");

// ---------------------------------------------------------------- E06
// Hier gibt es keinen AudioContext. Jede Stimme muss das aushalten: ein
// stummes Spiel ist in Ordnung, ein abgestuerztes nicht.
let geplatzt = null;
try {
  freischalten();
  for (const name of Object.keys(sfx)) sfx[name](1);
} catch (e) { geplatzt = e; }
pruefe("E06", geplatzt === null, geplatzt ? `sfx wirft: ${geplatzt.message}` : "alle Stimmen laufen ohne Audio durch");

// ---------------------------------------------------------------- E07
pruefe("E07", /data-ton="an"/.test(HTML) && /data-ton="aus"/.test(HTML), "die Startseite hat beide Schalterhaelften");
pruefe("E07", APP.includes("[data-ton]"), "app.js haengt sich an denselben Schalter");
pruefe("E07", APP.includes("setStumm(") && APP.includes("istStumm()"), "und benutzt beide Seiten der Schnittstelle");

// ---------------------------------------------------------------- E08
for (const [name, text] of [["sfx.js", lies("keep/public/sfx.js")], ["fx.js", FXQ], ["app.js", APP]]) {
  // Falle 1: echte Steuerzeichen in der Datei.
  const roh = [...text].some((c) => c.charCodeAt(0) < 9 || (c.charCodeAt(0) > 13 && c.charCodeAt(0) < 32) || c.charCodeAt(0) === 127);
  pruefe("E08", !roh, `${name} ohne rohe Steuerzeichen`);
  // Falle 2: deutsche Anfuehrungszeichen in einem einfachen JS-String.
  const bruch = /'[^'\n]*[„“][^'\n]*'/.test(text) || /"[^"\n]*„[^"\n]*"/.test(text);
  pruefe("E08", !bruch, `${name} ohne deutsche Anfuehrungszeichen mitten im String`);
}

console.log(`\n  ${gruen} gruen, ${rot} rot`);
if (rot) { console.error("\nBefunde:"); for (const b of befunde) console.error("  - " + b); process.exit(1); }
