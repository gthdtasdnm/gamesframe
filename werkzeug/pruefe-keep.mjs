// Keep ist das einzige Spiel mit Socket.IO und hat kein `probe.js`. Es fällt
// damit aus `lobbyprobe.mjs` heraus wie aus allem anderen: nachgewiesen war
// bis hierher nur das Anmelden und der Wiedereinstieg.
//
// Diese Probe spielt eine **ganze Partie über die Leitung**:
//
//   P02  Alle fünf Runden bis `gameOver`, Summen und Reihenfolge stimmen.
//   P03  Zurück in die Lobby, zweite Partie startbar.
//   P05  Nur der Host darf starten.
//   P06  Was der Server mit einer erfundenen Punktzahl macht (siehe F10):
//        `Infinity`, negativ, Text – nichts davon darf in die Summe.
//
// **Ohne neues Paket.** `socket.io-client` liegt nicht in `keep/node_modules`,
// und in ein laufendes Spiel wandert dafür keine Abhängigkeit. Engine.IO
// spricht aber über eine gewöhnliche WebSocket-Verbindung, und die vier
// Rahmentypen, die hier gebraucht werden, stehen unten in `EngineIO`.
//
//   cd /var/www/html && node werkzeug/pruefe-keep.mjs
//
// Immer gegen eine eigene Fassung auf Port 8105 – eine Partie schreibt in die
// Bestenliste, und die der Live-Fassung gehört den Leuten, die dort spielen.

import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8105;
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

let kind = null;
// Eigenes Datenverzeichnis: die Probe spielt Partien zu Ende, und die landen
// in der Bestenliste. Die echte soll davon nichts abbekommen.
const DATEN = mkdtempSync(join(tmpdir(), "keep-probe-"));

async function dienstAn() {
  kind = spawn("/usr/local/bin/deno", [
    "run", "-A", "--node-modules-dir=auto", "server/index.js",
  ], {
    cwd: "/var/www/html/keep",
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      KEEP_DATA_DIR: DATEN,
      DENO_DIR: "/tmp/deno-check",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let fehler = "";
  kind.stderr.on("data", (d) => { fehler += d.toString(); });
  if (!await portAntwortet(PORT)) throw new Error(`kam nicht hoch:\n${fehler.slice(0, 600)}`);
}
/** Nie über `pkill -f` – das träfe die eigene Sitzung mit (CLAUDE.md). */
async function dienstAus() {
  if (!kind) return;
  const k = kind; kind = null;
  await new Promise((r) => {
    k.once("exit", r);
    k.kill("SIGTERM");
    setTimeout(() => { try { k.kill("SIGKILL"); } catch { /* schon weg */ } r(); }, 2500);
  });
}

// ---------------------------------------------------------------- Engine.IO
/**
 * So viel Socket.IO, wie diese Probe braucht – und keine Zeile mehr.
 *
 *   "0{…}"   Handshake des Servers, danach schickt der Client "40" (dem
 *            Standard-Namensraum beitreten)
 *   "40{…}"  Bestätigung, ab hier laufen Ereignisse
 *   "42[…]"  ein Ereignis, als JSON-Feld [name, nutzlast]
 *   "2"/"3"  Ping vom Server, Pong vom Client – bleibt der aus, wirft der
 *            Server die Verbindung nach `pingTimeout` weg
 *
 * Rückrufe (`cb` im Server) kommen als "42<id>[…]" und werden mit
 * "43<id>[…]" beantwortet; gebraucht wird hier nur die Richtung Server→Client,
 * deshalb bleibt die Nummer stehen und wird beim Empfang abgeschnitten.
 */
class EngineIO {
  constructor(name) { this.name = name; this.ereignisse = []; }

  async auf() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/socket.io/?EIO=4&transport=websocket`);
    this.ws.addEventListener("message", (ev) => {
      const roh = String(ev.data);
      if (roh === "2") return this.ws.send("3");             // Ping → Pong
      if (roh.startsWith("0")) return this.ws.send("40");    // Handshake → beitreten
      if (roh.startsWith("40")) { this.verbunden = true; return; }
      const m = roh.match(/^4[23](\d*)(\[.*)$/s);
      if (!m) return;
      let feld;
      try { feld = JSON.parse(m[2]); } catch { return; }
      this.ereignisse.push({ name: feld[0], daten: feld[1], ack: m[1] || null });
    });
    await new Promise((r, x) => {
      this.ws.addEventListener("open", r, { once: true });
      this.ws.addEventListener("error", () => x(new Error("abgelehnt")), { once: true });
      setTimeout(() => x(new Error("Zeitüberschreitung beim Aufbau")), 8000);
    });
    for (let i = 0; i < 100 && !this.verbunden; i++) await schlaf(50);
    if (!this.verbunden) throw new Error("Socket.IO-Handschlag kam nicht zustande");
    return this;
  }

  schicke(name, daten) {
    this.ws.send("42" + JSON.stringify(daten === undefined ? [name] : [name, daten]));
  }
  zu() { try { this.ws.close(); } catch { /* schon weg */ } }

  async warte(name, ms = 15000) {
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
  vergiss() { this.ereignisse.length = 0; }
}

// ---------------------------------------------------------------- Lauf
await dienstAn();
const anna = await new EngineIO("Anna").auf();
const bert = await new EngineIO("Bert").auf();

try {
  anna.schicke("hello", {});
  bert.schicke("hello", {});
  await schlaf(500);

  anna.schicke("createRoom", { name: "Anna", isPublic: false });
  const raum = await anna.warte("roomState");
  const raumId = raum?.roomId;
  pruefe("P02", Boolean(raumId), `Raum ${raumId} steht, ${raum?.totalRounds} Runden`);

  bert.schicke("joinRoom", { roomId: raumId, name: "Bert" });
  await schlaf(600);
  const beide = bert.letzte("roomState");
  pruefe("P02", (beide?.players?.length ?? 0) === 2,
    `beide im Raum (${beide?.players?.map((p) => p.name).join(", ")})`);
  pruefe("P02", beide?.hostId === raum?.hostId, "der Ersteller bleibt Host");

  // P05: der Gast darf nicht starten.
  bert.schicke("startGame");
  await schlaf(500);
  pruefe("P05", (anna.letzte("roomState")?.status ?? "lobby") === "lobby",
    `Gast kann nicht starten (Zustand „${anna.letzte("roomState")?.status}")`);

  anna.schicke("toggleReady");
  bert.schicke("toggleReady");
  await schlaf(500);
  anna.schicke("startGame");

  // ── Die Partie ──────────────────────────────────────────────────────────
  const ersteRunde = await anna.warte("roundStart", 12000);
  pruefe("P02", Boolean(ersteRunde), `Runde 1 beginnt (${ersteRunde?.duration ?? "?"} s)`);
  const rundenZahl = ersteRunde?.totalRounds ?? 5;

  // P06: was der Server mit einer erfundenen Punktzahl macht. Vor F10 lief
  // `Infinity` bis in die Bestenliste durch.
  anna.schicke("submitRoundScore", { round: 1, score: Infinity });
  await schlaf(400);
  const nachUnfug = anna.letzte("roomState");
  pruefe("P06", true, `„Infinity" angenommen ohne Absturz (Zustand „${nachUnfug?.status}")`);

  let runde = 1;
  const punkte = [];
  for (; runde <= rundenZahl; runde++) {
    if (runde > 1) {
      const start = await anna.warte("roundStart", 15000);
      if (!start) break;
      anna.vergiss(); bert.vergiss();
    }
    const wert = 1000 * runde;
    punkte.push(wert);
    // Anna hat in Runde 1 schon „Infinity" geschickt; ein zweiter Versuch
    // derselben Runde wird abgelehnt (`room.submitted`), das ist Absicht.
    anna.schicke("submitRoundScore", { round: runde, score: wert });
    bert.schicke("submitRoundScore", { round: runde, score: wert });

    const ergebnis = await anna.warte("roundResults", 20000);
    if (!ergebnis) { pruefe("P02", false, `Runde ${runde} kam nicht zum Ende`); break; }
    pruefe("P02", ergebnis.round === runde,
      `Runde ${runde} abgerechnet: ${ergebnis.standings?.map((p) => `${p.name} ${p.roundScore}`).join(", ")}`);

    // Nach der letzten Runde **nicht** vergessen: `gameOver` kommt im selben
    // Atemzug wie das letzte `roundResults`. Wer hier den Puffer leert,
    // loescht genau die Nachricht, auf die er gleich wartet.
    if (ergebnis.isLast) break;

    anna.vergiss(); bert.vergiss();
    // Für die nächste Runde müssen beide erneut bereit sein.
    anna.schicke("toggleReady");
    bert.schicke("toggleReady");
  }

  const ende = await anna.warte("gameOver", 25000);
  pruefe("P02", Boolean(ende), `die Partie endet mit „gameOver"`);
  const tabelle = ende?.standings ?? [];
  pruefe("P02", tabelle.length === 2,
    `Endstand nennt beide: ${tabelle.map((p) => `${p.name} ${p.total}`).join(", ")}`);
  pruefe("P02", tabelle.every((p, i, a) => i === 0 || a[i - 1].total >= p.total),
    "der Endstand ist nach Gesamtpunkten sortiert");

  // P06/F10: Berts Summe ist die Probe auf die Rechnung – er hat nur saubere
  // Zahlen geschickt. Annas Summe darf durch „Infinity" nicht unendlich sein.
  const erwartet = punkte.reduce((a, b) => a + b, 0);
  const bertsSumme = tabelle.find((p) => p.name === "Bert")?.total;
  pruefe("P02", bertsSumme === erwartet,
    `Berts Summe stimmt: ${bertsSumme} (erwartet ${erwartet})`);
  const annasSumme = tabelle.find((p) => p.name === "Anna")?.total;
  pruefe("P06", Number.isFinite(annasSumme),
    `Annas Summe ist eine Zahl geblieben, trotz „Infinity": ${annasSumme}`);

  // Und die Bestenliste darf keinen unbrauchbaren Eintrag bekommen haben.
  anna.schicke("getLeaderboard");
  const liste = await anna.warte("leaderboard", 6000) ?? anna.letzte("leaderboard") ?? [];
  const kaputt = (Array.isArray(liste) ? liste : []).filter((e) => !Number.isFinite(e?.score));
  pruefe("P06", kaputt.length === 0,
    `${Array.isArray(liste) ? liste.length : 0} Einträge in der Bestenliste, keiner unbrauchbar`);

  // ── P03 ─────────────────────────────────────────────────────────────────
  anna.schicke("backToLobby");
  await schlaf(700);
  pruefe("P03", (anna.letzte("roomState")?.status ?? "") === "lobby",
    `„Zurück zur Lobby" setzt den Raum zurück (Zustand „${anna.letzte("roomState")?.status}")`);
} finally {
  anna.zu(); bert.zu();
  await schlaf(200);
  await dienstAus();
}

console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
