// Abschnitt B des Prüfplans: ein Mensch im echten Browser.
//
// Alles andere prüft Bausteine – die `probe.js` die Regeln, `lobbyprobe.mjs`
// das Protokoll, `grenzprobe.mjs` die Bremse. Hier wird **geklickt**: zwei
// getrennte Browser-Sitzungen, wie zwei Handys, von der Startseite bis zum
// Endstand und wieder zurück.
//
//   B01  Von der Startseite bis zum Endstand, zu zweit.
//   B02  F5 mitten im Spiel – kommt das Spielbild zurück?
//   B03  Zweiter Tab per Link (#CODE) – tritt er bei oder kämpft er?
//   B04  Zurück-Knopf nach `leave` – hängt die Seite auf #CODE fest?
//   B05  Tab schliessen, neu öffnen: `sessionStorage` weg, Hash noch da.
//   B06  Name über Spiele hinweg – derselbe Schlüssel überall?
//   B07  Handy 390×844: Lobby und Spielbrett bedienbar.
//   B08  Verbindung kappen und wiederherstellen.
//
// Möglich ist das generisch, weil die sieben Spiele mit `schale.js` denselben
// Aufbau haben: `#screen-home` → `#screen-lobby` → `#screen-game` →
// `#screen-final`. Bis zum Endstand wird **nicht** ausgespielt – dafür bräuchte
// jedes Spiel seine eigenen Züge, und die prüft schon `probe.js`. Stattdessen
// beendet der Host die Runde vorzeitig; das ist derselbe Weg zum Endstand und
// nebenbei P04.
//
//   cd /root/werkzeug-screenshots && node pruefe-durchlauf.mjs
//   … --nur paare        nur ein Spiel
//   … --test B08         nur ein Test
//
// Versioniert liegt die Datei in /var/www/html/werkzeug/ – wer sie hier ändert,
// kopiert sie dorthin zurück.

import { chromium } from "playwright";

const BASIS = process.env.BASIS ?? "https://inf-zeus.de";
const arg = (n, v) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : v; };
const NUR = arg("--nur", null);
const TEST = arg("--test", null);

/** Die sieben Spiele mit gemeinsamer Schale. Ein Fehler gilt hier siebenfach. */
const SCHALE = ["paare", "maumau", "becher", "kingscup", "schwimmen", "werwolf", "snake"];
const SPIELE = NUR ? [NUR] : SCHALE;

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (spiel, test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${spiel} ${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

const browser = await chromium.launch();
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ein Gerät. Eigener Kontext heisst eigener `localStorage` und eigener
 * `sessionStorage` – zwei Tabs im selben Kontext wären ein Gerät und damit
 * ein anderer Test (das ist B03).
 */
/**
 * Jede erzeugte WebSocket-Verbindung wird mitgeschrieben, und auf Wunsch wird
 * jede neue sofort wieder geschlossen. Damit lässt sich ein Server nachstellen,
 * der nicht antwortet – und **zählen**, wie oft der Client es in einer
 * bestimmten Zeit versucht. Genau darum ging es bei F8.
 *
 * `context.setOffline(true)` taugt dafür nicht: es kappt in Chromium keine
 * bereits offene WebSocket-Verbindung. Ein Test darauf sieht grün aus und hat
 * nichts geprüft.
 */
const MITSCHRIFT = () => {
  const Echt = window.WebSocket;
  window.__versuche = [];
  window.__sabotage = false;   // false | "hart" | "flapp"
  window.__letzte = null;
  function Wache(url, ...rest) {
    const modus = window.__sabotage;
    if (modus) window.__versuche.push(Date.now());
    // „hart": der Dienst ist weg. Port 9 (discard) ist zu, der Aufbau wird
    //   abgewiesen, `onopen` kommt nie – das ist der Fall aus F8.
    // „flapp": der Dienst laeuft, nimmt an und wirft sofort wieder ab, wie in
    //   einer Absturzschleife. Hier faellt auf, wer seinen Rueckzug schon bei
    //   `onopen` zuruecksetzt statt erst nach bewaehrter Verbindung.
    const s = new Echt(modus === "hart" ? "ws://127.0.0.1:9/" : url, ...rest);
    window.__letzte = s;
    if (modus === "flapp") s.addEventListener("open", () => s.close());
    return s;
  }
  Wache.prototype = Echt.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) Wache[k] = Echt[k];
  window.WebSocket = Wache;
};

async function geraet(spiel, viewport = { width: 1280, height: 900 }) {
  const kontext = await browser.newContext({ viewport });
  await kontext.addInitScript(MITSCHRIFT);
  const seite = await kontext.newPage();
  seite.konsole = [];
  seite.on("console", (m) => { if (m.type() === "error") seite.konsole.push(m.text()); });
  seite.on("pageerror", (e) => seite.konsole.push(String(e)));
  await seite.goto(`${BASIS}/${spiel}/`, { waitUntil: "domcontentloaded" });
  await seite.waitForSelector("#screen-home.active", { timeout: 10000 });
  seite.kontext = kontext;
  return seite;
}

const sichtbar = (seite, wahl) => seite.locator(wahl).isVisible().catch(() => false);
const aufSchirm = async (seite, name, ms = 10000) => {
  try {
    await seite.waitForSelector(`#screen-${name}.active`, { timeout: ms });
    return true;
  } catch { return false; }
};

/**
 * Raum eröffnen und den Code zurückgeben.
 *
 * Schlägt es fehl, wird zuerst der Hinweis gelesen, den der Server geschickt
 * hat. Diese Probe läuft gegen **live**, und dort gilt die Raumbremse: zwölf
 * neue Räume je IP in zehn Minuten. Ein voller Lauf verbraucht sechs je Spiel
 * – zwei Läufe hintereinander laufen also in die Bremse, und dann steht in
 * jeder Zeile „kam nicht in die Lobby", obwohl mit dem Spiel alles stimmt.
 * Der Unterschied muss aus der Meldung hervorgehen, sonst sucht man am
 * falschen Ende.
 */
async function eroeffne(seite, name) {
  await seite.fill("#name", name);
  await seite.click("#createBtn");
  if (!await aufSchirm(seite, "lobby")) {
    const hinweis = (await seite.locator("#toast").textContent().catch(() => "")).trim();
    if (/Räume|Raeume/i.test(hinweis)) {
      throw new Error(`Raumbremse, nicht das Spiel: „${hinweis}" ` +
        `– zwölf Räume je IP in zehn Minuten, ein Lauf braucht sechs je Spiel. ` +
        `Zehn Minuten warten oder mit --nur ein Spiel prüfen.`);
    }
    throw new Error(`kam nicht in die Lobby${hinweis ? ` (Hinweis: „${hinweis}")` : ""}`);
  }
  const code = (await seite.locator("#roomCode").textContent()).trim();
  if (!/^[A-Z2-9]{4}$/.test(code)) throw new Error(`unbrauchbarer Code „${code}"`);
  return code;
}

/** Mit Code beitreten. */
async function tritt_bei(seite, name, code) {
  await seite.fill("#name", name);
  await seite.fill("#codeInput", code);
  await seite.click("#joinBtn");
  return aufSchirm(seite, "lobby");
}

/** Gast bereit, Host startet. Manche Spiele brauchen mehr als zwei Leute – die
 *  Sperre steht dann im Starthinweis, und das ist kein Fehler. */
async function starte(host, gaeste) {
  for (const g of gaeste) {
    if (await sichtbar(g, "#readyBtn")) await g.click("#readyBtn");
  }
  await schlaf(400);
  const knopf = host.locator("#startBtn");
  if (await knopf.isDisabled().catch(() => false)) {
    return { los: false, grund: (await host.locator("#startHint").textContent()).trim() };
  }
  await knopf.click();
  return { los: await aufSchirm(host, "game"), grund: "" };
}

// ══════════════════════════════════════════════════════════ B01/B04
async function B01(spiel) {
  const a = await geraet(spiel), b = await geraet(spiel);
  try {
    const code = await eroeffne(a, "Anna");
    pruefe(spiel, "B01", true, `Raum ${code} eröffnet`);

    const drin = await tritt_bei(b, "Bert", code.toLowerCase());
    pruefe(spiel, "B01", drin, "zweites Gerät tritt mit kleingeschriebenem Code bei");

    const zaehler = (await a.locator("#lobbyCount").textContent()).trim();
    pruefe(spiel, "B01", zaehler.startsWith("2"), `Lobby zählt beide (${zaehler})`);

    const { los, grund } = await starte(a, [b]);
    if (!los) {
      pruefe(spiel, "B01", Boolean(grund),
        `Start gesperrt und begründet: „${grund}" – zu zweit zu wenig, kein Fehler`);
      return;
    }
    pruefe(spiel, "B01", true, "Runde läuft, beide sehen das Spielbild");
    pruefe(spiel, "B01", await aufSchirm(b, "game"), "auch das zweite Gerät ist im Spiel");

    // P04/B01: der Host beendet vorzeitig – derselbe Weg zum Endstand, ohne
    // dass diese Probe die Regeln jedes Spiels kennen muss.
    if (await sichtbar(a, "#endeBtn")) {
      await a.click("#endeBtn");
      const ende = await aufSchirm(a, "final");
      pruefe(spiel, "B01", ende, `„Beenden" führt zum Endstand`);
      pruefe(spiel, "B01", await aufSchirm(b, "final"), "der Gast sieht denselben Endstand");
      const plaetze = await a.locator("#podium li").count();
      pruefe(spiel, "B01", plaetze >= 2, `Podium listet ${plaetze} Spieler`);

      // P03: noch einmal.
      await a.click("#againBtn");
      const zurueck = await aufSchirm(a, "lobby");
      pruefe(spiel, "B01", zurueck, `„Nochmal!" holt zurück in den Warteraum`);
      pruefe(spiel, "B01", await aufSchirm(b, "lobby"), "und den Gast mit");
    } else {
      pruefe(spiel, "B01", false, "kein Beenden-Knopf beim Host");
    }

    // B04: verlassen, dann Zurück-Knopf. Bleibt der Hash stehen, landet man
    // wieder in einem Raum, den man gerade verlassen hat.
    await b.click("#leaveBtn");
    await aufSchirm(b, "home");
    const hashNach = await b.evaluate(() => location.hash);
    pruefe(spiel, "B04", hashNach === "" || hashNach === "#",
      `nach „Raum verlassen" ist der Hash leer (war „${hashNach}")`);

    pruefe(spiel, "B01", a.konsole.length === 0 && b.konsole.length === 0,
      `Konsole still (${[...a.konsole, ...b.konsole].join(" | ").slice(0, 200)})`);
  } finally {
    await a.kontext.close(); await b.kontext.close();
  }
}

// ══════════════════════════════════════════════════════════ B02
// F5 mitten im Spiel. Der Rückkehrer muss *von selbst* wieder ein Bild
// bekommen – nicht erst, wenn ein anderer etwas tut.
async function B02(spiel) {
  const a = await geraet(spiel), b = await geraet(spiel);
  try {
    const code = await eroeffne(a, "Anna");
    await tritt_bei(b, "Bert", code);
    const { los, grund } = await starte(a, [b]);
    if (!los) return pruefe(spiel, "B02", Boolean(grund), `zu zweit nicht startbar: „${grund}"`);

    const vorher = Date.now();
    await b.reload({ waitUntil: "domcontentloaded" });
    const zurueck = await aufSchirm(b, "game", 15000);
    const dauer = Date.now() - vorher;
    pruefe(spiel, "B02", zurueck, `nach F5 ist das Spielbild nach ${dauer} ms wieder da`);

    const zaehler = (await a.locator("#lobbyCount").textContent().catch(() => "")).trim();
    pruefe(spiel, "B02", !zaehler.startsWith("3"),
      `kein Doppelsitz nach dem Neuladen (${zaehler || "—"})`);
  } finally {
    await a.kontext.close(); await b.kontext.close();
  }
}

// ══════════════════════════════════════════════════════════ B04
// Der Zurück-Knopf, und zwar auf dem Weg, den ein Mensch wirklich nimmt:
// Spieleübersicht → Kachel → Spiel → Raum → verlassen → zurück. Nur so gibt
// es überhaupt Historie; ein direkt geöffnetes Spiel hat keine, und ein Test
// darauf misst nichts.
async function B04(spiel) {
  const kontext = await browser.newContext();
  await kontext.addInitScript(MITSCHRIFT);
  const seite = await kontext.newPage();
  try {
    await seite.goto(`${BASIS}/spiele/`, { waitUntil: "domcontentloaded" });
    await seite.locator(`.game a.game-link[href="/${spiel}/"]`).first().click();
    await seite.waitForSelector("#screen-home.active", { timeout: 10000 });

    await seite.fill("#name", "Anna");
    await seite.click("#createBtn");
    await seite.waitForSelector("#screen-lobby.active", { timeout: 10000 });
    const mitRaum = await seite.evaluate(() => location.hash);
    pruefe(spiel, "B04", /^#[A-Z2-9]{4}$/.test(mitRaum), `im Raum steht der Code im Hash (${mitRaum})`);

    await seite.click("#leaveBtn");
    await seite.waitForSelector("#screen-home.active", { timeout: 10000 });

    await seite.goBack({ waitUntil: "domcontentloaded" });
    await schlaf(1500);
    const url = seite.url();
    pruefe(spiel, "B04", url.includes("/spiele/"),
      `Zurück führt auf die Spieleübersicht (${url.replace(BASIS, "")})`);

    // Und noch einmal vorwärts: der Hash von vorhin darf nicht in einen
    // Raum zurückwerfen, den es nicht mehr gibt.
    await seite.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
    await schlaf(1500);
    const wo = await seite.evaluate(() =>
      [...document.querySelectorAll(".screen.active")].map((s) => s.id).join(","));
    pruefe(spiel, "B04", wo === "screen-home" || wo === "screen-lobby",
      `vorwärts landet auf „${wo}" – kein leerer Bildschirm`);
  } finally {
    await kontext.close();
  }
}

// ══════════════════════════════════════════════════════════ B03/B05
async function B03(spiel) {
  const a = await geraet(spiel);
  try {
    const code = await eroeffne(a, "Anna");
    // Zweiter Tab im **selben** Kontext, über den geteilten Link. Er hat
    // denselben `localStorage`, aber einen eigenen `sessionStorage` – das ist
    // der Fall „Link an mich selbst geschickt".
    const zwei = await a.kontext.newPage();
    await zwei.goto(`${BASIS}/${spiel}/#${code}`, { waitUntil: "domcontentloaded" });
    await schlaf(2500);
    const wo = await zwei.evaluate(() =>
      [...document.querySelectorAll(".screen.active")].map((s) => s.id).join(","));
    pruefe(spiel, "B03", wo !== "",
      `zweiter Tab per #${code} landet auf „${wo}" statt im Nirgendwo`);

    // Kämpfen sie? Beide dürfen nicht abwechselnd hinausfliegen.
    const ersterNoch = await sichtbar(a, "#screen-lobby.active");
    pruefe(spiel, "B03", ersterNoch,
      "der erste Tab bleibt in der Lobby – kein Hin und Her um den Platz");

    // B05: Tab zu, neu auf – `sessionStorage` ist weg, der Hash bleibt.
    await zwei.close();
    const drei = await a.kontext.newPage();
    await drei.goto(`${BASIS}/${spiel}/#${code}`, { waitUntil: "domcontentloaded" });
    await schlaf(2000);
    const sess = await drei.evaluate(() => sessionStorage.length);
    const wo2 = await drei.evaluate(() =>
      [...document.querySelectorAll(".screen.active")].map((s) => s.id).join(","));
    pruefe(spiel, "B05", wo2 !== "",
      `neuer Tab mit Hash, ohne sessionStorage (${sess} Einträge): „${wo2}"`);
    await drei.close();
  } finally {
    await a.kontext.close();
  }
}

// ══════════════════════════════════════════════════════════ B06
// Der Name muss über Spiele hinweg stehen bleiben – sonst tippt man ihn bei
// jedem Spiel neu. Das war F2; hier wird es im Browser gegengeprüft.
async function B06() {
  const kontext = await browser.newContext();
  try {
    const erste = await kontext.newPage();
    await erste.goto(`${BASIS}/paare/`, { waitUntil: "domcontentloaded" });
    await erste.waitForSelector("#screen-home.active");
    await erste.fill("#name", "Änne 🦊");
    await erste.dispatchEvent("#name", "change");
    await schlaf(300);
    const schluessel = await erste.evaluate(() => Object.keys(localStorage));
    pruefe("alle", "B06", schluessel.includes("spiele_name"),
      `Schlüssel nach dem Tippen: ${JSON.stringify(schluessel)}`);
    await erste.close();

    // Jetzt jedes andere Spiel mit Namensfeld öffnen – steht der Name da?
    const weitere = ["maumau", "werwolf", "kingscup", "becher", "schwimmen", "snake",
      "luegen", "nochnie", "maexchen", "imposter", "flasche", "amehesten",
      "cubes", "wortleger", "luckyreflex"];
    const fehlt = [];
    for (const s of weitere) {
      const p = await kontext.newPage();
      await p.goto(`${BASIS}/${s}/`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(900);
      const wert = await p.locator("#name").inputValue().catch(() => "(kein Feld)");
      if (wert !== "Änne 🦊") fehlt.push(`${s}="${wert}"`);
      await p.close();
    }
    pruefe("alle", "B06", fehlt.length === 0,
      fehlt.length
        ? `Name fehlt bei ${fehlt.length}: ${fehlt.join(", ")}`
        : `der Name steht in allen ${weitere.length + 1} Spielen vor`);
  } finally {
    await kontext.close();
  }
}

// ══════════════════════════════════════════════════════════ B07
async function B07(spiel) {
  const a = await geraet(spiel, { width: 390, height: 844 });
  try {
    const code = await eroeffne(a, "Anna");
    const mass = await a.evaluate(() => ({
      breite: document.documentElement.scrollWidth,
      sicht: window.innerWidth,
    }));
    pruefe(spiel, "B07", mass.breite <= mass.sicht + 1,
      `Lobby bei 390 px ohne seitliches Scrollen (${mass.breite}px), Raum ${code}`);

    // Erreichbar heisst: der Knopf ist da, sichtbar und gross genug zum Tippen.
    for (const [wahl, name] of [["#startBtn", "Runde starten"], ["#leaveBtn", "Raum verlassen"]]) {
      const kasten = await a.locator(wahl).boundingBox().catch(() => null);
      pruefe(spiel, "B07", Boolean(kasten) && kasten.height >= 30,
        `„${name}" ist ${kasten ? `${Math.round(kasten.width)}×${Math.round(kasten.height)} px` : "nicht sichtbar"}`);
    }
  } finally {
    await a.kontext.close();
  }
}

// ══════════════════════════════════════════════════════════ B08
// Verbindung kappen und wiederherstellen. Genau hier greift der Rückzug aus
// `schale.js` (F8): der Client darf es nicht im festen Takt versuchen, aber
// er muss von allein zurückkommen, sobald es wieder geht.
const MESSDAUER = 20000;

async function B08(spiel) {
  const a = await geraet(spiel);
  try {
    const code = await eroeffne(a, "Anna");

    // ── Betriebsart „hart": der Dienst ist weg. ────────────────────────────
    await a.evaluate(() => {
      window.__sabotage = "hart";
      window.__versuche = [];
      window.__letzte?.close();
    });
    await schlaf(1200);
    const meldung = (await a.locator("#status").textContent()).trim();
    pruefe(spiel, "B08", meldung.length > 0,
      `der Ausfall wird angezeigt: „${meldung}"`);

    await schlaf(MESSDAUER);
    const hart = await a.evaluate(() => ({
      n: window.__versuche.length,
      abstaende: window.__versuche.slice(1).map((t, i) => t - window.__versuche[i]),
    }));

    // Mit dem alten festen Takt von 1500 ms wären es in 20 s dreizehn
    // Versuche; mit dem Rückzug sind es etwa sechs. Die Grenze der Bremse
    // liegt bei 40 je Minute – zwei Tabs dürfen zusammen nicht darüber kommen.
    pruefe(spiel, "B08", hart.n > 0 && hart.n <= 10,
      `Dienst weg: ${hart.n} Versuche in ${MESSDAUER / 1000} s (fester 1,5-s-Takt wären 13)`);
    pruefe(spiel, "B08", hart.abstaende.length >= 2 && hart.abstaende.at(-1) > hart.abstaende[0],
      `die Abstände wachsen: ${hart.abstaende.map((m) => Math.round(m)).join(", ")} ms`);
    pruefe(spiel, "B08", hart.n * 3 <= 40,
      `hochgerechnet ${hart.n * 3}/min – unter der Grenze von 40, auch zu zweit`);

    // ── Betriebsart „flapp": der Dienst nimmt an und wirft sofort ab. ──────
    // Wer den Rückzug schon bei `onopen` zurücksetzt, hämmert hier im
    // Anfangstakt weiter – schneller als mit dem festen Takt, den der Rückzug
    // ersetzen soll.
    await a.evaluate(() => { window.__sabotage = "flapp"; window.__versuche = []; });
    await schlaf(MESSDAUER);
    const flapp = await a.evaluate(() => window.__versuche.length);
    pruefe(spiel, "B08", flapp <= 10,
      `Absturzschleife: ${flapp} Versuche in ${MESSDAUER / 1000} s ` +
      `(wer bei jedem „open" zurücksetzt, kommt hier auf über 30)`);

    // Und er muss von allein zurückkommen, sobald es wieder geht.
    await a.evaluate(() => { window.__sabotage = false; });
    let zurueck = false;
    for (let i = 0; i < 30 && !zurueck; i++) {
      await schlaf(700);
      zurueck = (await a.locator("#status").textContent()).trim() === "";
    }
    pruefe(spiel, "B08", zurueck, "sobald es wieder geht, verbindet er von allein");

    const wo = await a.evaluate(() =>
      [...document.querySelectorAll(".screen.active")].map((s) => s.id).join(","));
    pruefe(spiel, "B08", wo.includes("lobby"),
      `und sitzt wieder im Raum ${code} („${wo}")`);
  } finally {
    await a.kontext.close();
  }
}

// ---------------------------------------------------------------- Lauf
const JE_SPIEL = { B01, B02, B03, B04, B07, B08 };

for (const spiel of SPIELE) {
  console.log(`\n═══ ${spiel} ═══`);
  for (const [name, fn] of Object.entries(JE_SPIEL)) {
    if (TEST && !name.startsWith(TEST) && TEST !== name) continue;
    try {
      await fn(spiel);
    } catch (e) {
      rot++;
      befunde.push(`${spiel} ${name}: ${e.message}`);
      console.error(`  FEHL ${name} ${e.message}`);
    }
  }
}

if (!TEST || TEST === "B06") {
  console.log(`\n═══ B06 · Name über Spiele hinweg ═══`);
  try { await B06(); } catch (e) { rot++; befunde.push(`B06: ${e.message}`); console.error(`  FEHL B06 ${e.message}`); }
}

await browser.close();
console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
