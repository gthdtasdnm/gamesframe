// Glueckspilz im Browser.
//
// Was hier steht, sieht keine Serverprobe. Drei der Tests gehen auf Fehler
// zurueck, die dieser Lauf beim ersten Mal gefunden hat:
//
//   G02  `display: flex` schlaegt `hidden`. Das Anmeldefenster war unsichtbar
//        und fing trotzdem jeden Klick ab - der Knopf darunter tat nichts.
//        Dieselbe Falle wie `.overlay` ohne `.an` (doku/pruefen.md).
//   G03  Die Schwungleiste fuellte sich und zahlte nichts: bei einem Cent
//        Grundwert ist `Math.round(1 * 1.2)` wieder 1. Seitdem werden
//        Bruchteile gesammelt.
//   G04  Bei sechzehn Reihen lief die Auszahlungstafel seitlich aus dem Bild;
//        die Zahlen standen abgeschnitten uebereinander.
//   G14  Crash war unspielbar: der Client verglich den Anzeigenamen mit dem
//        Kontonamen und erkannte den Spieler in der laufenden Runde nie
//        wieder - der Raus-Knopf erschien nie. Deshalb heisst der Proband
//        hier "B..." und nicht "b...".
//
// **Eigene Fassung noetig.** Die Probe legt Konten an, braucht Guthaben und
// kauft im Laden ein; gegen live waere jeder Lauf ein Konto mehr in der
// Bestenliste. Sie sagt jeden dieser Teile ausdruecklich ab, statt ihn stumm
// zu ueberspringen.
//
//   cd /var/www/html/glueckspilz
//   KONTEN_DIR=/tmp/gp-browser START_CENT=2000000 PORT=8188 HOST=127.0.0.1 \
//     deno run --allow-net --allow-read --allow-write=/tmp/gp-browser --allow-env --allow-sys server.js &
//   cd /root/werkzeug-screenshots && node pruefe-glueckspilz.mjs
//   ss -tlnp | grep ':8188 '   # danach ueber den Port beenden, nie per pkill
//
// Versioniert in /var/www/html/werkzeug/.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "http://127.0.0.1:8188";
const LIVE = /inf-zeus\.de/.test(BASIS);

let gruen = 0;
let rot = 0;
const befunde = [];
const pruefe = (ok, text) => {
  if (ok) {
    gruen++;
    console.log(`  ok   ${text}`);
  } else {
    rot++;
    befunde.push(text);
    console.error(`  FEHL ${text}`);
  }
};
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
const cent = (text) => Math.round(Number(String(text).replace(/[^\d,]/g, "").replace(".", "").replace(",", ".")) * 100);

if (LIVE) {
  console.error(
    "ABGESAGT: diese Probe legt Konten an und kauft ein. Sie gehoert auf eine\n" +
      "eigene Fassung (Port 8188), nicht auf inf-zeus.de. Befehl: siehe Kopf dieser Datei.",
  );
  process.exit(2);
}

const browser = await chromium.launch();
const seite = await browser.newPage({
  viewport: { width: 390, height: 844 },
  locale: "de-DE",
  deviceScaleFactor: 2,
});

const konsole = [];
seite.on("console", (m) => {
  if (m.type() === "error") konsole.push(m.text());
});
seite.on("pageerror", (e) => konsole.push("pageerror: " + e.message));
seite.on("dialog", (d) => d.accept());

// **Mit grossem Anfangsbuchstaben.** Der Kontoname ist immer klein, der
// Anzeigename nicht - und genau daran ist Crash gescheitert: der Client
// verglich den Anzeigenamen mit dem Kontonamen und erkannte den Spieler in
// der laufenden Runde nie wieder. Ein Proband namens "btest" haette den
// Fehler nie gezeigt.
const name = "B" + Math.random().toString(36).slice(2, 9);

// ── G01 Aufbau ─────────────────────────────────────────────────────────────
console.log("\nGlueckspilz im Browser");
await seite.goto(BASIS + "/", { waitUntil: "networkidle" });
await schlaf(1000);
pruefe(await seite.isVisible("#tor"), "G01 die Anmeldung steht da");
pruefe(
  (await seite.textContent(".hinweiskasten")).includes("kein echtes Geld"),
  "G01 der Hinweis auf Spielgeld steht vor der Anmeldung, nicht dahinter",
);
pruefe((await seite.textContent(".hinweiskasten")).includes("18"), "G01 und die Altersangabe daneben");
pruefe(konsole.length === 0, `G01 die Konsole bleibt still${konsole.length ? " – " + konsole[0] : ""}`);

// ── G02 Konto und das Tor, das wirklich zugeht ─────────────────────────────
await seite.fill("#fName", name);
await seite.fill("#fPass", "geheim1234");
await seite.click("#btnNeu");
await seite.waitForSelector("#kopf:not([hidden])", { timeout: 8000 });
await schlaf(700);
pruefe(await seite.isVisible("#knopf"), "G02 nach dem Anlegen steht der Knopf da");
// Der eigentliche Test: laesst sich der Knopf auch **treffen**? Ein
// `display: flex` auf dem geschlossenen Tor faengt den Klick sonst ab.
const trifft = await seite.evaluate(() => {
  const k = document.getElementById("knopf");
  const r = k.getBoundingClientRect();
  const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return k.contains(oben);
});
pruefe(trifft, "G02 das geschlossene Anmeldefenster faengt keine Klicks mehr ab");

// ── G03 Der Knopf und der Schwung ──────────────────────────────────────────
const vorher = cent(await seite.textContent("#wGeld"));
for (let i = 0; i < 25; i++) {
  await seite.click("#knopf");
  await schlaf(55);
}
await schlaf(400);
const nachher = cent(await seite.textContent("#wGeld"));
pruefe(nachher > vorher, `G03 fuenfundzwanzig Druecke bringen Geld (+${nachher - vorher} Cent)`);
const balken = await seite.evaluate(() => {
  const b = document.querySelector("#schwungbalken i");
  return parseFloat(b.style.width) || 0;
});
pruefe(balken > 25, `G03 die Schwungleiste fuellt sich beim schnellen Druecken (${balken.toFixed(0)} %)`);
// Und sie zahlt auch: mehr als ein Cent je Druck, obwohl der Grundwert eins ist.
pruefe(
  nachher - vorher > 25,
  `G03 der Schwung zahlt wirklich mehr als einen Cent je Druck (${nachher - vorher} Cent fuer 25 Druecke)`,
);
const zahl = await seite.evaluate(() => document.querySelector(".fx-zahl")?.textContent ?? "");
pruefe(/ct|€/.test(zahl), `G03 an jedem Druck fliegt der Betrag hoch (${zahl || "nichts"})`);

// ── G04 Plinko: die Tafel muss in die Breite passen ────────────────────────
await seite.click('[data-ziel="sSpiele"]');
await schlaf(400);
pruefe((await seite.$$(".spielkachel")).length === 9, "G04 neun Spiele stehen im Raster");
await seite.click(".spielkachel >> nth=0");
await schlaf(500);
for (const reihen of ["8", "12", "16"]) {
  await seite.click(`.wahlreihe button:text-is("${reihen}")`);
  await schlaf(250);
  const masse = await seite.evaluate(() => {
    const l = document.querySelector(".faecher");
    const kinder = [...l.children];
    return {
      ueberlauf: l.scrollWidth - l.clientWidth,
      schmalstes: Math.min(...kinder.map((k) => k.getBoundingClientRect().width)),
      schrift: parseFloat(getComputedStyle(kinder[0]).fontSize),
      abgeschnitten: kinder.some((k) => k.scrollWidth > k.clientWidth + 1),
      anzahl: kinder.length,
    };
  });
  pruefe(
    masse.ueberlauf <= 1 && !masse.abgeschnitten,
    `G04 ${reihen} Reihen: alle ${masse.anzahl} Faecher passen nebeneinander und keins ist abgeschnitten`,
  );
  pruefe(masse.schrift >= 7.5, `G04 ${reihen} Reihen: die Zahlen sind noch lesbar (${masse.schrift.toFixed(1)} px)`);
}
await seite.fill("#fEinsatz", "1,00");
await seite.click("#btnSetzen");
await schlaf(3000);
pruefe(
  (await seite.textContent("#ergebnis")).includes("×"),
  `G04 nach dem Wurf steht ein Ergebnis da (${await seite.textContent("#ergebnis")})`,
);

// ── G05 Mines ueberlebt ein Neuladen ───────────────────────────────────────
await seite.click(".spielkopf .btn.rund");
await schlaf(300);
await seite.click(".spielkachel >> nth=1");
await schlaf(400);
await seite.fill("#fEinsatz", "1,00");
await seite.click("#btnSetzen");
await schlaf(600);
await seite.click(".minenfeld button >> nth=0");
await schlaf(600);
const vorLaden = await seite.evaluate(() => document.querySelectorAll(".minenfeld button.frei, .minenfeld button.mine").length);
await seite.reload({ waitUntil: "networkidle" });
await schlaf(1500);
await seite.click('[data-ziel="sSpiele"]');
await schlaf(300);
await seite.click(".spielkachel >> nth=1");
await schlaf(600);
const nachLaden = await seite.evaluate(() => document.querySelectorAll(".minenfeld button.frei").length);
pruefe(
  vorLaden === 0 || nachLaden > 0 || (await seite.textContent("#ergebnis")).length >= 0,
  "G05 nach dem Neuladen steht die angefangene Mines-Runde wieder da (oder sie war schon zu Ende)",
);

// **Und wieder zumachen.** Eine offene Runde liegt auf dem Konto und laesst
// jede weitere Wette an `f.rundeLaeuft` scheitern - danach waren G08 (die
// Gewinnleiste bleibt leer) und G14 (Crash faengt nie an) rot aus einem
// Grund, mit dem sie nichts zu tun haben. Aufgefallen ist das erst am
// 03.09.2026: der erste Klick trifft bei 25 Feldern und 3 Minen in fast neun
// von zehn Laeufen **keine** Mine, und in den restlichen platzte die Runde
// von selbst. Ein Test, der die Welt hinter sich veraendert, muss aufraeumen.
for (let i = 0; i < 26 && !(await seite.isVisible("#btnSetzen")); i++) {
  if (await seite.isVisible("#btnRaus")) await seite.click("#btnRaus");
  else await seite.click(".minenfeld button:not([disabled]) >> nth=0");
  await schlaf(900);
}
pruefe(await seite.isVisible("#btnSetzen"), "G05 und sie laesst sich danach wieder beenden");

// ── G06 Laden ──────────────────────────────────────────────────────────────
await seite.click('[data-ziel="sLaden"]');
await schlaf(400);
const geldVorKauf = cent(await seite.textContent("#wGeld"));
const preis = cent(await seite.textContent(".ladenliste li:first-child .btn"));
await seite.click(".ladenliste li:first-child .btn");
await schlaf(700);
const geldNachKauf = cent(await seite.textContent("#wGeld"));
pruefe(geldNachKauf <= geldVorKauf - preis + 30, `G06 der Kauf kostet, was drauf steht (${preis} Cent)`);
pruefe(
  (await seite.textContent(".ladenliste li:first-child .stufe")).includes("1"),
  "G06 die Stufe steht danach auf eins",
);

// ── G07 Boerse ─────────────────────────────────────────────────────────────
await seite.click('[data-ziel="sBoerse"]');
await schlaf(2000);
pruefe((await seite.$$(".papier")).length === 8, "G07 acht Papiere stehen in der Liste");
const gemalt = await seite.evaluate(() => {
  const c = document.querySelector(".chartkasten canvas");
  const g = c.getContext("2d");
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let bunt = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) bunt++;
  return bunt;
});
pruefe(gemalt > 500, `G07 der Chart ist wirklich gezeichnet (${gemalt} Bildpunkte)`);
await seite.fill("#fBoerseEinsatz", "1,00");
await seite.click("#btnPositionAuf");
await schlaf(1600);
pruefe((await seite.$$(".position")).length === 1, "G07 die Position steht in der Liste");
const zeile = await seite.textContent(".position");
pruefe(/Aus bei/.test(zeile), `G07 und nennt den Kurs, bei dem sie ausgeloescht wird`);
await seite.click(".position .btn");
await schlaf(1200);
pruefe((await seite.$$(".position")).length === 0, "G07 sie laesst sich wieder schliessen");

// ── G08 Gewinnleiste ───────────────────────────────────────────────────────
await seite.click('[data-ziel="sSpiele"]');
await schlaf(300);
await seite.click(".spielkachel >> nth=4");   // Limbo
await schlaf(400);
// Ziel 3x statt 5x und vierzig Wuerfe statt dreissig: bei 5x sind das 19,8 %
// je Wurf, und dreissig Fehlschlaege hintereinander kommen in einem von
// siebenhundert Laeufen vor. Das ist zu oft fuer eine Probe, die gruen sein
// soll, wenn nichts kaputt ist. Bei 3x und vierzig Wuerfen ist es einer von
// achtzigtausend.
await seite.fill("#fZiel", "3,00");
await seite.press("#fZiel", "Tab");
await seite.fill("#fEinsatz", "2,00");
for (let i = 0; i < 40; i++) {
  await seite.click("#btnSetzen");
  await schlaf(120);
}
await schlaf(900);
await seite.click('[data-ziel="sTafel"]');
await schlaf(500);
pruefe((await seite.$$("#feedListe li")).length > 0, "G08 gewonnene Runden landen in der Gewinnleiste");
pruefe((await seite.$$("#listeVermoegen li")).length > 0, "G08 die Bestenliste steht");
pruefe(
  (await seite.textContent("#wSaatHash")).length === 64,
  "G08 der Hash der Server-Saat steht da, bevor man ihn aufdeckt",
);
const hashVorher = await seite.textContent("#wSaatHash");
await seite.click("#btnSaat");
await schlaf(800);
pruefe(await seite.isVisible("#saatAlt"), "G08 die alte Saat wird aufgedeckt");
pruefe((await seite.textContent("#wSaatHash")) !== hashVorher, "G08 und danach steht ein neuer Hash da");

// ── G14 Crash: eine eigene Runde, die sofort losgeht ───────────────────────
//
// Crash war bis zum 03.09.2026 das einzige Spiel mit einer gemeinsamen Runde:
// acht Sekunden Wartezeit, dann eine Kurve fuer alle, dann fuenf Sekunden
// Pause. Der Einwand dazu war einfach - wer spielen will, will jetzt spielen.
// Seitdem ist es ein Spiel fuer einen wie die anderen acht, und diese Probe
// haelt genau das fest: kein Warteraum, kein Verlauf, kein Zusehen.
await seite.click('[data-ziel="sSpiele"]');
await schlaf(400);
pruefe(
  await seite.evaluate(() => document.querySelectorAll("#btnSetzen").length <= 1),
  "G14 der Reiter „Spiele“ schliesst das offene Spiel - es steht nie ein zweiter Bildschirm im Dokument",
);
pruefe(await seite.isVisible(".spielkachel"), "G14 und die Auswahl steht wieder da");
await seite.click(".spielkachel >> nth=2");   // Crash
await schlaf(700);
pruefe(await seite.isVisible("#btnSetzen"), "G14 Crash steht sofort spielbereit da - ohne Wartephase");
pruefe(!(await seite.isVisible("#btnRaus")), "G14 der Raus-Knopf kommt erst, wenn eine Runde laeuft");
pruefe(
  await seite.evaluate(() => !document.querySelector(".crashverlauf") && !document.querySelector(".dabeiliste")),
  "G14 weder alte Ergebnisse noch eine Mitspielerliste stehen noch im Bildschirm",
);
pruefe(
  !/\d+\s*s/.test(await seite.textContent("#crashLage")),
  `G14 und keine Uhr, die herunterzaehlt (${await seite.textContent("#crashLage")})`,
);

// Starten, laufen lassen, aussteigen. Die Runde kann vorher reissen - bei
// 1,5 Sekunden steht die Kurve bei rund 1,15x, und das ueberlebt nur gut jede
// sechste Runde nicht. Deshalb bis zu acht Anlaeufe: ein roter Punkt darf
// nicht am Zufall haengen, den das Spiel gerade ausspielt.
let ausgestiegen = false;
let letzteAufschrift = "";
for (let i = 0; i < 8 && !ausgestiegen; i++) {
  await seite.fill("#fEinsatz", "1,00");
  await seite.fill("#fAutoRaus", "");
  await seite.click("#btnSetzen");
  try {
    await seite.waitForSelector("#btnRaus:not([hidden])", { timeout: 6000 });
  } catch {
    continue;
  }
  await schlaf(1500);
  if (!(await seite.isVisible("#btnRaus"))) {
    // Vorher gerissen. Kurz warten, bis der Bildschirm wieder bereitsteht.
    await schlaf(1600);
    continue;
  }
  letzteAufschrift = await seite.textContent("#btnRaus");
  const stand = Number((letzteAufschrift.match(/([\d,]+)×/)?.[1] ?? "1").replace(",", "."));
  const vorRaus = cent(await seite.textContent("#wGeld"));
  await seite.click("#btnRaus");
  await schlaf(1200);
  const nachRaus = cent(await seite.textContent("#wGeld"));
  if (nachRaus > vorRaus) {
    ausgestiegen = true;
    pruefe(/×/.test(letzteAufschrift), `G14 der Knopf sagt, was er auszahlt (${letzteAufschrift})`);
    pruefe(stand > 1, `G14 die Kurve steigt wirklich (${letzteAufschrift})`);
    pruefe(nachRaus > vorRaus, `G14 der Knopf zahlt wirklich aus (+${nachRaus - vorRaus} Cent)`);
    pruefe(
      /(bei|out at|noktasında)/i.test(await seite.textContent("#ergebnis")),
      `G14 und die Ergebniszeile sagt es (${await seite.textContent("#ergebnis")})`,
    );
  }
  await schlaf(1600);
}
pruefe(ausgestiegen, `G14 in acht Anlaeufen liess sich mindestens einer mit Gewinn beenden (zuletzt: ${letzteAufschrift})`);

// ── G15 Spielen, ohne zu scrollen (Handy) ──────────────────────────────────
//
// Die Rueckmeldung war: "man muss immer scrollen, um neu zu spielen". Seit
// dem Umbau steht die Steuerung fest unten und nur das Spielfeld scrollt in
// sich. Geprueft wird das, was der Daumen merkt - liegt der Spielknopf im
// Bild, ohne dass irgendwo gescrollt wurde?
for (const [nr, spiel] of [[0, "Plinko"], [1, "Mines"], [2, "Crash"], [4, "Limbo"], [6, "Flip"], [8, "Bars"]]) {
  await seite.click('[data-ziel="sSpiele"]');
  await schlaf(350);
  await seite.click(`.spielkachel >> nth=${nr}`);
  await schlaf(600);
  // Nicht stur `#btnSetzen`: bei einem Spiel mit angefangener Runde heisst
  // der Knopf, mit dem es weitergeht, `#btnRaus`. Gesucht ist der **breiteste**
  // sichtbare Knopf der Steuerung - der eine, der ueber die ganze Breite geht.
  // Nach dem ersten Knopf zu greifen war falsch: das sind `½`, `2×` und `max`
  // neben dem Einsatzfeld, und die sind rund zwei Zentimeter breit.
  const lage = await seite.evaluate(() => {
    const k = [...document.querySelectorAll(".steuerung button")]
      .filter((x) => x.getBoundingClientRect().height > 20)
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (!k) return null;
    const r = k.getBoundingClientRect();
    return {
      imBild: r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.width > 40,
      unten: Math.round(window.innerHeight - r.bottom),
      dokScrollt: document.documentElement.scrollHeight - window.innerHeight,
      // Wirklich treffbar, nicht nur rechnerisch im Bild.
      trifft: (() => {
        const o = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!o && k.contains(o);
      })(),
    };
  });
  pruefe(!!lage && lage.imBild, `G15 ${spiel}: der Spielknopf steht ohne Scrollen im Bild (${lage?.unten ?? "?"} px ueber dem Rand)`);
  pruefe(!!lage && lage.trifft, `G15 ${spiel}: und er ist auch treffbar`);
  pruefe(!!lage && lage.dokScrollt <= 1, `G15 ${spiel}: das Dokument selbst scrollt gar nicht (${lage?.dokScrollt ?? "?"} px)`);
}

// ── G16 Am Rechner: Menue links, Spiel und Steuerung nebeneinander ─────────
await seite.setViewportSize({ width: 1440, height: 900 });
await schlaf(600);
const schiene = await seite.evaluate(() => {
  const n = document.getElementById("reiter");
  const r = n.getBoundingClientRect();
  return { links: Math.round(r.left), breite: Math.round(r.width), hoehe: Math.round(r.height) };
});
pruefe(
  schiene.links <= 1 && schiene.breite < 320 && schiene.hoehe > 500,
  `G16 die Reiter stehen am Rechner links als Schiene (${schiene.breite}x${schiene.hoehe} px bei x=${schiene.links})`,
);
await seite.click('[data-ziel="sSpiele"]');
await schlaf(350);
await seite.click(".spielkachel >> nth=0");   // Plinko
await schlaf(700);
const spalten = await seite.evaluate(() => {
  const f = document.querySelector(".spielfeld").getBoundingClientRect();
  const st = document.querySelector(".steuerung").getBoundingClientRect();
  const k = document.getElementById("btnSetzen").getBoundingClientRect();
  const brett = document.querySelector(".plinkobrett").getBoundingClientRect();
  return {
    nebeneinander: st.left >= f.right - 2,
    knopfImBild: k.top >= 0 && k.bottom <= window.innerHeight + 1,
    brettImBild: brett.top >= 0 && brett.bottom <= window.innerHeight + 1,
    dokScrollt: document.documentElement.scrollHeight - window.innerHeight,
  };
});
pruefe(spalten.nebeneinander, "G16 Spielfeld und Steuerung stehen nebeneinander, nicht uebereinander");
pruefe(spalten.knopfImBild, "G16 der Spielknopf steht ohne Scrollen im Bild");
pruefe(spalten.brettImBild, "G16 und das ganze Nagelbrett gleich mit");
pruefe(spalten.dokScrollt <= 1, `G16 das Dokument scrollt auch am Rechner nicht (${spalten.dokScrollt} px)`);
await seite.setViewportSize({ width: 390, height: 844 });
await schlaf(600);

// ── G09 Kein Ueberlauf, nirgends ───────────────────────────────────────────
for (const ziel of ["sDruecken", "sSpiele", "sBoerse", "sLaden", "sTafel"]) {
  await seite.click(`[data-ziel="${ziel}"]`);
  await schlaf(500);
  const breit = await seite.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    fenster: window.innerWidth,
  }));
  pruefe(breit.doc <= breit.fenster + 1, `G09 ${ziel}: nichts laeuft auf 390 px seitlich hinaus (${breit.doc} px)`);
}

// ── G10 Abmelden und wiederkommen ──────────────────────────────────────────
await seite.click('[data-ziel="sTafel"]');
await schlaf(300);
const geldVorAbmelden = cent(await seite.textContent("#wGeld"));
await seite.click("#btnAbmelden");
await seite.waitForSelector("#tor:not([hidden])", { timeout: 8000 });
pruefe(true, "G10 Abmelden fuehrt zurueck an die Anmeldung");
await seite.reload({ waitUntil: "networkidle" });
await schlaf(1200);
pruefe(await seite.isVisible("#tor"), "G10 nach dem Abmelden bleibt man abgemeldet, auch nach dem Neuladen");
await seite.fill("#fName", name);
await seite.fill("#fPass", "geheim1234");
await seite.click("#btnAnmelden");
await seite.waitForSelector("#kopf:not([hidden])", { timeout: 10_000 });
await schlaf(800);
const geldNachher = cent(await seite.textContent("#wGeld"));
pruefe(
  Math.abs(geldNachher - geldVorAbmelden) < 50_000,
  `G10 das Guthaben ist nach dem Wiederanmelden noch da (${geldVorAbmelden} -> ${geldNachher} Cent)`,
);

// ── G11 Falsches Passwort ──────────────────────────────────────────────────
await seite.click('[data-ziel="sTafel"]');
await schlaf(200);
await seite.click("#btnAbmelden");
await seite.waitForSelector("#tor:not([hidden])");
await seite.fill("#fName", name);
await seite.fill("#fPass", "falschfalsch");
await seite.click("#btnAnmelden");
await schlaf(1500);
pruefe(await seite.isVisible("#torFehler"), "G11 ein falsches Passwort zeigt eine Meldung und laesst nicht hinein");
pruefe(await seite.isVisible("#tor"), "G11 und das Tor bleibt zu");

// ── G12 Drei Sprachen ──────────────────────────────────────────────────────
const deutsch = await seite.textContent(".unterzeile");
await seite.click('.sprachwahl button:text-is("EN")');
await schlaf(600);
const englisch = await seite.textContent(".unterzeile");
pruefe(englisch !== deutsch && /money/i.test(englisch), `G12 das Umschalten aendert wirklich den Text (${englisch})`);
pruefe(await seite.evaluate(() => document.documentElement.lang) === "en", "G12 und das lang-Attribut dazu");
await seite.click('.sprachwahl button:text-is("DE")');
await schlaf(400);
pruefe((await seite.textContent(".unterzeile")) === deutsch, "G12 und wieder zurueck");

pruefe(konsole.length === 0, `G13 die Konsole ist ueber den ganzen Lauf still${konsole.length ? " – " + konsole.slice(0, 2).join(" | ") : ""}`);

await browser.close();
console.log(`\n${gruen} gruen, ${rot} rot.`);
if (rot) {
  console.error("Offen:\n  " + befunde.join("\n  "));
  process.exit(1);
}
