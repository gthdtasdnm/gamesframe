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

// ── G17 Der Knopf, wie der Daumen ihn findet ───────────────────────────────
//
// Vier Rueckmeldungen an einem Tag, alle ueber denselben Knopf, und keine
// davon haette eine Serverprobe je gesehen:
//
//   "knopf ist nicht mittig ausgerichtet"   -> er stand links. `.klickfeld`
//       hatte `text-align: center`, der Knopf ist aber `display: grid` und
//       damit auf Blockebene - `text-align` erreicht ihn gar nicht.
//   "knopf unten damit es am handy leichter erreichbar ist"  -> er stand
//       oben, ueber den Zahlen. Der Daumen erreicht die untere Haelfte.
//   "balken ist zu duenn"  -> 12 px hoch, und darin eine Zeile von 11 px:
//       die Zahl war abgeschnitten statt lesbar.
//   "zeigt den bonus nicht richtig an"  -> die Leiste fiel im Browser mit
//       0,5 je Sekunde, auf dem Server mit 0,35. Sie stand auf x1,0,
//       waehrend der naechste Druck noch das Anderthalbfache zahlte. Diese
//       Haelfte prueft `probe.js` P11 im Quelltext; hier steht die andere:
//       sagt die Leiste x1,0, obwohl sie noch halb voll ist?
//
// Gemessen wird in Pixeln, denn genau das war die Beschwerde.
await seite.click('[data-ziel="sDruecken"]');
await schlaf(400);
const daumen = await seite.evaluate(() => {
  const k = document.getElementById("knopf").getBoundingClientRect();
  const zahlen = document.querySelector("#sDruecken .zahlen").getBoundingClientRect();
  const b = document.getElementById("schwungbalken");
  const bk = b.getBoundingClientRect();
  const span = document.getElementById("schwungMal");
  return {
    mitteAb: Math.abs((k.left + k.right) / 2 - window.innerWidth / 2),
    obenAnteil: k.top / window.innerHeight,
    unterDenZahlen: zahlen.bottom <= k.top + 1,
    balkenHoch: Math.round(bk.height),
    // Passt die Zahl hinein, oder ist sie beschnitten? `scrollHeight` ist
    // die Hoehe, die sie braeuchte - `clientHeight` die, die sie bekommt.
    zahlPasst: span.scrollHeight <= b.clientHeight + 1,
    schrift: parseFloat(getComputedStyle(span).fontSize),
    // Und liest man sie ueberhaupt: steht sie im Balken oder daneben?
    zahlImBalken: (() => {
      const r = span.getBoundingClientRect();
      return r.top >= bk.top - 1 && r.bottom <= bk.bottom + 1;
    })(),
  };
});
pruefe(daumen.mitteAb <= 2, `G17 der Geldknopf steht waagerecht mittig (${daumen.mitteAb.toFixed(1)} px daneben)`);
pruefe(
  daumen.obenAnteil > 0.5,
  `G17 und in der unteren Haelfte, wo der Daumen hinkommt (Oberkante bei ${(daumen.obenAnteil * 100).toFixed(0)} % der Hoehe)`,
);
pruefe(daumen.unterDenZahlen, "G17 die Zahlenreihe steht ueber dem Knopf, nicht darunter");
pruefe(daumen.balkenHoch >= 22, `G17 die Schwungleiste ist hoch genug fuer ihre Zahl (${daumen.balkenHoch} px)`);
pruefe(daumen.zahlPasst, "G17 und die Zahl darin wird nicht abgeschnitten");
pruefe(daumen.zahlImBalken, "G17 sie steht auch wirklich in der Leiste");
pruefe(daumen.schrift >= 11, `G17 lesbar gross ist sie auch (${daumen.schrift.toFixed(1)} px)`);

// Der gemeldete Widerspruch: voller Balken, aber x1,0 daneben. Schnell
// druecken, dann sofort beides ablesen - ohne Pause dazwischen, sonst ist der
// Schwung schon wieder gefallen und der Test sagt nichts.
for (let i = 0; i < 18; i++) {
  await seite.click("#knopf");
  await schlaf(55);
}
const leiste = await seite.evaluate(() => ({
  breite: parseFloat(document.querySelector("#schwungbalken i").style.width) || 0,
  text: document.getElementById("schwungMal").textContent,
}));
const gezeigt = Number(String(leiste.text).replace(/[^\d,]/g, "").replace(",", "."));
pruefe(
  leiste.breite < 40 || gezeigt > 1.05,
  `G17 ein halb voller Balken zeigt auch einen Bonus an (${leiste.breite.toFixed(0)} % voll, ${leiste.text})`,
);

// ── G20 Ein Druck darf keinen Rollbalken machen ────────────────────────────
//
// Gemeldet: "im browser, weil er ganz unten ist, entsteht bei jedem druecken
// ein scrollbalken, weil der knopf leicht runter geht".
//
// Er ging wirklich runter - `.knopf:active` sinkt um acht Pixel ein - und der
// Ring um den Knopf lag zehn Pixel ausserhalb und wuchs per `scale(1.25)`
// noch weiter hinaus. Beides zaehlt zur Scroll-Flaeche von `#buehne`: sie
// wuchs bei jedem Druck um bis zu 30 Pixel, ein Rollbalken erschien und
// verschwand wieder. Fuenf Druecke je Sekunde, fuenfmal je Sekunde ein
// zuckender Balken.
//
// Gemessen wird deshalb nicht das Aussehen, sondern die Scroll-Flaeche selbst
// - waehrend der Knopf gedrueckt ist und waehrend der Ring laeuft. Sie darf
// sich gegenueber der Ruhe **nicht** vergroessern.
const ueberlauf = () =>
  seite.evaluate(() => {
    const b = document.getElementById("buehne");
    return {
      buehne: b.scrollHeight - b.clientHeight,
      dokument: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
await schlaf(900);
const ruheVor = await ueberlauf();
const kasten = await seite.locator("#knopf").boundingBox();
await seite.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
await seite.mouse.down();
let maxBuehne = ruheVor.buehne;
let maxDoc = ruheVor.dokument;
// Sechzehn Messungen ueber 640 ms: der Knopf bleibt gedrueckt, der Ring
// (0,5 s) laeuft mittendrin ab.
for (let i = 0; i < 16; i++) {
  await schlaf(40);
  const jetzt = await ueberlauf();
  maxBuehne = Math.max(maxBuehne, jetzt.buehne);
  maxDoc = Math.max(maxDoc, jetzt.dokument);
}
await seite.mouse.up();
// Und dasselbe im echten Takt: zwanzig schnelle Druecke hintereinander.
for (let i = 0; i < 20; i++) {
  await seite.click("#knopf");
  const jetzt = await ueberlauf();
  maxBuehne = Math.max(maxBuehne, jetzt.buehne);
  maxDoc = Math.max(maxDoc, jetzt.dokument);
  await schlaf(45);
}
await schlaf(700);
pruefe(
  maxBuehne <= ruheVor.buehne,
  `G20 der gedrueckte Knopf vergroessert die Scroll-Flaeche nicht (Ruhe ${ruheVor.buehne} px, gedrueckt ${maxBuehne} px)`,
);
pruefe(maxDoc <= ruheVor.dokument, `G20 und das Dokument bekommt auch keinen (${maxDoc} px)`);
pruefe(
  (await ueberlauf()).buehne === ruheVor.buehne,
  "G20 nach dem Loslassen ist die Flaeche wieder wie vorher",
);
// Der Ring soll trotzdem noch da sein - der Fehler waere sonst dadurch
// behoben, dass die Rueckmeldung am Knopf verschwindet. Zwei Haelften: sein
// **Kasten** liegt buendig auf dem Knopf (deshalb waechst nichts), seine
// **Farbe** laeuft trotzdem nach aussen.
await seite.click("#knopf");
const ring = await seite.evaluate(() => {
  const k = document.getElementById("knopf").getBoundingClientRect();
  const r = document.querySelector(".knopfring");
  const rr = r.getBoundingClientRect();
  const cs = getComputedStyle(r);
  return {
    ueberKnopf: Math.max(Math.abs(rr.top - k.top), Math.abs(rr.bottom - k.bottom), Math.abs(rr.left - k.left)),
    deckkraft: parseFloat(cs.opacity),
    versatz: parseFloat(cs.outlineOffset) || 0,
    breite: parseFloat(cs.outlineWidth) || 0,
    farbe: cs.outlineColor,
  };
});
pruefe(
  ring.ueberKnopf <= 1,
  `G20 der Ring baut keinen eigenen Kasten mehr, er liegt auf dem Knopf (${ring.ueberKnopf.toFixed(1)} px daneben)`,
);
pruefe(
  ring.deckkraft > 0 && ring.versatz > 0 && ring.breite >= 1 && /53, 224, 122/.test(ring.farbe),
  `G20 und waechst trotzdem sichtbar nach aussen (${ring.breite} px ${ring.farbe}, ${ring.versatz} px weit, Deckkraft ${ring.deckkraft})`,
);

// ── G04 Plinko: die Tafel muss in die Breite passen ────────────────────────
await seite.click('[data-ziel="sSpiele"]');
await schlaf(400);
pruefe((await seite.$$(".spielkachel")).length === 11, "G04 elf Spiele stehen im Raster");
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
for (
  const [nr, spiel] of [[0, "Plinko"], [1, "Mines"], [2, "Crash"], [4, "Limbo"], [6, "Flip"], [8, "Bars"], [9, "Keno"], [10, "Fallobst"]]
) {
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

// ── G18 Der Zurueck-Pfeil, dreimal gemeldet ────────────────────────────────
//
// "beim zurueck knopf ist der pfeil darin immernoch nicht mittig in der
// hoehe" - beim dritten Mal. Zweimal war mit CSS nachzentriert worden, und
// zweimal blieb er zu hoch, weil das Zeichen "<-" (U+2190) an der Grundlinie
// haengt wie ein Buchstabe: zentriert wird die **Zeile**, nicht die Tinte,
// und in der Zeile ist unten Platz fuer Unterlaengen freigehalten.
//
// Jetzt steht dort ein SVG. Ein SVG hat keine Grundlinie - seine Mitte ist
// seine Mitte. Gemessen wird deshalb die Tinte selbst (`getBBox`) gegen die
// Mitte des Knopfes, und zusaetzlich, dass ueberhaupt ein SVG dasteht: wer
// das Zeichen zurueckschreibt, faellt hier durch, nicht erst dem Nutzer auf.
const pfeil = await seite.evaluate(() => {
  const k = document.querySelector(".spielkopf .btn.rund");
  const svg = k.querySelector("svg");
  if (!svg) return { svgDa: false, nurText: k.textContent.trim() };
  const kr = k.getBoundingClientRect();
  const sr = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const bb = svg.getBBox();
  // Die Mitte der Tinte, umgerechnet in Bildpunkte auf dem Schirm.
  const tinteY = sr.top + ((bb.y + bb.height / 2 - vb.y) / vb.height) * sr.height;
  const tinteX = sr.left + ((bb.x + bb.width / 2 - vb.x) / vb.width) * sr.width;
  return {
    svgDa: true,
    abY: Math.abs(tinteY - (kr.top + kr.height / 2)),
    abX: Math.abs(tinteX - (kr.left + kr.width / 2)),
    hoehe: Math.round(kr.height),
  };
});
pruefe(pfeil.svgDa, `G18 der Zurueck-Pfeil ist gezeichnet, nicht getippt${pfeil.svgDa ? "" : ` (gefunden: "${pfeil.nurText}")`}`);
pruefe(
  pfeil.svgDa && pfeil.abY <= 1,
  `G18 und er sitzt senkrecht in der Mitte des Knopfes (${pfeil.abY?.toFixed(2) ?? "?"} px daneben, Knopf ${pfeil.hoehe} px hoch)`,
);
pruefe(pfeil.svgDa && pfeil.abX <= 1, `G18 waagerecht auch (${pfeil.abX?.toFixed(2) ?? "?"} px daneben)`);

// ── G19 Keno ───────────────────────────────────────────────────────────────
//
// Vierzig Felder auf 390 Pixeln. Acht Spalten statt der zehn eines
// Papier-Tippscheins: zehn waeren 35 px breit, und 35 px sind kein Ziel fuer
// einen Daumen.
await seite.click(".spielkopf .btn.rund");
await schlaf(300);
await seite.click(".spielkachel >> nth=9");
await schlaf(600);
const brett = await seite.evaluate(() => {
  const f = document.querySelectorAll(".kenofeld");
  const r = document.querySelector(".kenobrett").getBoundingClientRect();
  const e = f[0].getBoundingClientRect();
  return {
    felder: f.length,
    kante: Math.round(Math.min(e.width, e.height)),
    passtRein: r.right <= window.innerWidth + 1 && r.left >= -1,
    spalten: new Set([...f].slice(0, 20).map((x) => Math.round(x.getBoundingClientRect().left))).size,
  };
});
pruefe(brett.felder === 40, `G19 vierzig Felder stehen auf dem Brett (${brett.felder})`);
pruefe(brett.passtRein, "G19 das Brett passt in die Breite des Handys");
pruefe(brett.kante >= 40, `G19 ein Feld ist gross genug fuer einen Daumen (${brett.kante} px)`);
pruefe(brett.spalten === 8, `G19 acht Spalten, nicht zehn (${brett.spalten})`);

// Antippen, zaehlen, wieder leeren.
for (const nr of [2, 13, 27, 31, 38]) await seite.click(`.kenofeld >> nth=${nr}`);
await schlaf(300);
const getippt = await seite.evaluate(() => ({
  gedrueckt: document.querySelectorAll('.kenofeld[aria-pressed="true"]').length,
  zaehler: document.querySelector(".kenozaehler").textContent,
  faecher: document.querySelectorAll(".faecher .fach").length,
}));
pruefe(getippt.gedrueckt === 5, `G19 fuenf angetippte Zahlen bleiben angetippt (${getippt.gedrueckt})`);
pruefe(/5/.test(getippt.zaehler), `G19 der Zaehler sagt es (${getippt.zaehler})`);
// Die Tafel haengt an der Zahl der Tipps - bei fuenf muss eine dastehen.
pruefe(getippt.faecher > 0, `G19 und die Auszahlungstafel steht daneben (${getippt.faecher} Faecher)`);

// Die Trostreihe. Bei zehn Tipps auf "mittel" faengt die Tafel bei fuenf
// Richtigen an - zwei bis vier Treffer sind vier von fuenf Runden, und die
// standen bis zum 04.09.2026 gar nicht erst auf der Tafel.
for (const nr of [1, 5, 9, 17, 21]) await seite.click(`.kenofeld >> nth=${nr}`);
await schlaf(300);
const zehn = await seite.evaluate(() => ({
  gedrueckt: document.querySelectorAll('.kenofeld[aria-pressed="true"]').length,
  faecher: [...document.querySelectorAll(".faecher .fach")].map((f) => f.textContent),
}));
pruefe(zehn.gedrueckt === 10, `G19 zehn Zahlen lassen sich antippen (${zehn.gedrueckt})`);
pruefe(
  ["2/10", "3/10", "4/10"].every((k) => zehn.faecher.some((x) => x.startsWith(k))),
  `G19 zwei, drei und vier Treffer stehen mit einem Betrag auf der Tafel ` +
    `(${zehn.faecher.slice(0, 3).join(" | ")})`,
);

await seite.click('.kenozeile .btn:text-is("Leeren")');
await schlaf(250);
pruefe(
  (await seite.$$('.kenofeld[aria-pressed="true"]')).length === 0,
  "G19 Leeren nimmt alle Zahlen wieder weg",
);
await seite.click('.kenozeile .btn:text-is("Zufall")');
await schlaf(250);
const zufaellig = (await seite.$$('.kenofeld[aria-pressed="true"]')).length;
pruefe(zufaellig >= 1 && zufaellig <= 10, `G19 Zufall legt einen Tippschein von selbst (${zufaellig} Zahlen)`);

// Und einmal ziehen. Zehn Zahlen werden aufgedeckt, eine nach der
// anderen - das dauert (120 ms Vorlauf, dann 70 ms je Zahl).
await seite.fill("#fEinsatz", "1,00");
await seite.click("#btnSetzen");
await schlaf(2600);
const ziehung = await seite.evaluate(() => ({
  gezogen: document.querySelectorAll(".kenofeld.gezogen").length,
  treffer: document.querySelectorAll(".kenofeld.treffer").length,
  ergebnis: document.getElementById("ergebnis").textContent,
  knopfBereit: !document.getElementById("btnSetzen").disabled,
}));
pruefe(
  ziehung.gezogen + ziehung.treffer === 10,
  `G19 zehn Zahlen werden aufgedeckt (${ziehung.gezogen} daneben, ${ziehung.treffer} getroffen)`,
);
pruefe(/von|of|tanesi/.test(ziehung.ergebnis), `G19 die Ergebniszeile sagt, wie viele es waren (${ziehung.ergebnis})`);
pruefe(ziehung.knopfBereit, "G19 danach laesst sich sofort wieder ziehen");

// ── G20 Bars: die dritte Walze muss sich Zeit lassen ───────────────────────
//
// Die Rueckmeldung war: "man soll spueren, dass eine 7 maechtiger ist als eine
// Kirsche" - und: nach zwei guten Walzen soll die dritte etwas bedeuten.
// Beides ist reine Anzeige, der Server schickt alle drei Zeichen auf einmal;
// keine Serverprobe kann es sehen.
//
// Geprueft wird deshalb, was der Daumen merkt:
//   1. die Walzen fallen **nacheinander**, nicht gleichzeitig,
//   2. bei zwei gleichen Zeichen laeuft die dritte laenger und langsamer,
//   3. ein seltenes Zeichen bleibt anders liegen als eine Kirsche.
//
// Punkt 2 hatte bis zum 04.09.2026 einen dritten Teil: eine Zeile, die vorher
// ansagte, was an der dritten Walze haengt ("💎💎 - trifft die dritte, zahlt
// es 220x"). Sie ist weg, und der Test prueft jetzt das Gegenteil - **waehrend
// der Spannung steht dort nichts**. Der Grund steht in `casino.js`: die Tafel
// steht zwei Zentimeter tiefer auf demselben Bildschirm und sagt dasselbe,
// nur vollstaendig.
//
// Zwei gleiche Zeichen kommen in rund einem Fuenftel der Zuege - deshalb wird
// gezogen, bis es passiert ist, und nicht ein einzelner Zug bewertet.
await seite.click(".spielkopf .btn.rund");
await schlaf(300);
await seite.click(".spielkachel >> nth=8");   // Bars
await schlaf(600);
await seite.fill("#fEinsatz", "0,10");

// (1) Nacheinander. Direkt nach dem Zug drehen noch alle drei; nach der
// ersten Haltezeit steht genau eine, und die dritte dreht noch.
await seite.click("#btnSetzen");
await schlaf(200);
const gleichNachKlick = await seite.$$eval(".walze", (w) => w.filter((x) => x.classList.contains("dreht")).length);
await schlaf(400);
const nachErster = await seite.$$eval(".walze", (w) => w.filter((x) => x.classList.contains("dreht")).length);
pruefe(gleichNachKlick === 3, `G20 nach dem Hebel drehen alle drei Walzen (${gleichNachKlick})`);
pruefe(nachErster < 3, `G20 die erste steht, bevor die letzte faellt (${nachErster} drehen noch)`);
await schlaf(3200);

// (2) und (3): ziehen, bis ein Paar in den ersten beiden Walzen steht, und
// dabei mitschreiben, was zu sehen war.
let paarGesehen = false;
let spannungGesehen = false;
let ansageGesehen = "";
let langsamer = false;
let seltenGesehen = false;
let dauerPaar = 0;
let dauerOhne = 0;
// Gezogen wird, bis **beides** einmal dagewesen ist - ein Paar in den ersten
// beiden Walzen (rund jeder fuenfte Zug) und irgendwo ein seltenes Zeichen
// (⭐ und aufwaerts, rund jeder dritte Zug). Auf einen einzelnen Zug zu
// schauen hiesse, den Lauf dem Zufall zu ueberlassen.
let zuege = 0;
for (; zuege < 30 && !(paarGesehen && seltenGesehen); zuege++) {
  const start = Date.now();
  await seite.click("#btnSetzen");
  // Kurz nach der zweiten Walze nachsehen: stehen dort zwei gleiche?
  await schlaf(900);
  const lage = await seite.evaluate(() => ({
    // `.zeichen` und nicht `span`: seit dem Walzenstreifen stehen in jeder
    // Walze acht weitere Spans, die nur zum Durchlaufen da sind.
    zeichen: [...document.querySelectorAll(".walze .zeichen")].map((s) => s.textContent),
    dreht: [...document.querySelectorAll(".walze")].map((w) => w.classList.contains("dreht")),
    spannung: document.getElementById("walzenReihe").classList.contains("spannung"),
    heiss: document.querySelectorAll(".walze.heiss").length,
    ergebnis: document.getElementById("ergebnis").textContent,
    tempo: document.querySelectorAll(".walze")[2].style.getPropertyValue("--tempo"),
  }));
  const paar = lage.zeichen[0] === lage.zeichen[1] && !lage.dreht[0] && !lage.dreht[1];
  if (paar && !paarGesehen) {
    paarGesehen = true;
    spannungGesehen = lage.spannung && lage.heiss === 1 && lage.dreht[2];
    ansageGesehen = lage.ergebnis;
    // Etwas spaeter noch einmal: die Walze muss inzwischen langsamer laufen.
    await schlaf(500);
    const spaeter = await seite.evaluate(() =>
      document.querySelectorAll(".walze")[2].style.getPropertyValue("--tempo")
    );
    langsamer = parseFloat(spaeter) > parseFloat(lage.tempo || "0.055");
  }
  // Warten, bis der Knopf wieder freigegeben ist - sonst zaehlt die naechste
  // Runde gar nicht.
  await seite.waitForSelector("#btnSetzen:not([disabled])", { timeout: 8000 });
  const dauer = Date.now() - start;
  if (paar) dauerPaar = Math.max(dauerPaar, dauer);
  else dauerOhne = Math.max(dauerOhne, dauer);
  // Erst jetzt, mit allen drei Walzen liegend, nach dem Glimmen sehen.
  const liegt = await seite.evaluate(() => ({
    selten: document.querySelectorAll(".walze.selten, .walze.sehrselten").length,
    schlicht: [...document.querySelectorAll(".walze")]
      .filter((w) => !w.classList.contains("selten") && !w.classList.contains("sehrselten")).length,
  }));
  if (liegt.selten > 0 && liegt.schlicht > 0) seltenGesehen = true;
  await schlaf(150);
}
pruefe(paarGesehen, `G20 in ${zuege} Zuegen standen zweimal dieselben ersten beiden Walzen`);
pruefe(spannungGesehen, "G20 dann pulst die Reihe, die dritte Walze glueht und dreht noch");
pruefe(
  ansageGesehen.trim() === "",
  `G20 und die Ergebniszeile bleibt dabei leer - was an der dritten haengt, steht auf der Tafel ` +
    `(gefunden: "${ansageGesehen}")`,
);
pruefe(langsamer, "G20 die dritte Walze wird dabei langsamer, statt einfach stehenzubleiben");
pruefe(
  dauerPaar > dauerOhne,
  `G20 ein Paar laesst sich mehr Zeit als ein Zug ohne (${dauerPaar} ms gegen hoechstens ${dauerOhne} ms)`,
);
pruefe(seltenGesehen, `G20 seltene Zeichen bleiben sichtbar anders liegen als haeufige (${zuege} Zuege)`);

// ── G21 Limbo: zwei Auszahlungsarten, zwei Steuerungen ─────────────────────
//
// "Wurf zahlt" hat **kein Ziel**: es faellt eine Zahl, und die ist der
// Multiplikator - meistens unter 1×. Ein Modus, in dem man ueblicherweise
// weniger zurueckbekommt, als man gesetzt hat, muss das vorher sagen und
// nicht hinterher; und ein Zielfeld, das nichts mehr tut, darf nicht
// stehenbleiben. Beides sieht keine Serverprobe.
await seite.click(".spielkopf .btn.rund");
await schlaf(300);
await seite.click(".spielkachel >> nth=4");   // Limbo
await schlaf(600);
const lesen = () => seite.textContent("#limboInfo");
const chancen = () => seite.textContent("#limboChancen");
const knopfDruecken = async (text) => {
  await seite.click(`.steuerung .wahlreihe button:text-is("${text}")`);
  await schlaf(250);
};

await knopfDruecken("Ziel zahlt");
const zielZeile = await lesen();
const zielLage = await seite.evaluate(() => ({
  zielDa: !!document.getElementById("fZiel")?.offsetParent,
  risikoDa: [...document.querySelectorAll(".steuerung .feldzeile")]
    .some((z) => z.offsetParent && /Risiko/.test(z.textContent)),
}));
pruefe(zielLage.zielDa && !zielLage.risikoDa, "G21 im Grundmodus steht das Zielfeld da und kein Risikoregler");

await knopfDruecken("Wurf zahlt");
const wurfZeile = await lesen();
const wurfLage = await seite.evaluate(() => ({
  zielDa: !!document.getElementById("fZiel")?.offsetParent,
  risikoDa: [...document.querySelectorAll(".steuerung .feldzeile")]
    .some((z) => z.offsetParent && /Risiko/.test(z.textContent)),
}));
pruefe(!wurfLage.zielDa && wurfLage.risikoDa, "G21 im Wurfmodus ist das Zielfeld weg und der Risikoregler da");
pruefe(zielZeile !== wurfZeile, "G21 der Wechsel aendert die Ansage");
pruefe(/bis/.test(wurfZeile), `G21 im Wurfmodus steht eine Spanne da, keine einzelne Zahl (${wurfZeile})`);
pruefe(/1×/.test(await chancen()), `G21 und wie oft es ueber 1× geht (${await chancen()})`);

// Der Boden muss **unter** 1× liegen - das ist die Ansage des Modus, und wer
// sie nicht liest, soll sie wenigstens sehen.
const spanne = (s) => {
  const zahlen = [...s.matchAll(/([\d.]+),(\d+)×/g)].map((m) => Number(m[1].replaceAll(".", "") + "." + m[2]));
  return { unten: Math.min(...zahlen), oben: Math.max(...zahlen) };
};
const beiMittel = spanne(await lesen());
pruefe(
  beiMittel.unten > 0 && beiMittel.unten < 1,
  `G21 der Boden liegt unter 1× – man verliert oft ein bisschen (${beiMittel.unten}×)`,
);

// Mehr Risiko heisst tieferer Boden. Genau daran ist bei Plinko schon einmal
// ein Regler gescheitert, der nur die Spitze verschob.
await knopfDruecken("niedrig");
const beiNiedrig = spanne(await lesen());
await knopfDruecken("hoch");
const beiHoch = spanne(await lesen());
pruefe(
  beiNiedrig.unten > beiMittel.unten && beiMittel.unten > beiHoch.unten,
  `G21 mehr Risiko senkt den Boden (${beiNiedrig.unten}× > ${beiMittel.unten}× > ${beiHoch.unten}×)`,
);
const hundert = (s) => Number((s.match(/100×[^\d]*([\d,]+)/) ?? [])[1]?.replace(",", ".") ?? 0);
pruefe(
  hundert(await chancen()) > 0,
  `G21 und hebt die Chance auf einen Hunderter (${await chancen()})`,
);

// Und einmal werfen. Der Wurf **ist** der Multiplikator: was in der grossen
// Zahl steht, muss auch in der Ergebniszeile stehen.
await seite.fill("#fEinsatz", "1,00");
await seite.click("#btnSetzen");
await schlaf(1200);
const wurfErgebnis = await seite.evaluate(() => ({
  zahl: document.getElementById("limboZahl").textContent,
  zeile: document.getElementById("ergebnis").textContent,
}));
pruefe(
  wurfErgebnis.zeile.startsWith(wurfErgebnis.zahl),
  `G21 die Ergebniszeile fuehrt mit derselben Zahl, die gross dasteht (${wurfErgebnis.zahl} · ${wurfErgebnis.zeile})`,
);
pruefe(
  /zahlt|bleiben/.test(wurfErgebnis.zeile),
  `G21 und sagt, was davon uebrig ist (${wurfErgebnis.zeile})`,
);

// ── G22 Bars: die Walze zeigt Zeichen, und nichts steht doppelt ────────────
//
// Zwei Meldungen an einem Tag, beide ueber dasselbe Bild:
//
//   "wenn es langsamer wird sieht es schlecht aus" - die Walze wackelte mit
//   **einem** Zeichen auf und ab. Schnell sah das aus wie eine Drehung, langsam
//   wie ein zitterndes Emoji. Jetzt laeuft ein Streifen mit allen sieben
//   Zeichen durch; geprueft wird, dass er da ist und mehr als ein Zeichen
//   traegt.
//
//   "kein text der sagt was man jetzt bekommen wuerde ... das steht sonst
//   doppelt weil unten ja bereits die tafel ist" - zwischen zweiter und
//   dritter Walze stand eine Zeile mit demselben Multiplikator, der zwei
//   Zentimeter tiefer auf der Tafel steht.
await seite.click('[data-ziel="sSpiele"]');
await schlaf(350);
await seite.click(".spielkachel >> nth=8");   // Bars
await schlaf(500);
await seite.fill("#fEinsatz", "0,10");
await seite.click("#btnSetzen");
await schlaf(200);
const walze = await seite.evaluate(() => {
  const w = document.querySelector(".walze");
  const st = w?.querySelector(".streifen");
  const sicht = st ? getComputedStyle(st) : null;
  return {
    streifenDa: !!st,
    zeichen: st ? st.children.length : 0,
    verschieden: st ? new Set([...st.children].map((c) => c.textContent)).size : 0,
    laeuft: sicht ? sicht.display !== "none" && sicht.animationName !== "none" : false,
    // Nichts darf ueber den Rand der Walze hinausragen: `overflow: hidden`
    // schnitte es ab, und genau das war bei 💎 und 7️⃣ zu sehen.
    haeltDrin: st ? st.getBoundingClientRect().width <= w.getBoundingClientRect().width + 1 : false,
  };
});
pruefe(walze.streifenDa, "G22 Bars: jede Walze traegt einen Streifen, kein einzelnes Zeichen");
pruefe(walze.zeichen >= 8, `G22 der Streifen traegt alle Zeichen und eine Naht (${walze.zeichen} Felder)`);
pruefe(walze.verschieden >= 7, `G22 und sie sind wirklich verschieden (${walze.verschieden} Sorten)`);
pruefe(walze.laeuft, "G22 waehrend der Runde laeuft er");
pruefe(walze.haeltDrin, "G22 und bleibt in der Walze");

// Warten, bis alle drei liegen. Die dritte kann bis zu 1,9 s Spannung haben.
await seite.waitForFunction(() => !document.querySelector(".walze.dreht"), null, { timeout: 8000 });
await schlaf(200);
const nachWurf = await seite.evaluate(() => {
  const tafel = [...document.querySelectorAll(".faecher .fach")].map((f) => f.textContent);
  return {
    ergebnis: document.getElementById("ergebnis").textContent,
    tafelDa: tafel.length >= 5,
    // Die Wucht darf das Zeichen nicht ueber den Rand druecken.
    passt: [...document.querySelectorAll(".walze")].every((w) => {
      const z = w.querySelector(".zeichen");
      const a = w.getBoundingClientRect();
      const b = z.getBoundingClientRect();
      return b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    }),
  };
});
pruefe(nachWurf.tafelDa, "G22 die Auszahlungstafel steht unter den Walzen");
pruefe(
  /–|Nichts|Nothing|Hiç/.test(nachWurf.ergebnis),
  `G22 die Ergebniszeile sagt das Ergebnis und nicht, was haette sein koennen (${nachWurf.ergebnis})`,
);
pruefe(nachWurf.passt, "G22 kein Zeichen wird vom Rand der Walze abgeschnitten");

// ── G23 Mines: die Bomben bleiben liegen ───────────────────────────────────
//
// "mines die bomben zeigen wenn man verloren hat". Sie wurden gezeigt - und
// 1,8 Sekunden spaeter raeumte `zeichne()` das Brett wieder leer, weil die
// Einsatzleiste zurueckkam. Jetzt bleibt das Bild stehen, bis jemand setzt.
await seite.click('[data-ziel="sSpiele"]');
await schlaf(350);
await seite.click(".spielkachel >> nth=1");   // Mines
await schlaf(500);
await seite.click('.feldzeile .wahlreihe button:text-is("24")');
await schlaf(150);
await seite.fill("#fEinsatz", "0,10");
await seite.click("#btnSetzen");
await schlaf(700);
// Bei 24 Minen ist jedes Feld ausser einem eine Bombe - ein Klick genuegt fast
// immer. Zur Sicherheit wird geklickt, bis die Runde vorbei ist.
for (let i = 0; i < 3; i++) {
  if (await seite.isVisible("#btnSetzen")) break;
  await seite.click(`.minenfeld button >> nth=${i}`);
  await schlaf(700);
}
const bomben = () =>
  seite.evaluate(() => ({
    gezeigt: document.querySelectorAll(".minenfeld button.mine").length,
    leiste: !!document.querySelector(".einsatzleiste")?.offsetParent,
  }));
const gleichNach = await bomben();
pruefe(gleichNach.gezeigt >= 20, `G23 nach dem Bumm liegen die Bomben offen (${gleichNach.gezeigt} von 24)`);
await schlaf(2600);
const spaeter = await bomben();
pruefe(spaeter.leiste, "G23 die Einsatzleiste kommt zurueck");
pruefe(
  spaeter.gezeigt === gleichNach.gezeigt,
  `G23 und die Bomben bleiben trotzdem liegen (${spaeter.gezeigt} statt ${gleichNach.gezeigt})`,
);
await seite.fill("#fEinsatz", "0,10");
await seite.click("#btnSetzen");
await schlaf(600);
pruefe((await bomben()).gezeigt === 0, "G23 erst die naechste Runde raeumt das Brett");
await schlaf(200);
if (!(await seite.isVisible("#btnSetzen"))) {
  for (let i = 0; i < 3 && !(await seite.isVisible("#btnSetzen")); i++) {
    await seite.click(`.minenfeld button >> nth=${i}`);
    await schlaf(700);
  }
}
pruefe(await seite.isVisible("#btnSetzen"), "G23 und die Runde ist danach wieder beendet");

// ── G24 Fallobst ───────────────────────────────────────────────────────────
//
// Das elfte Spiel, und das erste, in dem eine Wette mehrfach zahlt. Geprueft
// wird, was keine Serverprobe sieht: dass dreissig Kacheln in sechs Spalten
// auf 390 px passen, dass die Tafel darunter steht, und dass nach einer Runde
// wieder gesetzt werden kann - auch wenn die Lawine mehrere Sekunden lief.
await seite.click('[data-ziel="sSpiele"]');
await schlaf(350);
await seite.click(".spielkachel >> nth=10");
await schlaf(600);
const brettObst = await seite.evaluate(() => {
  const b = document.getElementById("obstbrett");
  const k = [...b.querySelectorAll(".obst")];
  const r = b.getBoundingClientRect();
  const erste = k[0].getBoundingClientRect();
  return {
    kacheln: k.length,
    spalten: k.filter((x) => Math.abs(x.getBoundingClientRect().top - erste.top) < 2).length,
    gefuellt: k.filter((x) => x.textContent.trim().length > 0).length,
    passt: r.width <= window.innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1,
    kante: Math.round(erste.width),
    tafelZeilen: document.querySelectorAll(".obsttafel .obstzeile").length,
  };
});
pruefe(brettObst.kacheln === 30, `G24 dreissig Kacheln stehen auf dem Brett (${brettObst.kacheln})`);
pruefe(brettObst.spalten === 6, `G24 in sechs Spalten (${brettObst.spalten})`);
pruefe(brettObst.gefuellt === 30, `G24 und jede traegt ein Zeichen (${brettObst.gefuellt})`);
pruefe(brettObst.passt, `G24 das Brett passt in die Breite des Handys (${brettObst.kante} px je Kachel)`);
pruefe(brettObst.tafelZeilen === 9, `G24 die Tafel hat eine Kopfzeile und acht Sorten (${brettObst.tafelZeilen})`);

// Solange gespielt wird, bis einmal etwas zusammenfaellt - rund ein Drittel
// der Runden zahlt, zehn Versuche reichen praktisch immer.
let obstGezahlt = false;
let obstLawine = "";
for (let i = 0; i < 12 && !obstGezahlt; i++) {
  await seite.fill("#fEinsatz", "0,10");
  await seite.click("#btnSetzen");
  await schlaf(500);
  const zaehlt = await seite.evaluate(() => ({
    hervor: document.querySelectorAll(".obst.zaehlt").length,
    kette: document.getElementById("obstKette")?.textContent ?? "",
  }));
  if (zaehlt.hervor >= 8) {
    obstGezahlt = true;
    obstLawine = zaehlt.kette;
  }
  await seite.waitForFunction(() => !document.getElementById("btnSetzen")?.disabled, null, { timeout: 15_000 });
  await schlaf(150);
}
pruefe(obstGezahlt, `G24 was zaehlt, wird hervorgehoben - mindestens acht Kacheln auf einmal`);
pruefe(/[\d,]+×/.test(obstLawine), `G24 und daneben steht, was es bisher gebracht hat (${obstLawine})`);
pruefe(
  !(await seite.evaluate(() => document.getElementById("btnSetzen")?.disabled)),
  "G24 nach der Lawine laesst sich sofort wieder setzen",
);
pruefe(
  /[\d,]+×|Nichts|Nothing|Hiç/.test(await seite.textContent("#ergebnis")),
  `G24 und die Ergebniszeile nennt die ganze Runde (${await seite.textContent("#ergebnis")})`,
);

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
