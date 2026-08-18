// Keep: Rechenprobe fuer das Scoring. Kein Browser, kein Dienst - nur
// `public/game-core.js`, die als reines ES-Modul auch unter Node laeuft.
//
//   node werkzeug/pruefe-keep-punkte.mjs
//
// Geprueft wird, was am 18.08.2026 umgebaut wurde:
//   K01  Grundwert kommt aus der Kombination, nicht aus dem Symbol.
//   K02  Symbolzuschlag: 0,2 % (Kleeblatt) bis 4,0 % (Herz).
//   K03  Rangfolge: keine haeufige Kombination kann eine seltenere schlagen.
//   K04  Ungueltiges gibt 0 (sonst waere es ein Fehlwurf, der Punkte gibt).
//   K05  Joker ist ein Notausgang, kein Jackpot.
//   K06  Glut: jede Kategorie laedt, Stufen bis x2, Abbau in Sekunden.

import {
  SYMBOLS, CATEGORIES, PAY, GLUT, scoreCategory, glutGewinn, glutFaktor,
} from '../keep/public/game-core.js';

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};
const w = (n) => n.toLocaleString('de-DE');
const fuell = (sym, n, rest = []) => [...Array(n).fill(sym), ...rest];

// ---------------------------------------------------------------- K01/K02
// Die Tafel aus der Absprache: Grundwert + Promille-Zuschlag des Symbols.
const ERWARTET = {
  five:      { kleeblatt: 501_000, hufeisen: 503_000, halbmond: 505_000, stern: 509_000, krone: 514_000, herz: 520_000 },
  four:      { kleeblatt: 100_200, hufeisen: 100_600, halbmond: 101_000, stern: 101_800, krone: 102_800, herz: 104_000 },
  fullhouse: { kleeblatt:  60_120, hufeisen:  60_360, halbmond:  60_600, stern:  61_080, krone:  61_680, herz:  62_400 },
  three:     { kleeblatt:  25_050, hufeisen:  25_150, halbmond:  25_250, stern:  25_450, krone:  25_700, herz:  26_000 },
  twopair:   { kleeblatt:  20_040, hufeisen:  20_120, halbmond:  20_200, stern:  20_360, krone:  20_560, herz:  20_800 },
  pair:      { kleeblatt:  10_020, hufeisen:  10_060, halbmond:  10_100, stern:  10_180, krone:  10_280, herz:  10_400 },
};

console.log('\nK01/K02  Grundwert je Kombination + Symbolzuschlag');
/** n verschiedene Symbole, die nicht `sym` sind - Fuellmaterial ohne zweites Paar. */
const andere = (sym, n) => SYMBOLS.map((x) => x.id).filter((x) => x !== sym).slice(0, n);

for (const s of SYMBOLS) {
  // Fuer Full House und Zwei Paare braucht es ein zweites, schwaecheres Symbol.
  // Beim schwaechsten (Kleeblatt) gibt es keines - siehe unten.
  const schwaecher = s.id === 'kleeblatt' ? null : 'kleeblatt';
  const faelle = [
    ['five',      'five',          fuell(s.id, 5)],
    ['four',      'four',          fuell(s.id, 4, andere(s.id, 1))],
    ['three',     'three_' + s.id, fuell(s.id, 3, andere(s.id, 2))],
    ['pair',      'pair',          fuell(s.id, 2, andere(s.id, 3))],
  ];
  if (schwaecher) {
    faelle.push(['fullhouse', 'fullhouse', fuell(s.id, 3, [schwaecher, schwaecher])]);
    // [s,s, klee,klee, x] - der Zuschlag muss vom staerkeren Paar kommen.
    faelle.push(['twopair', 'twopair',
      fuell(s.id, 2, [schwaecher, schwaecher, andere(s.id, 3).filter((x) => x !== schwaecher)[0]])]);
  }
  for (const [klasse, catId, reels] of faelle) {
    const soll = ERWARTET[klasse][s.id];
    const ist = scoreCategory(catId, reels);
    pruefe('K01', ist === soll, `${klasse.padEnd(9)} ${s.id.padEnd(9)} = ${w(ist)} (soll ${w(soll)})`);
  }
}
// Kleeblatt kann bei Full House und Zwei Paaren nie das fuehrende Symbol sein -
// jedes zweite Paar waere staerker. Genau das muss die Wahl auch tun.
pruefe('K01', scoreCategory('twopair', ['kleeblatt', 'kleeblatt', 'herz', 'herz', 'stern']) === ERWARTET.twopair.herz,
  'Zwei Paare: der Zuschlag kommt vom staerkeren Paar');
pruefe('K01', scoreCategory('fullhouse', ['kleeblatt', 'kleeblatt', 'kleeblatt', 'herz', 'herz']) === ERWARTET.fullhouse.kleeblatt,
  'Full House: der Zuschlag kommt vom Drilling, nicht vom Paar');
pruefe('K01', scoreCategory('fivedifferent', ['kleeblatt', 'hufeisen', 'halbmond', 'stern', 'krone']) === PAY.fivedifferent,
  `5 Verschiedene fest ${w(PAY.fivedifferent)}, egal welche fuenf`);
pruefe('K01', scoreCategory('fivedifferent', ['hufeisen', 'halbmond', 'stern', 'krone', 'herz']) === PAY.fivedifferent,
  '5 Verschiedene mit Herz ist keinen Punkt mehr wert');
pruefe('K01', scoreCategory('three_kleeblatt', fuell('kleeblatt', 5)) === ERWARTET.three.kleeblatt,
  'vier oder fuenf gleiche im 3er-Feld geben nicht mehr als drei');

// ---------------------------------------------------------------- K03
console.log('\nK03  Rangfolge: seltener schlaegt haeufiger, immer');
const leiter = ['pair', 'twopair', 'three', 'fivedifferent', 'fullhouse', 'four', 'five'];
const hoechst = (k) => (k === 'fivedifferent' ? PAY[k] : PAY[k] + Math.round(PAY[k] * 40 / 1000));
for (let i = 0; i < leiter.length - 1; i++) {
  const unten = hoechst(leiter[i]), oben = PAY[leiter[i + 1]];
  pruefe('K03', unten < oben,
    `${leiter[i]} mit Herz (${w(unten)}) bleibt unter ${leiter[i + 1]} mit Kleeblatt (${w(oben)})`);
}
// Und auch mit dem groessten Multiplikator kippt die Leiter nicht - der
// Multiplikator liegt ja auf beiden Seiten an.
pruefe('K03', hoechst('four') * 2 < PAY.five * 2, 'Vierling Herz x2 unter Fuenfling Kleeblatt x2');

// ---------------------------------------------------------------- K04
console.log('\nK04  Ungueltiges gibt null');
const nix = [
  ['five', fuell('herz', 4, ['krone'])],
  ['four', fuell('herz', 3, ['krone', 'stern'])],
  ['fullhouse', fuell('herz', 3, ['krone', 'stern'])],
  ['fullhouse', fuell('herz', 5)],
  ['twopair', fuell('herz', 4, ['krone'])],
  ['twopair', fuell('herz', 2, ['krone', 'stern', 'halbmond'])],
  ['three_herz', fuell('krone', 3, ['herz', 'herz'])],
  ['fivedifferent', ['herz', 'herz', 'krone', 'stern', 'halbmond']],
  ['pair', ['kleeblatt', 'hufeisen', 'halbmond', 'stern', 'krone']],
  ['joker', ['kleeblatt', 'hufeisen', 'halbmond', 'stern', 'krone']],
];
for (const [catId, reels] of nix) {
  pruefe('K04', scoreCategory(catId, reels) === 0, `${catId} bei [${reels.join(',')}]`);
}
pruefe('K04', scoreCategory('five', ['herz', 'herz', 'herz']) === 0, 'weniger als fuenf Walzen');
pruefe('K04', scoreCategory('gibtsnicht', fuell('herz', 5)) === 0, 'unbekannte Kategorie');

// ---------------------------------------------------------------- K05
console.log('\nK05  Joker: Notausgang, nicht Jackpot');
pruefe('K05', scoreCategory('joker', fuell('herz', 5)) === PAY.joker,
  `fest ${w(PAY.joker)} - auch bei fuenf Herzen`);
pruefe('K05', scoreCategory('joker', fuell('kleeblatt', 2, ['hufeisen', 'stern', 'krone'])) === PAY.joker,
  'derselbe Wert beim billigsten Paar');
pruefe('K05', PAY.joker <= PAY.pair, 'nie besser als das Zweierpaar');
let besser = 0;
for (let i = 0; i < 20000; i++) {
  const r = Array.from({ length: 5 }, () => SYMBOLS[Math.floor(Math.random() * 6)].id);
  const beste = Math.max(...CATEGORIES.filter((c) => c.id !== 'joker').map((c) => scoreCategory(c.id, r)));
  if (scoreCategory('joker', r) > beste) besser++;
}
pruefe('K05', besser === 0, `in 20.000 Wuerfen nie die beste Wahl (${besser}x)`);

// ---------------------------------------------------------------- K06
console.log('\nK06  Glut');
for (const c of CATEGORIES) {
  pruefe('K06', glutGewinn(c.id) > 0, `${c.id.padEnd(16)} laedt ${glutGewinn(c.id)}`);
}
pruefe('K06', glutGewinn('five') === GLUT.max, 'ein Fuenfling fuellt den Balken ganz');
pruefe('K06', glutGewinn('joker') === GLUT.laden.pair, 'Joker laedt wie ein Paar');
const stufen = [[0, 1], [19, 1], [20, 1.25], [59, 1.5], [60, 1.75], [79, 1.75], [80, 2], [100, 2]];
for (const [glut, soll] of stufen) {
  pruefe('K06', glutFaktor(glut) === soll, `Glut ${String(glut).padStart(3)} -> x${soll}`);
}
pruefe('K06', glutFaktor(GLUT.max) === 2, 'der Deckel liegt bei x2');
pruefe('K06', GLUT.max / GLUT.abbau > 15 && GLUT.max / GLUT.abbau < 20,
  `voller Balken haelt ${(GLUT.max / GLUT.abbau).toFixed(1)} s`);
// Ein Drilling (30) haelt einen 5-Sekunden-Zug gerade aus, ein Paar (15) nicht.
pruefe('K06', GLUT.laden.three - GLUT.abbau * 5 === 0, 'Drilling gleicht einen 5-Sekunden-Zug genau aus');
pruefe('K06', GLUT.laden.pair - GLUT.abbau * 5 < 0, 'ein Paar allein kuehlt den Balken aus');

// ---------------------------------------------------------------- Ende
console.log(`\n  ${gruen} gruen, ${rot} rot`);
if (rot) { console.error('\nBefunde:'); for (const b of befunde) console.error('  - ' + b); process.exit(1); }
