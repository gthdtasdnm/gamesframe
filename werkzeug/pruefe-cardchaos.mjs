// Card Chaos hat kein `probe.js`, spricht ein eigenes Protokoll und fällt
// deshalb auch aus `lobbyprobe.mjs` heraus. Was es hat, sind 37 Tests für die
// Spiel-Engine (`deno task test`) – die decken das Rechnen ab, aber nichts
// davon fasst je eine Verbindung an. Geprüft war bis hierher nur das Anmelden
// und der Wiedereinstieg (F5).
//
// Diese Probe spielt eine **ganze Partie über die Leitung**:
//
//   P02  Bis zum echten Ende: alle Runden, dann der Endstand.
//   P03  Zurück in die Lobby, zweite Partie startbar.
//   P05  Nur der Host darf `start` und `rounds`.
//   P06  Der Server rechnet selbst. Ein erfundener Zug wird nicht geglaubt,
//        sondern mit dem eigenen Stand beantwortet (`resync`).
//   P07  Kein fremdes Brett über die Leitung – nur die Zusammenfassung.
//
// Mitspielen kann sie, weil das Brett **deterministisch aus dem `seed`**
// entsteht: `roundStart` schickt den Seed, und dieselbe `createRound` aus
// `shared/engine.js` baut daraus dasselbe Brett wie der Server. Die Probe
// benutzt also die echte Engine, statt eine zweite zu erfinden.
//
//   cd /var/www/html && node werkzeug/pruefe-cardchaos.mjs
//
// Immer gegen eine eigene Fassung auf Port 8104: eine Partie kostet viele
// Züge, und das Kontingent der Live-Fassung gehört den Leuten dort.

import { spawn } from "node:child_process";
import net from "node:net";
import * as E from "../cardchaos/shared/engine.js";

const PORT = 8104;
const RUNDEN = 3;   // statt zehn - geprüft wird der Weg, nicht die Ausdauer.
                    // Weniger geht seit dem 19.08.2026 nicht mehr: der Server
                    // nimmt nur noch 3, 5 und 10 an, weil es nur dafür eine
                    // Bestenliste gibt.
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

// ---------------------------------------------------------------- Dienst
async function portAntwortet(port, ms = 12000) {
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
    await schlaf(120);
  }
}

let kind = null;
async function dienstAn() {
  kind = spawn("/usr/local/bin/deno", ["run", "-A", "server/main.js"], {
    cwd: "/var/www/html/cardchaos",
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DENO_DIR: "/tmp/deno-check" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let fehler = "";
  kind.stderr.on("data", (d) => { fehler += d.toString(); });
  if (!await portAntwortet(PORT)) throw new Error(`kam nicht hoch:\n${fehler.slice(0, 500)}`);
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

// ---------------------------------------------------------------- Klient
class Spieler {
  constructor(name) {
    this.name = name;
    this.msgs = [];
    this.raum = null;
    this.st = null;      // der eigene Rundenstand, mit der echten Engine gefuehrt
    this.seq = 0;
  }

  async auf() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    this.ws.addEventListener("message", (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.msgs.push(m);
      if (m.t === "hello") { this.id = m.id; this.token = m.token; }
      if (m.t === "room") this.raum = m.room;
      if (m.t === "roundStart") {
        this.rundenStart = m;
        this.st = E.createRound(m.seed, m.round, m.totalRounds);
      }
      if (m.t === "live") this.live = m.live;
      if (m.t === "gameEnd") this.final = m;
    });
    await new Promise((r, x) => {
      this.ws.addEventListener("open", r, { once: true });
      this.ws.addEventListener("error", () => x(new Error("abgelehnt")), { once: true });
      setTimeout(() => x(new Error("Zeitüberschreitung")), 6000);
    });
    return this;
  }

  schicke(o) { this.ws.send(JSON.stringify(o)); }
  zu() { try { this.ws.close(); } catch { /* schon weg */ } }

  async warte(pass, ms = 15000) {
    const ende = Date.now() + ms;
    for (;;) {
      const t = this.msgs.find(pass);
      if (t) return t;
      if (Date.now() > ende) return null;
      await schlaf(40);
    }
  }

  meineLive() { return (this.live ?? []).find((l) => l.id === this.id); }

  /**
   * Einen Zug machen und ihn zugleich am eigenen Stand nachvollziehen – so
   * bleibt die Probe mit dem Server im Gleichschritt, ohne seinen Stand zu
   * erfragen. Läuft sie doch auseinander, sagt der Server es mit `resync`,
   * und genau darauf zielt P06.
   */
  zieh() {
    if (!this.st || this.st.over) return false;
    const ts = Date.now();
    for (let i = 0; i < E.BOARD_SIZE; i++) {
      if (E.matchingSlot(this.st, i) >= 0) {
        E.play(this.st, i, ts);
        this.schicke({ t: "move", a: "play", i, ts, seq: ++this.seq });
        return true;
      }
    }
    if (E.canDraw(this.st)) {
      E.draw(this.st, ts);
      this.schicke({ t: "move", a: "draw", ts, seq: ++this.seq });
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------- Lauf
await dienstAn();
const anna = await new Spieler("Anna").auf();
const bert = await new Spieler("Bert").auf();

try {
  await anna.warte((m) => m.t === "welcome");
  anna.schicke({ t: "hello", name: "Anna" });
  bert.schicke({ t: "hello", name: "Bert" });
  await anna.warte((m) => m.t === "hello");
  await bert.warte((m) => m.t === "hello");

  anna.schicke({ t: "createRoom", isPublic: false });
  const raum = await anna.warte((m) => m.t === "room");
  const code = raum.room.code;
  pruefe("P02", Boolean(code), `Tisch ${code} steht`);
  pruefe("P02", raum.room.hostId === anna.id, "der Ersteller ist Host");

  bert.schicke({ t: "joinRoom", code });
  await bert.warte((m) => m.t === "room" && m.room.players.length === 2);
  pruefe("P02", bert.raum.players.length === 2, "Bert sitzt mit am Tisch");

  // P05: der Gast darf die Rundenzahl nicht setzen und nicht starten.
  bert.schicke({ t: "rounds", value: 5 });
  await schlaf(400);
  pruefe("P05", anna.raum.totalRounds !== 5,
    `Gast kann die Rundenzahl nicht ändern (steht auf ${anna.raum.totalRounds})`);
  bert.schicke({ t: "start" });
  await schlaf(400);
  pruefe("P05", anna.raum.phase === "lobby", "Gast kann die Partie nicht starten");

  anna.schicke({ t: "rounds", value: RUNDEN });
  await anna.warte((m) => m.t === "room" && m.room.totalRounds === RUNDEN);
  pruefe("P05", anna.raum.totalRounds === RUNDEN, `der Host kann es (${RUNDEN} Runden)`);

  anna.schicke({ t: "ready", value: true });
  bert.schicke({ t: "ready", value: true });
  await schlaf(500);
  anna.schicke({ t: "start" });

  // ── Die Partie ──────────────────────────────────────────────────────────
  let gespielteRunden = 0;
  let p06 = false, p07 = false;

  for (let runde = 1; runde <= RUNDEN; runde++) {
    const start = await anna.warte((m) => m.t === "roundStart" && m.round === runde, 20000);
    if (!start) break;
    gespielteRunden++;
    pruefe("P02", Boolean(start.seed), `Runde ${runde} beginnt (Seed ${start.seed})`);

    // Bis zum Rundenbeginn warten – vorher nimmt der Server keinen Zug an.
    const warten = start.startsAt - Date.now();
    if (warten > 0) await schlaf(warten + 150);

    // P06: ein erfundener Zug. Der Server rechnet selbst und darf ihn nicht
    // glauben – er antwortet mit seinem eigenen Stand.
    if (!p06) {
      anna.msgs.length = 0;
      anna.schicke({ t: "move", a: "play", i: 999, ts: Date.now(), seq: 9999 });
      const antwort = await anna.warte((m) => m.t === "resync", 3000);
      pruefe("P06", Boolean(antwort),
        `erfundener Zug (Feld 999) wird nicht geglaubt, sondern mit „resync" beantwortet` +
        (antwort ? "" : ` – bekommen: ${[...new Set(anna.msgs.map((m) => m.t))].join(", ") || "nichts"}`));
      p06 = true;
    }

    // Beide spielen ihr Brett leer.
    for (const s of [anna, bert]) {
      let zuege = 0;
      while (s.zieh() && zuege < 400) { zuege++; await schlaf(6); }
    }
    await schlaf(600);
    if (process.env.LAUT) {
      console.log("       lokal over:", anna.st?.over, bert.st?.over,
        "| live:", JSON.stringify((anna.live ?? []).map((l) => `${l.name} over=${l.over} left=${l.left} risking=${l.risking}`)));
    }

    // P07: was über die Leitung geht, ist die Zusammenfassung – nicht das
    // Brett des anderen. Sonst könnte man die Karten des Gegners mitlesen.
    if (!p07) {
      const felder = new Set(Object.keys(anna.live?.[0] ?? {}));
      const verraten = ["board", "deck", "slots", "taken", "hand"].filter((k) => felder.has(k));
      pruefe("P07", verraten.length === 0,
        `„live" enthält nur die Zusammenfassung (${[...felder].join(", ")})`);
      p07 = true;
    }

    // Nach der letzten Karte steht der Tisch noch bis zu zehn Sekunden für
    // die Risikoleiter offen (`RISK.windowMs`); die Probe fährt sie nicht,
    // sondern wartet sie ab.
    const fertig = await anna.warte((m) => m.t === "roundEnd" || m.t === "gameEnd", 25000);
    if (!fertig) { pruefe("P02", false, `Runde ${runde} kam nicht zum Ende`); break; }

    if (fertig.t === "gameEnd") {
      pruefe("P02", runde === RUNDEN, `nach Runde ${runde} ist die Partie zu Ende`);
      break;
    }

    pruefe("P02", Array.isArray(fertig.results) && fertig.results.length === 2,
      `Rundenergebnis für beide: ${fertig.results?.map((r) => `${r.name} ${r.score}`).join(", ")}`);
    pruefe("P02", fertig.results.every((r, i, a) => i === 0 || a[i - 1].score >= r.score),
      "das Ergebnis ist nach Punkten sortiert");

    // Für die nächste Runde müssen beide erneut bereit sein - von selbst geht
    // es nicht weiter. Genau das hatte die Probe zuerst falsch erwartet.
    anna.msgs.length = 0; bert.msgs.length = 0;
    anna.schicke({ t: "ready", value: true });
    bert.schicke({ t: "ready", value: true });
  }

  pruefe("P02", gespielteRunden === RUNDEN, `${gespielteRunden} von ${RUNDEN} Runden gespielt`);

  const ende = await anna.warte((m) => m.t === "gameEnd", 20000);
  pruefe("P02", Boolean(ende), `die Partie endet mit „gameEnd"`);
  pruefe("P02", (ende?.results?.length ?? 0) === 2,
    `Endstand nennt beide: ${ende?.results?.map((r) => `${r.name} ${r.score}`).join(", ")}`);
  pruefe("P02", (ende?.results ?? []).every((r) => (r.rounds?.length ?? 0) === RUNDEN),
    `je ${RUNDEN} Rundenergebnisse je Spieler`);
  const meine = anna.meineLive();
  pruefe("P02", (meine?.score ?? 0) > 0,
    `Anna hat wirklich gepunktet (${meine?.score ?? 0} Punkte, ${meine?.clears ?? 0} geräumte Bretter)`);

  // ── P03: zurück in die Lobby ────────────────────────────────────────────
  anna.schicke({ t: "leaveRoom" });
  await schlaf(500);
  anna.schicke({ t: "createRoom", isPublic: false });
  const zweiter = await anna.warte((m) => m.t === "room" && m.room.phase === "lobby", 8000);
  pruefe("P03", Boolean(zweiter), "nach der Partie lässt sich ein neuer Tisch aufmachen");
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
