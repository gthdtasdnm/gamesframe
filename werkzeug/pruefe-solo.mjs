// Keep, Card Chaos und Snake starten seit dem 18.08.2026 auch mit **einer**
// Person. Genau das prueft dieses Skript – einmal je Spiel, ueber die
// Leitung, nicht am Quelltext:
//
//   S01  Ein einzelner Host legt einen Raum an und drueckt Start.
//   S02  Der Server laesst ihn los: die erste Runde kommt an.
//   S03  Und die Partie laeuft allein auch zu Ende (Snake: die Runde).
//
// Warum eine eigene Datei und nicht drei Zeilen in `pruefe-keep.mjs` und
// `pruefe-cardchaos.mjs`: die beiden spielen ganze Partien zu zweit durch und
// laufen entsprechend lange. Der Solostart ist eine Eigenschaft der Lobby,
// nicht des Spiels, und soll schnell einzeln pruefbar bleiben. Snake hat
// ausserdem gar keine Probe in Node, sondern eine in Deno.
//
//   node werkzeug/pruefe-solo.mjs
//   cd /var/www/html && node werkzeug/pruefe-solo.mjs --nur snake
//
// Immer gegen eine **eigene Fassung** auf eigenen Ports: eine gespielte Runde
// landet in der Bestenliste, und die der Live-Fassung gehoert den Leuten dort
// (doku/pruefen.md). Deshalb auch ein eigenes Datenverzeichnis fuer Keep.

import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NUR = process.argv.includes("--nur")
  ? process.argv[process.argv.indexOf("--nur") + 1]
  : null;

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

// ---------------------------------------------------------------- Dienst
async function portAntwortet(port, ms = 20000) {
  const ende = Date.now() + ms;
  for (;;) {
    const da = await new Promise((r) => {
      const s = net.connect({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); r(true); });
      s.once("error", () => { s.destroy(); r(false); });
      setTimeout(() => { s.destroy(); r(false); }, 400);
    });
    if (da) return true;
    if (Date.now() > ende) return false;
    await schlaf(150);
  }
}

/** Nie ueber `pkill -f` – das traefe die eigene Sitzung mit (CLAUDE.md). */
async function beenden(kind) {
  if (!kind) return;
  await new Promise((r) => {
    kind.once("exit", r);
    kind.kill("SIGTERM");
    setTimeout(() => { try { kind.kill("SIGKILL"); } catch { /* schon weg */ } r(); }, 2500);
  });
}

async function starten(cwd, args, port, env = {}) {
  const kind = spawn("/usr/local/bin/deno", args, {
    cwd,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DENO_DIR: "/tmp/deno-check", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let fehler = "";
  kind.stderr.on("data", (d) => { fehler += d.toString(); });
  if (!await portAntwortet(port)) {
    await beenden(kind);
    throw new Error(`kam nicht hoch:\n${fehler.slice(0, 600)}`);
  }
  return kind;
}

// ---------------------------------------------------------------- Klienten
/** Roher WebSocket mit JSON-Nachrichten: Card Chaos und Snake. */
class Draht {
  constructor(url) { this.url = url; this.msgs = []; }
  async auf() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (ev) => {
      try { this.msgs.push(JSON.parse(ev.data)); } catch { /* kein JSON */ }
    });
    await new Promise((r, x) => {
      this.ws.addEventListener("open", r, { once: true });
      this.ws.addEventListener("error", () => x(new Error("abgelehnt")), { once: true });
      setTimeout(() => x(new Error("Zeitueberschreitung beim Aufbau")), 8000);
    });
    return this;
  }
  schicke(o) { this.ws.send(JSON.stringify(o)); }
  zu() { try { this.ws.close(); } catch { /* schon weg */ } }
  async warte(pass, ms = 20000) {
    const ende = Date.now() + ms;
    for (;;) {
      const t = this.msgs.find(pass);
      if (t) return t;
      if (Date.now() > ende) return null;
      await schlaf(40);
    }
  }
  letzte(pass) { return [...this.msgs].reverse().find(pass) ?? null; }
}

/**
 * So viel Socket.IO, wie hier gebraucht wird – wortgleich zu
 * `pruefe-keep.mjs`, damit beide Proben dasselbe sprechen und keine
 * Abhaengigkeit in ein laufendes Spiel wandert.
 */
class EngineIO {
  constructor(port) { this.port = port; this.ereignisse = []; }
  async auf() {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/socket.io/?EIO=4&transport=websocket`);
    this.ws.addEventListener("message", (ev) => {
      const roh = String(ev.data);
      if (roh === "2") return this.ws.send("3");             // Ping → Pong
      if (roh.startsWith("0")) return this.ws.send("40");    // Handschlag → beitreten
      if (roh.startsWith("40")) { this.verbunden = true; return; }
      const m = roh.match(/^4[23](\d*)(\[.*)$/s);
      if (!m) return;
      let feld;
      try { feld = JSON.parse(m[2]); } catch { return; }
      this.ereignisse.push({ name: feld[0], daten: feld[1] });
    });
    await new Promise((r, x) => {
      this.ws.addEventListener("open", r, { once: true });
      this.ws.addEventListener("error", () => x(new Error("abgelehnt")), { once: true });
      setTimeout(() => x(new Error("Zeitueberschreitung beim Aufbau")), 8000);
    });
    for (let i = 0; i < 100 && !this.verbunden; i++) await schlaf(50);
    if (!this.verbunden) throw new Error("Socket.IO-Handschlag kam nicht zustande");
    return this;
  }
  schicke(name, daten) {
    this.ws.send("42" + JSON.stringify(daten === undefined ? [name] : [name, daten]));
  }
  zu() { try { this.ws.close(); } catch { /* schon weg */ } }
  async warte(name, ms = 20000) {
    const ende = Date.now() + ms;
    for (;;) {
      const t = this.ereignisse.find((e) => e.name === name);
      if (t) return t.daten;
      if (Date.now() > ende) return null;
      await schlaf(40);
    }
  }
  letzte(name) {
    return [...this.ereignisse].reverse().find((e) => e.name === name)?.daten ?? null;
  }
}

// ---------------------------------------------------------------- Keep
async function keep() {
  const PORT = 8106;
  const DATEN = mkdtempSync(join(tmpdir(), "keep-solo-"));
  const kind = await starten("/var/www/html/keep",
    ["run", "-A", "--node-modules-dir=auto", "server/index.js"], PORT,
    { KEEP_DATA_DIR: DATEN });
  const anna = await new EngineIO(PORT).auf();
  try {
    anna.schicke("hello", {});
    await schlaf(400);
    anna.schicke("createRoom", { name: "Anna", isPublic: false });
    const raum = await anna.warte("roomState");
    pruefe("S01", Boolean(raum?.roomId), `Keep: Raum ${raum?.roomId} steht mit einer Person`);
    pruefe("S01", raum?.minPlayers === 1, `Keep: der Server nennt minPlayers=${raum?.minPlayers}`);
    pruefe("S01", raum?.players?.length === 1, "Keep: genau ein Spieler im Raum");

    anna.schicke("startGame");
    const runde = await anna.warte("roundStart", 8000);
    pruefe("S02", Boolean(runde), "Keep: die erste Runde kommt allein los");

    // Bis zum Ende: fuenf Runden, jede mit einer gemeldeten Punktzahl. Die
    // Dauer wird nicht abgewartet – der Server schliesst die Runde, sobald
    // alle Anwesenden abgegeben haben, und das ist hier eine Person.
    let letzteRunde = runde;
    for (let i = 0; i < 8 && letzteRunde; i++) {
      anna.schicke("submitRoundScore", { round: letzteRunde.round, score: 100 });
      const ende = await anna.warte("gameOver", 3000);
      if (ende) break;
      const vorher = letzteRunde.round;
      anna.schicke("toggleReady");
      for (let w = 0; w < 60; w++) {
        const r = anna.letzte("roundStart");
        if (r && r.round !== vorher) { letzteRunde = r; break; }
        if (anna.letzte("gameOver")) { letzteRunde = null; break; }
        await schlaf(100);
      }
      if (anna.letzte("gameOver")) break;
    }
    const ende = anna.letzte("gameOver");
    pruefe("S03", Boolean(ende), "Keep: die Partie laeuft allein bis zum Endstand durch");
  } finally {
    anna.zu();
    await beenden(kind);
  }
}

// ---------------------------------------------------------------- Card Chaos
async function cardchaos() {
  const PORT = 8107;
  const kind = await starten("/var/www/html/cardchaos", ["run", "-A", "server/main.js"], PORT);
  const anna = await new Draht(`ws://127.0.0.1:${PORT}/ws`).auf();
  try {
    await anna.warte((m) => m.t === "welcome");
    anna.schicke({ t: "hello", name: "Anna" });
    await anna.warte((m) => m.t === "hello");

    anna.schicke({ t: "createRoom", isPublic: false });
    const raum = await anna.warte((m) => m.t === "room");
    pruefe("S01", Boolean(raum?.room?.code), `Card Chaos: Tisch ${raum?.room?.code} steht mit einer Person`);
    pruefe("S01", raum?.room?.minPlayers === 1, `Card Chaos: der Server nennt minPlayers=${raum?.room?.minPlayers}`);
    pruefe("S01", raum?.room?.players?.length === 1, "Card Chaos: genau ein Spieler am Tisch");

    // Die kuerzeste Partie, die der Server annimmt: seit dem 19.08.2026 sind
    // nur noch 3, 5 und 10 Runden erlaubt, weil es nur dafuer eine Bestenliste
    // gibt. Geprueft wird die Lobby, nicht die Ausdauer.
    anna.schicke({ t: "rounds", value: 3 });
    await schlaf(200);
    anna.schicke({ t: "start" });
    const start = await anna.warte((m) => m.t === "roundStart", 8000);
    const fehler = anna.letzte((m) => m.t === "error");
    pruefe("S02", Boolean(start) && !fehler,
      fehler ? `Card Chaos: der Server sagt „${fehler.msg}"` : "Card Chaos: die erste Runde kommt allein los");

    // Die Runden laufen auf einer Uhr und werden nicht abgeraeumt: drei Runden
    // dauern deshalb ihre vollen 90 + 58 + 25 Sekunden (E.roundMs) plus die
    // Countdowns – daher der lange Zeitraum. Zu Ende spielen kann die Probe
    // nicht: dafuer muesste sie die Bretter wirklich leerraeumen, und genau
    // das macht `pruefe-cardchaos.mjs`.
    //
    // Zwischen den Runden wartet der Server auf „Bereit" – ohne das bliebe die
    // Partie nach der ersten Runde stehen.
    anna.ws.addEventListener("message", (ev) => {
      try {
        if (JSON.parse(ev.data).t === "roundEnd") anna.schicke({ t: "ready", value: true });
      } catch { /* kein JSON */ }
    });
    const schluss = await anna.warte((m) => m.t === "gameEnd", 260000);
    pruefe("S03", Boolean(schluss), "Card Chaos: die Partie laeuft allein bis zum Endstand durch");
  } finally {
    anna.zu();
    await beenden(kind);
  }
}

// ---------------------------------------------------------------- Snake
async function snake() {
  const PORT = 8108;
  const kind = await starten("/var/www/html/snake", ["run", "-A", "server.js"], PORT);
  const anna = await new Draht(`ws://127.0.0.1:${PORT}/ws`).auf();
  try {
    anna.schicke({ t: "create", name: "Anna", isPublic: false });
    const raum = await anna.warte((m) => m.t === "room");
    pruefe("S01", Boolean(raum?.code), `Snake: Raum ${raum?.code} steht mit einer Person`);
    pruefe("S01", raum?.minPlayers === 1, `Snake: der Server nennt minPlayers=${raum?.minPlayers}`);
    pruefe("S01", raum?.players?.length === 1, "Snake: genau ein Spieler im Raum");

    anna.schicke({ t: "settings", runden: 1 });
    await schlaf(200);
    anna.schicke({ t: "start" });
    const start = await anna.warte((m) => m.t === "runde", 8000);
    const fehler = anna.letzte((m) => m.t === "error");
    pruefe("S02", Boolean(start) && !fehler,
      fehler ? `Snake: der Server sagt „${fehler.msg}"` : "Snake: die erste Runde kommt allein los");

    // Gegen die Wand fahren: allein endet die Runde erst, wenn die einzige
    // Schlange stirbt. Genau das war die Stelle, an der ein zu strenges
    // MIN_PLAYERS sonst haengen bliebe.
    anna.schicke({ t: "dir", d: "hoch" });
    const schluss = await anna.warte((m) => m.t === "final", 30000);
    pruefe("S03", Boolean(schluss), "Snake: die Runde endet allein am Wandaufprall");

    // Der Endstand ist eine Ein-Personen-Tabelle. Die zwanzig
    // Ueberlebenspunkte bleiben dabei aus – `pruefeRundenende` vergibt sie
    // nur, wenn ausser dem Ueberlebenden noch jemand da war. Nachpruefen
    // laesst sich das hier nicht sauber: pro Tick gibt es ohnehin einen
    // Punkt, die Summe haengt also an der Fahrtdauer.
    pruefe("S03", (schluss?.tabelle ?? []).length === 1,
      `Snake: der Endstand hat ${(schluss?.tabelle ?? []).length} Zeile(n)`);
  } finally {
    anna.zu();
    await beenden(kind);
  }
}

// ---------------------------------------------------------------- Lauf
const laeufe = { keep, cardchaos, snake };
for (const [name, fn] of Object.entries(laeufe)) {
  if (NUR && NUR !== name) continue;
  console.log(`\n── ${name} ──────────────────────────────────────────`);
  try { await fn(); }
  catch (e) { rot++; befunde.push(`${name}: ${e.message}`); console.error(`  FEHL ${name}: ${e.message}`); }
}

console.log(`\n${gruen} gruen, ${rot} rot`);
if (rot) { console.error("\n" + befunde.map((b) => "  · " + b).join("\n")); process.exit(1); }
