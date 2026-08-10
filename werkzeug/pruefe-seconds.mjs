// Seconds hat als einziges Spiel mit Server **kein `probe.js`** – es spricht
// ein eigenes Protokoll (`list`/`join`/`rejoin`/`pick`) und fällt deshalb auch
// aus `lobbyprobe.mjs` heraus. Bis hierher war nichts nachgewiesen ausser dem
// Anmelden und dem Wiedereinstieg (F5).
//
// Diese Probe spielt eine **ganze Partie** bis zum Endstand und prüft dabei
// den Abschnitt P des Prüfplans:
//
//   P02  Bis zum echten Ende: Zielpunktzahl erreicht, Endstand steht.
//   P03  `again` → zurück in die Lobby, Punkte auf null, zweite Partie geht.
//   P05  Nur der Host darf `start`, `target`, `again`.
//   P06  Ein Griff daneben kostet eine Sperre; ein Symbol, das gar nicht in
//        der eigenen Hand liegt, wird nicht angenommen.
//   P07  Geheimnisse: kein fremdes Blatt und kein `match` über die Leitung.
//
// Seconds ist ein Dobble-artiges Spiel: eine Karte in der Mitte, eine auf der
// Hand, genau ein Symbol kommt auf beiden vor. Der Client rechnet den Treffer
// selbst aus – deshalb kann die Probe wirklich spielen, statt zu raten.
//
//   cd /var/www/html && node werkzeug/pruefe-seconds.mjs
//   … --live      gegen https://inf-zeus.de statt gegen eine eigene Fassung
//
// Ohne `--live` startet die Probe eine eigene Fassung auf Port 8103: eine
// Partie kostet mehrere Räume und viele Verbindungen, und das Kontingent der
// Live-Fassung gehört den Leuten, die dort spielen.

import { spawn } from "node:child_process";
import net from "node:net";

const LIVE = process.argv.includes("--live");
const PORT = 8103;
const WS = LIVE ? "wss://inf-zeus.de/seconds/ws" : `ws://127.0.0.1:${PORT}/ws`;

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};

// ---------------------------------------------------------------- Dienst
async function portAntwortet(port, ms = 10000) {
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
  kind = spawn("/usr/local/bin/deno", [
    "run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "server.js",
  ], {
    cwd: "/var/www/html/seconds",
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
  constructor(name) { this.name = name; this.msgs = []; this.stand = null; }

  async auf() {
    this.ws = new WebSocket(WS);
    this.ws.addEventListener("message", (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.msgs.push(m);
      if (m.t === "state") this.stand = m;
      if (m.t === "joined") { this.roomId = m.roomId; this.pid = m.pid; this.token = m.token; }
    });
    await new Promise((r, x) => {
      this.ws.addEventListener("open", r, { once: true });
      this.ws.addEventListener("error", () => x(new Error("Verbindung abgelehnt")), { once: true });
      setTimeout(() => x(new Error("Zeitüberschreitung")), 6000);
    });
    return this;
  }

  schicke(o) { this.ws.send(JSON.stringify(o)); }
  zu() { try { this.ws.close(); } catch { /* schon weg */ } }

  /** Auf einen Zustand warten, der `pass` erfüllt. */
  async warte(pass, ms = 12000) {
    const ende = Date.now() + ms;
    for (;;) {
      if (this.stand && pass(this.stand)) return this.stand;
      if (Date.now() > ende) return null;
      await schlaf(40);
    }
  }

  /** Das Symbol, das auf der eigenen Hand *und* in der Mitte liegt. */
  treffer() {
    const mitte = new Set((this.stand?.center?.layout ?? []).map((k) => k.s));
    return (this.stand?.hand?.layout ?? []).map((k) => k.s).find((s) => mitte.has(s));
  }
}

// ---------------------------------------------------------------- Lauf
if (!LIVE) await dienstAn();
const anna = await new Spieler("Anna").auf();
const bert = await new Spieler("Bert").auf();

try {
  // ── Lobby ───────────────────────────────────────────────────────────────
  anna.schicke({ t: "create", name: "Anna", roomName: "Probe", isPublic: false });
  await anna.warte((s) => s.room);
  pruefe("P02", Boolean(anna.roomId), `Raum ${anna.roomId} steht, Anna ist Host`);
  pruefe("P02", anna.stand.you.isHost, "der Ersteller ist Host");

  bert.schicke({ t: "join", roomId: anna.roomId, name: "Bert" });
  await bert.warte((s) => s.players.length === 2);
  pruefe("P02", bert.stand.players.length === 2, "Bert sitzt mit am Tisch");

  // P05: der Gast darf die Zielpunktzahl nicht setzen.
  bert.schicke({ t: "target", value: 15 });
  await schlaf(300);
  pruefe("P05", bert.stand.room.target !== 15,
    `Gast kann das Ziel nicht ändern (steht auf ${bert.stand.room.target})`);

  anna.schicke({ t: "target", value: 5 });
  await anna.warte((s) => s.room.target === 5);
  pruefe("P05", anna.stand.room.target === 5, "der Host kann es");

  // P05: der Gast darf nicht starten.
  bert.schicke({ t: "start" });
  await schlaf(300);
  pruefe("P05", bert.stand.room.state === "lobby", "Gast kann die Runde nicht starten");

  bert.schicke({ t: "ready", ready: true });
  await anna.warte((s) => s.players.every((p) => p.ready || p.host));
  anna.schicke({ t: "start" });

  const los = await anna.warte((s) => s.room.state === "countdown" || s.room.state === "playing");
  pruefe("P02", Boolean(los), "die Partie läuft los");

  // ── Die Partie ──────────────────────────────────────────────────────────
  const ziel = anna.stand.room.target;
  let runden = 0;
  let danebenGeprueft = false, fremdGeprueft = false, geheimGeprueft = false;

  while (runden < 60) {
    const spielt = await anna.warte((s) => s.room.state === "playing", 15000);
    if (!spielt) break;
    runden++;

    // P07: in *keinem* Zustand darf ein fremdes Blatt oder das Treffersymbol
    // selbst über die Leitung gehen. Nur die eigene Hand und die Mitte.
    if (!geheimGeprueft) {
      const roh = JSON.stringify(anna.stand);
      const eigene = new Set((anna.stand.hand?.layout ?? []).map((k) => k.s));
      const bertsHand = new Set((bert.stand.hand?.layout ?? []).map((k) => k.s));
      const nurBert = [...bertsHand].filter((s) => !eigene.has(s));
      const mitte = new Set((anna.stand.center?.layout ?? []).map((k) => k.s));
      const verraten = nurBert.filter((s) => !mitte.has(s) &&
        roh.includes(`"s":${s}`));
      pruefe("P07", verraten.length === 0,
        `Annas Zustand enthält kein fremdes Blatt (${nurBert.length} Symbole nur bei Bert)`);
      pruefe("P07", !("match" in (anna.stand.hand ?? {})),
        "das Treffersymbol wird nicht mitgeschickt – der Client rechnet es aus");
      geheimGeprueft = true;
    }

    // P06: ein Symbol, das gar nicht auf der eigenen Hand liegt, darf nichts
    // bewirken. Sonst könnte man mit einer erratenen Zahl punkten.
    if (!fremdGeprueft) {
      const eigene = new Set((bert.stand.hand?.layout ?? []).map((k) => k.s));
      const fremd = [...Array(60).keys()].find((s) => !eigene.has(s));
      const vorher = bert.stand.players.find((p) => p.id === bert.pid).score;
      bert.schicke({ t: "pick", sym: fremd });
      await schlaf(400);
      const nachher = bert.stand.players.find((p) => p.id === bert.pid).score;
      pruefe("P06", nachher === vorher && bert.stand.room.state === "playing",
        `Symbol ${fremd} liegt nicht auf Berts Hand und bewirkt nichts`);
      fremdGeprueft = true;
    }

    // P06: ein Griff daneben sperrt kurz.
    if (!danebenGeprueft) {
      const mitte = new Set((bert.stand.center?.layout ?? []).map((k) => k.s));
      const daneben = (bert.stand.hand?.layout ?? []).map((k) => k.s).find((s) => !mitte.has(s));
      if (daneben != null) {
        bert.schicke({ t: "pick", sym: daneben });
        await schlaf(400);
        const ich = bert.stand.you;
        pruefe("P06", ich.lockUntil > Date.now(),
          `Fehlgriff sperrt Bert für ${Math.round((ich.lockUntil - Date.now()))} ms`);
        danebenGeprueft = true;
      }
    }

    // Anna greift richtig zu.
    const t = anna.treffer();
    if (t == null) { await schlaf(200); continue; }
    anna.schicke({ t: "pick", sym: t });
    const weiter = await anna.warte(
      (s) => s.room.state === "roundEnd" || s.room.state === "finished", 6000);
    if (!weiter) break;
    if (anna.stand.room.state === "finished") break;
  }

  const ende = anna.stand;
  const annasPunkte = ende.players.find((p) => p.id === anna.pid).score;
  pruefe("P02", ende.room.state === "finished",
    `Partie zu Ende nach ${runden} Runden (Zustand „${ende.room.state}")`);
  pruefe("P02", annasPunkte >= ziel,
    `Anna hat das Ziel erreicht: ${annasPunkte} von ${ziel}`);
  pruefe("P02", bert.stand.room.state === "finished",
    "auch Bert sieht den Endstand");
  pruefe("P02", ende.players.every((p) => p.score >= 0 && p.score <= ziel),
    `alle Punktstände plausibel: ${ende.players.map((p) => `${p.name} ${p.score}`).join(", ")}`);

  // ── P03: noch einmal ────────────────────────────────────────────────────
  bert.schicke({ t: "again" });
  await schlaf(400);
  pruefe("P05", anna.stand.room.state === "finished",
    "der Gast kann die Partie nicht neu aufsetzen");

  anna.schicke({ t: "again" });
  const zurueck = await anna.warte((s) => s.room.state === "lobby");
  pruefe("P03", Boolean(zurueck), `„Nochmal" bringt alle zurück in die Lobby`);
  pruefe("P03", anna.stand.players.every((p) => p.score === 0),
    `die Punkte stehen wieder auf null (${anna.stand.players.map((p) => p.score).join(", ")})`);
  pruefe("P03", anna.stand.players.every((p) => !p.ready || p.host),
    "der Bereit-Zustand ist zurückgesetzt");

  bert.schicke({ t: "ready", ready: true });
  await anna.warte((s) => s.players.every((p) => p.ready || p.host));
  anna.schicke({ t: "start" });
  const zweite = await anna.warte((s) => s.room.state === "countdown" || s.room.state === "playing");
  pruefe("P03", Boolean(zweite), "eine zweite Partie lässt sich starten");

  // P04 gibt es hier nicht: Seconds kennt kein vorzeitiges Beenden durch den
  // Host. Eine Runde dauert Sekunden, das Ziel ist nach wenigen erreicht –
  // insofern stimmig, nur nicht einheitlich mit den übrigen Spielen.
  console.log("  ·    P04  Seconds kennt kein vorzeitiges Beenden – siehe F4");
} finally {
  anna.zu(); bert.zu();
  await schlaf(200);
  if (!LIVE) await dienstAus();
}

console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
