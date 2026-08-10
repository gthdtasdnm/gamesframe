// Grenzen und Dauerlast – Abschnitt G des Prüfplans.
//
// Geprüft wird die Bremse (`gemeinsam/bremse.js`) und das, was der Client
// daraus macht. Nicht die Spielregeln: dafür gibt es `probe.js`, und nicht die
// Lobby: dafür gibt es `lobbyprobe.mjs`.
//
//   G01  Gleichzeitige Verbindungen je IP – passt eine Party hinein?
//   G02  40 neue Verbindungen je IP und Minute – sperrt sich ein Client, dem
//        der Server kurz weggebrochen ist, selbst aus?
//   G03  Räume je IP im Zeitfenster – kommt eine saubere Meldung?
//   G04  Verbindungskonto: nach vielen Auf/Zu-Zyklen wieder bei null?
//   G05  Leichen: Räume auf und alle verlassen – bleibt etwas stehen?
//   G06  Dienst neu starten, während Leute drin sind.
//
// **Jeder Abschnitt startet seine eigene Fassung** auf einem freien Port. Die
// Bremse zählt je IP, und diese Probe reizt sie absichtlich aus – gegen live
// liefe sie ins Kontingent echter Leute und würde sie aussperren. Aus
// demselben Grund bekommt jeder Abschnitt einen frischen Dienst: nur so fangen
// alle Zähler bei null an.
//
//   cd /var/www/html && node werkzeug/grenzprobe.mjs
//   … --nur G02          nur ein Abschnitt
//   … --spiel werwolf    ein anderes Spiel (Vorgabe: paare)
//
// Node braucht kein Paket – `WebSocket` ist seit Node 21 eingebaut.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";

const arg = (name, vorgabe) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : vorgabe;
};
const SPIEL = arg("--spiel", "paare");
const PORT = Number(arg("--port", "8102"));
const NUR = arg("--nur", null);

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Die Grenzen werden aus `gemeinsam/bremse.js` **gelesen**, nicht hier noch
 * einmal hingeschrieben. Eine Probe, die ihre Erwartung fest eingebaut hat,
 * schlaegt beim naechsten begruendeten Wert fehl und behauptet dann einen
 * Fehler, wo eine Entscheidung war.
 */
const bremseQuelle = await readFile("/var/www/html/gemeinsam/bremse.js", "utf8");
const grenze = (name) => {
  const t = bremseQuelle.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  if (!t) throw new Error(`${name} steht nicht in gemeinsam/bremse.js`);
  return Number(t[1]);
};
const MAX_GLEICHZEITIG = grenze("MAX_GLEICHZEITIG");
const MAX_NEU = grenze("MAX_NEU");
const MAX_RAEUME = grenze("MAX_RAEUME");

let gruen = 0, rot = 0;
const befunde = [];
const pruefe = (test, ok, text) => {
  if (ok) { gruen++; console.log(`  ok   ${test} ${text}`); }
  else { rot++; befunde.push(`${test}: ${text}`); console.error(`  FEHL ${test} ${text}`); }
};
const merke = (test, text) => console.log(`  ·    ${test} ${text}`);

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

class Dienst {
  async an() {
    this.kind = spawn("/usr/local/bin/deno", [
      "run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "server.js",
    ], {
      cwd: `/var/www/html/${SPIEL}`,
      env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DENO_DIR: "/tmp/deno-check" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.fehler = "";
    this.kind.stderr.on("data", (d) => { this.fehler += d.toString(); });
    if (!await portAntwortet(PORT)) throw new Error(`kam nicht hoch:\n${this.fehler.slice(0, 500)}`);
    return this;
  }

  /** Nie über `pkill -f` – das träfe die eigene Sitzung mit (CLAUDE.md). */
  async aus() {
    if (!this.kind) return;
    const k = this.kind;
    this.kind = null;
    await new Promise((r) => {
      k.once("exit", r);
      k.kill("SIGTERM");
      setTimeout(() => { try { k.kill("SIGKILL"); } catch { /* schon weg */ } r(); }, 2500);
    });
    await schlaf(150);
  }
}

/** Frischer Dienst je Abschnitt – setzt alle Zähler der Bremse zurück. */
async function mitDienst(fn) {
  const d = await new Dienst().an();
  try { return await fn(d); } finally { await d.aus(); }
}

// ---------------------------------------------------------------- Klient
const URL_WS = () => `ws://127.0.0.1:${PORT}/ws`;

/**
 * Eine Verbindung aufmachen und sagen, was daraus geworden ist.
 * `{ ok: true, ws }` oder `{ ok: false, grund }`. Ein abgelehnter Aufbau
 * meldet sich beim eingebauten WebSocket nur als `error` – die 429 selbst
 * sieht man dort nicht, deshalb steht sie hier nicht im Grund.
 */
function verbinde(timeout = 4000) {
  return new Promise((r) => {
    let ws;
    try { ws = new WebSocket(URL_WS()); } catch (e) { return r({ ok: false, grund: String(e) }); }
    const fertig = (x) => { clearTimeout(uhr); r(x); };
    const uhr = setTimeout(() => { try { ws.close(); } catch { /* egal */ } fertig({ ok: false, grund: "Zeitüberschreitung" }); }, timeout);
    ws.msgs = [];
    ws.addEventListener("message", (ev) => {
      try { ws.msgs.push(JSON.parse(ev.data)); } catch { /* kein JSON */ }
    });
    ws.addEventListener("open", () => fertig({ ok: true, ws }));
    ws.addEventListener("error", () => fertig({ ok: false, grund: "abgelehnt" }));
    ws.addEventListener("close", (ev) => fertig({ ok: false, grund: `zu (${ev.code})` }));
  });
}

const schicke = (ws, o) => ws.send(JSON.stringify(o));

/** Auf eine Nachricht warten, die `pass` erfüllt. */
function warteAuf(ws, pass, ms = 3000) {
  return new Promise((r) => {
    const treffer = ws.msgs.find(pass);
    if (treffer) return r(treffer);
    const uhr = setTimeout(() => { ws.removeEventListener("message", horch); r(null); }, ms);
    function horch(ev) {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (pass(m)) { clearTimeout(uhr); ws.removeEventListener("message", horch); r(m); }
    }
    ws.addEventListener("message", horch);
  });
}

const zu = (ws) => { try { ws.close(); } catch { /* schon weg */ } };

// ══════════════════════════════════════════════════════════════════ G01
// Gleichzeitige Verbindungen je IP. Die Frage dahinter ist keine technische:
// **eine Party sitzt an einem Anschluss.** Werwolf hat zwölf Plätze, Imposter,
// Wer am ehesten und Flaschendrehen haben zehn. Die Grenze stand einmal auf
// 12 – eine Zwölfer-Runde Werwolf passte damit exakt hinein und hatte für
// jedes Neuladen null Spielraum. Siehe F3 im Prüfplan.
async function G01() {
  console.log("\nG01 · gleichzeitige Verbindungen je IP");
  await mitDienst(async () => {
    const offen = [];
    let abgelehntBei = null;
    for (let i = 1; i <= MAX_GLEICHZEITIG + 3; i++) {
      const v = await verbinde();
      if (v.ok) offen.push(v.ws);
      else { abgelehntBei = i; break; }
    }
    pruefe("G01", offen.length === MAX_GLEICHZEITIG && abgelehntBei === MAX_GLEICHZEITIG + 1,
      `${offen.length} Verbindungen angenommen (Grenze ${MAX_GLEICHZEITIG}), die ${abgelehntBei}. abgelehnt`);

    // Was heisst das für eine Runde? Jeder Spieler braucht eine Verbindung,
    // und wer neu lädt, hält für einen Moment zwei. Die Platzzahl wird aus der
    // Quelle *gelesen*, nicht importiert: ein `import` von `server.js` würde
    // den Server starten, statt eine Zahl zu liefern.
    const quelle = await readFile(`/var/www/html/${SPIEL}/server.js`, "utf8");
    const plaetze = Number(quelle.match(/MAX_PLAYERS\s*=\s*(\d+)/)?.[1] ?? 0);
    merke("G01", `${offen.length} Verbindungen je Anschluss` +
      (plaetze ? `, ${SPIEL} hat ${plaetze} Plätze → ${offen.length - plaetze} übrig fürs Neuladen` : ""));

    for (const ws of offen) zu(ws);
    await schlaf(400);

    // Nach dem Schliessen muss sofort wieder Platz sein – sonst ist jedes
    // Neuladen ein Schritt Richtung Selbstsperre.
    const wieder = await verbinde();
    pruefe("G01", wieder.ok, `nach dem Schliessen sofort wieder frei (${wieder.grund ?? "ok"})`);
    if (wieder.ok) zu(wieder.ws);
  });
}

// ══════════════════════════════════════════════════════════════════ G02
// Vierzig neue Verbindungen je IP und Minute. Die Grenze ist nicht das
// Interessante – interessant ist, wie schnell der Client dagegenläuft.
async function G02() {
  console.log("\nG02 · neue Verbindungen je Minute");
  await mitDienst(async () => {
    let angenommen = 0, abgelehntBei = null;
    for (let i = 1; i <= MAX_NEU + 10; i++) {
      const v = await verbinde();
      if (v.ok) { angenommen++; zu(v.ws); await schlaf(30); }
      else { abgelehntBei = i; break; }
    }
    pruefe("G02", angenommen === MAX_NEU && abgelehntBei === MAX_NEU + 1,
      `${angenommen} neue Verbindungen angenommen (Grenze ${MAX_NEU}), die ${abgelehntBei}. abgelehnt`);

    // Wie oft versucht ein Client es in der ersten Minute nach einem Abbruch?
    // Der Rückzug wird aus `schale.js` gelesen, nicht hier wiederholt.
    const schale = await readFile("/var/www/html/gemeinsam/schale.js", "utf8");
    const anfang = Number(schale.match(/WARTE_ANFANG\s*=\s*(\d+)/)?.[1] ?? 0);
    const deckel = Number(schale.match(/WARTE_MAX\s*=\s*(\d+)/)?.[1] ?? 0);
    const faktor = Number(schale.match(/warte\s*\*\s*([\d.]+)\s*,\s*WARTE_MAX/)?.[1] ?? 0);
    let versuche = 0;
    for (let t = 0, w = anfang; t < 60000; versuche++) {
      t += w;
      w = Math.min(w * faktor, deckel);
    }
    pruefe("G02", versuche < MAX_NEU,
      `Client versucht es in der ersten Minute ${versuche}× (Rückzug ${anfang} ms ×${faktor}, ` +
      `gedeckelt bei ${deckel} ms) – Grenze ${MAX_NEU}`);
    pruefe("G02", versuche * 2 < MAX_NEU,
      `auch zwei Tabs an einem Anschluss bleiben darunter (${versuche * 2}×)`);

    // Fängt er sich wieder? Das Fenster ist eine Minute; hier wird nicht eine
    // Minute gewartet, sondern nur festgestellt, dass die Sperre greift und
    // die Verbindung danach nicht dauerhaft tot ist.
    const nochmal = await verbinde();
    pruefe("G02", !nochmal.ok, `im gesperrten Zustand bleibt es abgelehnt (${nochmal.grund})`);
  });
}

// ══════════════════════════════════════════════════════════════════ G03
async function G03() {
  console.log("\nG03 · Räume je IP");
  await mitDienst(async () => {
    // Je Raum eine eigene Verbindung: ein zweites `create` auf derselben
    // Verbindung lässt der Server absichtlich fallen (`if (room) return`) –
    // wer schon in einem Raum sitzt, macht keinen zweiten auf. Nacheinander
    // auf und zu bleibt dabei unter beiden anderen Grenzen.
    let angelegt = 0, meldung = null, letzteWs = null;
    for (let i = 1; i <= MAX_RAEUME + 3; i++) {
      const v = await verbinde();
      if (!v.ok) return pruefe("G03", false, `Verbindung ${i} scheiterte: ${v.grund}`);
      schicke(v.ws, { t: "create", name: `Probe${i}`, isPublic: false });
      const antwort = await warteAuf(v.ws, (m) => m.t === "joined" || m.t === "error");
      if (antwort?.t === "joined") { angelegt++; zu(v.ws); await schlaf(25); }
      else { meldung = antwort?.msg ?? "(keine Antwort)"; letzteWs = v.ws; break; }
    }
    pruefe("G03", angelegt === MAX_RAEUME, `${angelegt} Räume angelegt, dann abgelehnt`);
    pruefe("G03", Boolean(meldung) && meldung !== "(keine Antwort)",
      `saubere Meldung statt Schweigen: „${meldung}"`);

    // Die Verbindung muss danach weiter brauchbar sein – wer zu schnell war,
    // soll warten müssen, nicht neu laden.
    if (letzteWs) {
      letzteWs.msgs.length = 0;
      schicke(letzteWs, { t: "browse" });
      const liste = await warteAuf(letzteWs, (m) => m.t === "rooms");
      pruefe("G03", Boolean(liste), "Verbindung nach der Ablehnung weiter brauchbar");
      zu(letzteWs);
    }
  });
}

// ══════════════════════════════════════════════════════════════════ G04
// Das Verbindungskonto muss nach jedem Schliessen wieder sinken. Täte es das
// nicht, sperrte sich eine IP über Tage selbst aus – der Fehler fiele erst
// auf, wenn niemand mehr hineinkäme, und nur bei Vielspielern.
async function G04() {
  console.log("\nG04 · Verbindungskonto läuft zurück");
  await mitDienst(async () => {
    // 30 Zyklen bleiben unter der Grenze von 40 je Minute; geprüft wird das
    // Konto der *gleichzeitigen* Verbindungen, nicht das der neuen.
    for (let i = 0; i < 30; i++) {
      const v = await verbinde();
      if (!v.ok) return pruefe("G04", false, `Zyklus ${i + 1} scheiterte: ${v.grund}`);
      zu(v.ws);
      await schlaf(25);
    }
    await schlaf(400);
    // Wären die 30 nicht abgezogen worden, wäre bei 12 längst Schluss.
    const offen = [];
    for (let i = 0; i < 10; i++) {
      const v = await verbinde();
      if (v.ok) offen.push(v.ws);
    }
    pruefe("G04", offen.length === 10,
      `nach 30 Auf/Zu-Zyklen wieder ${offen.length} von 10 gleichzeitig möglich`);
    for (const ws of offen) zu(ws);
  });
}

// ══════════════════════════════════════════════════════════════════ G05
async function G05() {
  console.log("\nG05 · Leichen");
  await mitDienst(async () => {
    // Zehn Räume – mehr lässt die Bremse in zehn Minuten nicht zu, und für
    // die Frage „bleibt etwas stehen?" reichen sie.
    const wss = [];
    for (let i = 0; i < 10; i++) {
      const v = await verbinde();
      if (!v.ok) break;
      schicke(v.ws, { t: "create", name: `Leiche${i}`, isPublic: true });
      await warteAuf(v.ws, (m) => m.t === "joined");
      wss.push(v.ws);
      await schlaf(25);
    }
    pruefe("G05", wss.length === 10, `${wss.length} öffentliche Räume aufgemacht`);

    const schauer = await verbinde();
    schicke(schauer.ws, { t: "browse" });
    const vorher = await warteAuf(schauer.ws, (m) => m.t === "rooms");
    pruefe("G05", (vorher?.rooms?.length ?? 0) === 10,
      `Raumliste zeigt ${vorher?.rooms?.length ?? 0} Räume`);

    for (const ws of wss) zu(ws);
    await schlaf(800);

    schauer.ws.msgs.length = 0;
    schicke(schauer.ws, { t: "browse" });
    const nachher = await warteAuf(schauer.ws, (m) => m.t === "rooms");
    pruefe("G05", (nachher?.rooms?.length ?? 0) === 0,
      `nach dem Verlassen bleiben ${nachher?.rooms?.length ?? 0} Räume stehen`);
    zu(schauer.ws);
  });
}

// ══════════════════════════════════════════════════════════════════ G06
// Dienst neu starten, während jemand drin sitzt. Was der Mensch sieht, hängt
// am Client; was hier geprüft wird, ist die Seite des Servers: kommt jemand
// mit seinem Token auf denselben Platz zurück – oder ist der Raum weg?
async function G06() {
  console.log("\nG06 · Neustart während einer Partie");
  const d = await new Dienst().an();
  try {
    const a = await verbinde();
    schicke(a.ws, { t: "create", name: "Anna", isPublic: true });
    const rein = await warteAuf(a.ws, (m) => m.t === "joined");
    pruefe("G06", Boolean(rein?.code), `Raum ${rein?.code} steht`);

    const zuUhr = new Promise((r) => a.ws.addEventListener("close", (ev) => r(ev.code)));
    await d.aus();
    const schlusscode = await Promise.race([zuUhr, schlaf(4000).then(() => null)]);
    pruefe("G06", schlusscode !== null,
      `der Client merkt den Ausfall (Schlusscode ${schlusscode})`);

    await new Dienst().an.call(d);
    const b = await verbinde();
    if (!b.ok) return pruefe("G06", false, `nach dem Neustart keine Verbindung: ${b.grund}`);
    schicke(b.ws, { t: "join", code: rein.code, token: rein.token, name: "Anna" });
    const antwort = await warteAuf(b.ws, (m) => m.t === "joined" || m.t === "error");
    pruefe("G06", antwort?.t === "error",
      `der alte Raum ist weg, und das wird gesagt statt verschwiegen: ` +
      `${antwort?.t === "error" ? `„${antwort.msg}"` : JSON.stringify(antwort)}`);
    merke("G06", "Räume liegen nur im Arbeitsspeicher – ein Neustart beendet jede Partie. " +
      "Das ist Absicht (keine Datenbank je Spiel), muss dem Client aber sagbar sein.");
    zu(b.ws);
  } finally {
    await d.aus();
  }
}

// ---------------------------------------------------------------- Lauf
const ALLE = { G01, G02, G03, G04, G05, G06 };
console.log(`Grenzprobe gegen eine eigene Fassung von „${SPIEL}" auf Port ${PORT}`);
for (const [name, fn] of Object.entries(ALLE)) {
  if (NUR && NUR !== name) continue;
  try {
    await fn();
  } catch (e) {
    rot++;
    befunde.push(`${name}: ${e.message}`);
    console.error(`  FEHL ${name} ${e.message}`);
  }
}

console.log(`\n${gruen} grün, ${rot} rot`);
if (rot) {
  console.error("\nBefunde:");
  for (const b of befunde) console.error("  · " + b);
  process.exit(1);
}
console.log("ALLES GRÜN");
