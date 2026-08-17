#!/usr/bin/env node
// ══════════════ Lobby-Probe ═══════════════════════════════════════════════
// Prueft den Weg *in* ein Spiel hinein und wieder hinaus - nicht das Spiel
// selbst. Das machen die `probe.js` je Spiel, und die spielen eine echte
// Partie durch. Was dort niemand tut: neu laden, das Netz verlieren, einen
// zweiten Tab aufmachen, einer laufenden Runde beitreten, Muell schicken.
// Genau das macht ein echter Mensch aber staendig.
//
// Deckt die sechzehn Spiele mit gemeinsamem Lobby-Protokoll ab
// (browse/create/join/name/ready/settings/start/ende/again/leave/ping).
// seconds, keep und cardchaos sprechen ein anderes und fehlen hier.
//
//   node werkzeug/lobbyprobe.mjs                 # alle
//   node werkzeug/lobbyprobe.mjs --nur paare
//   node werkzeug/lobbyprobe.mjs --nur paare --test L07
//   node werkzeug/lobbyprobe.mjs --lang          # auch die 60-s-Tests
//   node werkzeug/lobbyprobe.mjs --port 8062     # gegen 127.0.0.1 statt live
//
// Kein Testrahmen und keine Abhaengigkeit: Node bringt WebSocket seit 21
// selbst mit. Das Skript wirft nicht, es sammelt - am Ende steht eine Liste
// und ein Exitcode.
//
// Gegen live heisst: durch Apache, mit TLS, mit der X-Forwarded-For-Auswertung
// der Bremse. Deshalb ist das die Vorgabe. Die Bremse laesst je IP nur vierzig
// neue Verbindungen je Minute zu, und die Probe braucht rund fuenfzig je
// Spiel - `warteAufKontingent` haelt sie deshalb selbst zurueck.
// ──────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Aufruf
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name, vorgabe = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : vorgabe;
};
const flag = (name) => argv.includes(name);

const NUR = arg("--nur");
const NUR_TEST = arg("--test");
const LANG = flag("--lang");
const LIVE = flag("--live");
const PORT = arg("--port");
const PRUEFPORT = Number(arg("--pruefport", "8101"));
const BASIS = arg("--url", "wss://inf-zeus.de");

/** Spiele mit gemeinsamem Lobby-Protokoll, in der Reihenfolge des Plans. */
const SPIELE = [
  // Gruppe A - raum.js und schale.js
  "snake", "werwolf", "maumau", "becher", "kingscup", "schwimmen", "paare",
  // Gruppe B - raum.js, eigener Client
  "amehesten", "cubes", "wortleger", "luegen",
  // Gruppe C - eigene Klempnerei, gleiches Protokoll
  "nochnie", "maexchen", "imposter", "flasche", "luckyreflex",
];

const GRUPPE = (spiel) =>
  SPIELE.indexOf(spiel) < 7 ? "A" : SPIELE.indexOf(spiel) < 11 ? "B" : "C";

/**
 * Spielgrenzen und Koennen aus dem Quelltext lesen.
 *
 * Die Spiele auf `raum.js` schicken `minPlayers`/`maxPlayers` in jedem
 * `room`; die drei aeltesten (nochnie, maexchen, luckyreflex) tun das nicht
 * oder nur halb. Statt die Probe daran scheitern zu lassen, wird im Server
 * nachgesehen - das ist dieselbe Quelle, aus der auch das Spiel sie nimmt.
 */
const merkmale = new Map();
async function koennen(spiel) {
  if (merkmale.has(spiel)) return merkmale.get(spiel);
  const { readFileSync } = await import("node:fs");
  let q = "";
  try { q = readFileSync(`/var/www/html/${spiel}/server.js`, "utf8"); } catch { /* dann eben nicht */ }
  const zahl = (name, vorgabe) => {
    const m = q.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : vorgabe;
  };
  const k = {
    // Ohne MIN_PLAYERS gibt es keine Untergrenze: Lucky Reflex laesst eine
    // Runde allein ausdruecklich zu. Eine 2 als Vorgabe wuerde der Probe
    // einen Fehler vorgaukeln, den das Spiel nicht hat.
    min: zahl("MIN_PLAYERS", 1),
    max: zahl("MAX_PLAYERS", 6),
    // Nicht jedes Spiel laesst den Host vorzeitig beenden - Lucky Reflex hat
    // dafuer weder Knopf noch Handler, und eine Runde dauert dort Sekunden.
    kannEnde: /case "ende"/.test(q),
  };
  merkmale.set(spiel, k);
  return k;
}

function wsUrl(spiel) {
  if (PORT) return `ws://127.0.0.1:${PORT}/ws`;
  if (LIVE) return `${BASIS}/${spiel}/ws`;
  return `ws://127.0.0.1:${PRUEFPORT}/ws`;
}

// ---------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

class Schieflage extends Error {}
/** Wie `assert`, nur mit deutschem Text und eigener Klasse. */
const muss = (bedingung, text) => {
  if (!bedingung) throw new Schieflage(text);
};

/**
 * Bremse einhalten: vierzig neue Verbindungen je IP und Minute, je Spiel
 * ein eigener Zaehler (jedes Spiel ist ein eigener Prozess). Fuenf bleiben
 * als Luft fuer echte Menschen, die nebenher spielen.
 */
const verbindungen = new Map();   // spiel -> Zeitstempel
async function warteAufKontingent(spiel) {
  // Gegen die eigene Fassung faellt das weg: die startet vor jedem Test neu
  // und bringt ihre Zaehler damit selbst auf null.
  if (!LIVE && !PORT) return;
  const grenze = 35, fenster = 60_000;
  for (;;) {
    const jetzt = Date.now();
    const liste = (verbindungen.get(spiel) ?? []).filter((t) => jetzt - t < fenster);
    verbindungen.set(spiel, liste);
    if (liste.length < grenze) {
      liste.push(jetzt);
      return;
    }
    const wartet = fenster - (jetzt - liste[0]) + 250;
    process.stdout.write(`      … Bremse: ${Math.ceil(wartet / 1000)} s warten\n`);
    await schlaf(wartet);
  }
}

// ---------------------------------------------------------------------------
// Eine eigene Fassung des Spiels, nur fuer die Probe
// ---------------------------------------------------------------------------

// Warum nicht einfach gegen live? Die Bremse laesst je IP zwoelf neue Raeume
// in zehn Minuten zu, und diese Probe macht rund vierzehn Raeume je Spiel auf.
// Gegen live faellt sie deshalb ab dem zwoelften Test aus dem falschen Grund
// durch - und sie wuerde nebenbei das Kontingent echter Leute aufbrauchen.
//
// Also: eine eigene Fassung auf einem freien Port, die vor **jedem** Test neu
// startet. Das setzt Raum- und Verbindungszaehler zurueck und gibt jedem Test
// einen Dienst, in dem sonst nichts steht. Dass der Weg durch Apache und TLS
// auch stimmt, weisen die `probe.js` je Spiel nach - die laufen gegen live.
//
// `--live` schaltet auf die Live-Fassung um; dann greifen die Bremsen, und das
// ist dort Absicht.

async function portAntwortet(port, ms = 8000) {
  const net = await import("node:net");
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
  constructor(spiel, port, zusatz = {}) {
    this.spiel = spiel;
    this.port = port;
    this.zusatz = zusatz;     // zusaetzliche Umgebung, siehe L17
    this.kind = null;
  }

  async an() {
    const { spawn } = await import("node:child_process");
    this.kind = spawn("/usr/local/bin/deno", [
      "run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "server.js",
    ], {
      cwd: `/var/www/html/${this.spiel}`,
      env: {
        ...process.env, PORT: String(this.port), HOST: "127.0.0.1",
        DENO_DIR: "/tmp/deno-check", ...this.zusatz,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.fehler = "";
    this.kind.stderr.on("data", (d) => { this.fehler += d.toString(); });
    if (!await portAntwortet(this.port)) {
      throw new Schieflage(
        `${this.spiel} kam auf Port ${this.port} nicht hoch:\n${this.fehler.slice(0, 600)}`,
      );
    }
    return this;
  }

  /** Beenden ueber den Prozesshandle - nie ueber `pkill -f`, das traefe
   *  die eigene Sitzung mit (CLAUDE.md, Falle 3). */
  async aus() {
    if (!this.kind) return;
    const k = this.kind;
    this.kind = null;
    await new Promise((r) => {
      k.once("exit", r);
      k.kill("SIGTERM");
      setTimeout(() => { try { k.kill("SIGKILL"); } catch { /* schon weg */ } r(); }, 2500);
    });
    await schlaf(120);
  }
}

// ---------------------------------------------------------------------------
// Ein Klient
// ---------------------------------------------------------------------------

class Klient {
  constructor(spiel, name) {
    this.spiel = spiel;
    this.name = name;
    this.msgs = [];
    this.warter = [];
    this.you = null;
    this.token = null;
    this.code = null;
    this.schluss = null;      // { code, reason }
    this.ws = null;
  }

  async auf() {
    await warteAufKontingent(this.spiel);
    const url = wsUrl(this.spiel);
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "joined") { this.you = m.you; this.token = m.token; this.code = m.code; }
      this.msgs.push({ ...m, _zeit: Date.now() });
      for (const w of this.warter.splice(0)) w();
    });
    this.ws.addEventListener("close", (ev) => {
      this.schluss = { code: ev.code, reason: ev.reason };
      for (const w of this.warter.splice(0)) w();
    });
    await new Promise((ok, weg) => {
      const t = setTimeout(() => weg(new Schieflage(`${url}: Verbindung kam nicht zustande`)), 12_000);
      this.ws.addEventListener("open", () => { clearTimeout(t); ok(); }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(t);
        weg(new Schieflage(`${url}: Verbindung abgelehnt (Bremse? Dienst aus?)`));
      }, { once: true });
    });
    return this;
  }

  schicke(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Roh senden - fuer Muell, den JSON.stringify nicht hergibt. */
  roh(text) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
  }

  marke() { return this.msgs.length; }

  /** Erste Nachricht ab `marke`, auf die `pred` passt. */
  async warte(pred, { ms = 5000, ab = 0, was = "Nachricht" } = {}) {
    const ende = Date.now() + ms;
    for (;;) {
      for (let i = ab; i < this.msgs.length; i++) {
        if (pred(this.msgs[i])) return this.msgs[i];
      }
      const rest = ende - Date.now();
      if (rest <= 0) {
        const gesehen = this.msgs.slice(ab).map((m) => m.t).join(", ") || "nichts";
        throw new Schieflage(
          `${this.name}: ${was} kam nicht innerhalb ${ms} ms (gesehen: ${gesehen})`,
        );
      }
      await Promise.race([
        new Promise((r) => this.warter.push(r)),
        schlaf(Math.min(rest, 200)),
      ]);
    }
  }

  typ(t, o) { return this.warte((m) => m.t === t, { ...o, was: `»${t}«` }); }

  /** Letzte Nachricht eines Typs, falls schon da. */
  letzte(t) {
    for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i];
    return null;
  }

  async zu() {
    try { this.ws?.close(); } catch { /* egal */ }
    await schlaf(60);
  }
}

// ---------------------------------------------------------------------------
// Bausteine, die fast jeder Test braucht
// ---------------------------------------------------------------------------

/** Ein Raum mit einem Host. Privat, damit die Probe keine fremden Listen fuellt. */
async function raumAuf(ctx, name = "Host", { oeffentlich = false } = {}) {
  const c = await ctx.neu(name);
  c.schicke({ t: "create", name, isPublic: oeffentlich });
  await c.typ("joined");
  await c.typ("room");
  return c;
}

/** Weitere Person in einen bestehenden Raum. */
async function dazu(ctx, code, name, token = null) {
  const c = await ctx.neu(name);
  const ab = c.marke();
  c.schicke({ t: "join", code, name, ...(token ? { token } : {}) });
  return { c, ab };
}

/** Wartet, bis der Raum genau `n` Sitze zeigt. */
async function sitze(c, n, ms = 5000) {
  return c.warte((m) => m.t === "room" && m.players.length === n,
    { ms, was: `Raum mit ${n} Sitzen` });
}

/**
 * Eine echte Runde starten: Host plus so viele Gaeste, wie das Spiel
 * mindestens verlangt. `mindestens` hebt das an - Paare laesst mit
 * `MIN_PLAYERS = 1` ausdruecklich eine Partie allein zu, und mit einem
 * einzigen Menschen laesst sich kein Ausfall pruefen.
 */
async function rundeAn(ctx, { mindestens = 1 } = {}) {
  const host = await raumAuf(ctx, "Host");
  const raum = host.letzte("room");
  const min = Math.max(raum.minPlayers ?? (await koennen(ctx.spiel)).min, mindestens);
  const gaeste = [];
  for (let i = 1; i < min; i++) {
    const { c } = await dazu(ctx, host.code, "Gast" + i);
    await c.typ("room");
    gaeste.push(c);
  }
  await sitze(host, min);
  for (const g of gaeste) g.schicke({ t: "ready", value: true });
  // Warten, bis der Host alle als bereit sieht - sonst faellt `start` durch.
  await host.warte(
    (m) => m.t === "room" &&
      m.players.filter((p) => p.ready || p.id === m.hostId).length === min,
    { was: "alle bereit" },
  );
  const ab = host.marke();
  host.schicke({ t: "start" });
  await host.warte((m) => m.t === "room" && m.phase !== "lobby", { ab, was: "Rundenstart" });
  return { host, gaeste, alle: [host, ...gaeste], min };
}

// ---------------------------------------------------------------------------
// Die Tests
// ---------------------------------------------------------------------------

const TESTS = [];
const test = (id, titel, lauf, o = {}) => TESTS.push({ id, titel, lauf, ...o });

test("L01", "Raum aufmachen: joined, token, Code, Host", async (ctx) => {
  const c = await ctx.neu("Alpha");
  c.schicke({ t: "create", name: "Alpha", isPublic: false });
  const j = await c.typ("joined");
  muss(typeof j.you === "string" && j.you.length > 8, "»joined« ohne brauchbare Id");
  muss(typeof j.token === "string" && j.token.length > 8, "»joined« ohne brauchbaren Token");
  muss(/^[A-HJ-NP-Z2-9]{4}$/.test(j.code),
    `Raumcode »${j.code}« passt nicht zum Alphabet (vier Zeichen, kein I/O/0/1)`);
  const r = await c.typ("room");
  muss(r.phase === "lobby", `frischer Raum steht in Phase »${r.phase}«`);
  muss(r.code === j.code, "Code in »room« weicht von »joined« ab");
  muss(r.players.length === 1, `frischer Raum hat ${r.players.length} Sitze`);
  muss(r.hostId === j.you, "der Ersteller ist nicht Host");
  muss(r.players[0].host === true, "der Sitz des Erstellers ist nicht als Host markiert");
  // Die Spiele auf `raum.js` sagen beides zu. Die drei aeltesten schicken
  // nur `maxPlayers` oder gar nichts - ihr Client kennt die Grenzen selbst,
  // deshalb ist das dort kein Fehler, sondern nur eine Notiz.
  const k = await koennen(ctx.spiel);
  if (GRUPPE(ctx.spiel) !== "C") {
    muss(typeof r.maxPlayers === "number" && typeof r.minPlayers === "number",
      "»room« nennt maxPlayers/minPlayers nicht");
  }
  const fehlt = ["minPlayers", "maxPlayers"].filter((f) => typeof r[f] !== "number");
  return `Code ${j.code}, ${k.min}–${k.max} Plätze` +
    (fehlt.length ? `  (Notiz: »room« nennt ${fehlt.join(" und ")} nicht)` : "");
});

test("L02", "Beitreten per Code, klein geschrieben und mit Leerzeichen", async (ctx) => {
  const host = await raumAuf(ctx);
  const schlampig = `  ${host.code.toLowerCase()} `;
  const { c } = await dazu(ctx, schlampig, "Gast");
  const j = await c.typ("joined");
  muss(j.code === host.code, `»${schlampig}« fuehrte nicht in Raum ${host.code}`);
  const r = await sitze(c, 2);
  muss(r.hostId !== j.you, "der Gast wurde Host");
  await sitze(host, 2);
  return "Code wird entschlackt und gross geschrieben";
});

test("L03", "Falscher Code: Meldung, und die Verbindung bleibt brauchbar", async (ctx) => {
  const c = await ctx.neu("Sucher");
  // »IIII« kann es nicht geben: I steht nicht im Code-Alphabet.
  c.schicke({ t: "join", code: "IIII", name: "Sucher" });
  const e = await c.typ("error");
  muss(typeof e.msg === "string" && e.msg.length > 0, "Fehlermeldung ohne Text");
  c.schicke({ t: "create", name: "Sucher", isPublic: false });
  await c.typ("joined", { ms: 4000 });
  return `»${e.msg}«, danach ging Aufmachen weiter`;
});

test("L04", "Raumliste: oeffentlich taucht auf, privat nicht, Umschalten wirkt", async (ctx) => {
  const zuschauer = await ctx.neu("Zuschauer");
  zuschauer.schicke({ t: "browse" });
  await zuschauer.typ("rooms");

  const ab1 = zuschauer.marke();
  const host = await raumAuf(ctx, "Wirt", { oeffentlich: true });
  const drin = await zuschauer.warte(
    (m) => m.t === "rooms" && m.rooms.some((r) => r.code === host.code),
    { ab: ab1, was: `Raum ${host.code} in der Liste` },
  );
  const eintrag = drin.rooms.find((r) => r.code === host.code);
  muss(eintrag.count === 1, `Liste zaehlt ${eintrag.count} statt 1`);
  muss(eintrag.host === "Wirt", `Liste nennt den Wirt »${eintrag.host}«`);
  muss(typeof eintrag.max === "number", "Liste nennt keine Obergrenze");

  const ab2 = zuschauer.marke();
  host.schicke({ t: "settings", isPublic: false });
  await zuschauer.warte(
    (m) => m.t === "rooms" && !m.rooms.some((r) => r.code === host.code),
    { ab: ab2, was: `Raum ${host.code} verschwindet aus der Liste` },
  );
  return "erscheint und verschwindet von selbst, ohne neues browse";
});

test("L05", "Bereit und Start: Sperren greifen, Gast darf nicht starten", async (ctx) => {
  const host = await raumAuf(ctx);
  const raum = host.letzte("room");
  const min = raum.minPlayers ?? (await koennen(ctx.spiel)).min;

  if (min > 1) {
    const ab = host.marke();
    host.schicke({ t: "start" });
    await schlaf(700);
    muss(!host.msgs.slice(ab).some((m) => m.t === "room" && m.phase !== "lobby"),
      `Start ging allein durch, obwohl ${min} Leute noetig sind`);
  }

  const gaeste = [];
  for (let i = 1; i < Math.max(min, 2); i++) {
    const { c } = await dazu(ctx, host.code, "Gast" + i);
    await c.typ("room");
    gaeste.push(c);
  }
  await sitze(host, Math.max(min, 2));

  // Genug Leute, aber noch niemand bereit.
  const ab2 = host.marke();
  host.schicke({ t: "start" });
  await schlaf(700);
  muss(!host.msgs.slice(ab2).some((m) => m.t === "room" && m.phase !== "lobby"),
    "Start ging durch, obwohl niemand bereit war");

  for (const g of gaeste) g.schicke({ t: "ready", value: true });
  await host.warte((m) => m.t === "room" && m.players.every((p) => p.ready || p.id === m.hostId),
    { was: "alle bereit" });

  // Jetzt versucht ein Gast zu starten - das darf nichts tun.
  const ab3 = host.marke();
  gaeste[0].schicke({ t: "start" });
  await schlaf(700);
  muss(!host.msgs.slice(ab3).some((m) => m.t === "room" && m.phase !== "lobby"),
    "ein Gast konnte die Runde starten");

  const ab4 = host.marke();
  host.schicke({ t: "start" });
  await host.warte((m) => m.t === "room" && m.phase !== "lobby", { ab: ab4, was: "Rundenstart" });
  return `drei Sperren halten, Host startet mit ${Math.max(min, 2)}`;
});

test("L06", "Neu laden in der Lobby: ein Sitz, nicht zwei", async (ctx) => {
  const host = await raumAuf(ctx);
  const { c: gast } = await dazu(ctx, host.code, "Gast");
  await gast.typ("joined");
  await sitze(host, 2);
  const token = gast.token;

  await gast.zu();
  // In der Lobby wird der Platz sofort frei - der Host muss das sehen.
  await sitze(host, 1, 6000);

  const { c: zurueck } = await dazu(ctx, host.code, "Gast", token);
  await zurueck.typ("joined");
  const r = await sitze(host, 2, 6000);
  muss(r.players.length === 2,
    `nach der Rueckkehr stehen ${r.players.length} Sitze im Raum`);
  muss(r.players.filter((p) => !p.connected).length === 0,
    "im Raum steht eine Leiche: ein Sitz ohne Verbindung");
  return "Platz wird sofort frei, Rueckkehrer bekommt genau einen neuen";
});

test("L07", "Neu laden IN DER RUNDE: kommt das Spielbild von selbst zurueck?", async (ctx) => {
  const { host, gaeste } = await rundeAn(ctx, { mindestens: 2 });
  const wer = gaeste[0] ?? host;
  const token = wer.token;
  const code = wer.code;
  // Erst abwarten, bis diese Person selbst einen Spielstand hat - `rundeAn`
  // wartet nur auf den Host, und die Nachricht an die Gaeste kann spaeter
  // kommen. Sonst prueft der Test einen Abbruch, den es noch gar nicht gab.
  await wer.warte((m) => m.t === "runde" || (m.t === "room" && m.phase !== "lobby"),
    { ms: 6000, was: "Spielstand vor dem Abbruch" });

  await wer.zu();
  await schlaf(400);

  const t0 = Date.now();
  const { c: zurueck } = await dazu(ctx, code, "Rueckkehrer", token);
  const j = await zurueck.typ("joined");
  muss(j.you === wer.you, "die Rueckkehr bekam eine neue Id - der Platz war weg");
  const r = await zurueck.typ("room");
  muss(r.phase !== "lobby", `nach der Rueckkehr steht die Phase auf »${r.phase}«`);

  // Der Punkt: ohne dass irgendwer etwas tut, muss ein Spielstand kommen.
  // Wie der Spielstand heisst, ist von Spiel zu Spiel verschieden: »runde«
  // bei der Schale, »zug« bei Maexchen, »round« bei Lucky Reflex, »spiel«
  // bei Wortleger. Entscheidend ist nur, dass ueberhaupt einer kommt, ohne
  // dass jemand etwas tut - alles ausser Lobby-Gerede zaehlt.
  const lobbygerede = new Set(["joined", "room", "rooms", "error", "pong"]);
  const runde = await zurueck.warte((m) => !lobbygerede.has(m.t),
    { ms: 8000, ab: 0, was: "Spielstand nach der Rueckkehr" });
  const dauer = runde._zeit - t0;
  muss(dauer < 8000, `Spielstand kam erst nach ${dauer} ms`);
  return `»${runde.t}« nach ${dauer} ms wieder da, ohne Zutun Dritter`;
});

test("L08", "Karenzzeit: 60 s Platz halten, danach raeumen", async (ctx) => {
  const { host, gaeste } = await rundeAn(ctx, { mindestens: 2 });
  const wer = gaeste[0] ?? host;
  const andere = wer === host ? gaeste[0] : host;
  muss(andere, "fuer diesen Test braucht es zwei Leute");

  await wer.zu();
  const weg = await andere.warte(
    (m) => m.t === "room" && m.players.some((p) => p.id === wer.you && !p.connected),
    { ms: 6000, was: "abwesender Sitz bleibt sichtbar stehen" },
  );
  muss(weg.players.length >= 2, "der Platz wurde sofort geraeumt statt gehalten");

  if (!LANG) return "Platz bleibt stehen (Ablauf nach 60 s nur mit --lang)";

  const t0 = Date.now();
  const frei = await andere.warte(
    (m) => m.t === "room" && !m.players.some((p) => p.id === wer.you),
    { ms: 90_000, was: "Platz nach Ablauf der Karenzzeit geraeumt" },
  );
  const s = Math.round((frei._zeit - t0) / 1000);
  muss(s >= 45 && s <= 80, `Karenzzeit war ${s} s statt rund 60 s`);
  return `Platz stand ${s} s, dann geraeumt`;
}, { lang: true });

test("L09", "Host geht - in der Lobby und in der Runde", async (ctx) => {
  // Teil 1: Lobby
  const host = await raumAuf(ctx, "Wirt");
  const { c: gast } = await dazu(ctx, host.code, "Gast");
  await gast.typ("room");
  await sitze(host, 2);
  const gastId = gast.you;
  await host.zu();
  const r = await gast.warte((m) => m.t === "room" && m.hostId === gastId,
    { ms: 6000, was: "Hostrolle wandert in der Lobby" });
  muss(r.players.find((p) => p.id === gastId)?.host, "neuer Host ist nicht markiert");

  // Teil 2: Runde. Geht der Host mitten im Spiel, darf die Rolle nicht
  // sechzig Sekunden bei einem Abwesenden liegen bleiben - sonst kann
  // niemand beenden oder neu anfangen.
  const { host: h2, gaeste } = await rundeAn(ctx, { mindestens: 2 });
  if (!gaeste.length) return "in der Lobby wandert sie; Runde braucht zwei Leute";
  const g2 = gaeste[0];
  await h2.zu();
  const r2 = await g2.warte((m) => m.t === "room" && m.hostId !== h2.you,
    { ms: 8000, was: "Hostrolle wandert auch in der laufenden Runde" });
  muss(r2.hostId === g2.you, `Hostrolle ging an ${r2.hostId} statt an den einzig Anwesenden`);

  // Und der neue Host muss auch wirklich duerfen - sofern das Spiel ein
  // vorzeitiges Ende ueberhaupt kennt.
  if (!(await koennen(ctx.spiel)).kannEnde) {
    return "wandert sofort (das Spiel kennt kein vorzeitiges Ende)";
  }
  const ab = g2.marke();
  g2.schicke({ t: "ende" });
  await g2.warte((m) => m.t === "final" || (m.t === "room" && m.phase === "final"),
    { ab, ms: 6000, was: "der neue Host darf die Runde beenden" });
  return "wandert sofort, und der Nachfolger darf auch beenden";
});

test("L10", "Letzter geht: Raum verschwindet aus der Liste", async (ctx) => {
  const zuschauer = await ctx.neu("Zuschauer");
  zuschauer.schicke({ t: "browse" });
  await zuschauer.typ("rooms");
  const host = await raumAuf(ctx, "Wirt", { oeffentlich: true });
  await zuschauer.warte((m) => m.t === "rooms" && m.rooms.some((r) => r.code === host.code),
    { was: "Raum in der Liste" });
  const ab = zuschauer.marke();
  await host.zu();
  await zuschauer.warte((m) => m.t === "rooms" && !m.rooms.some((r) => r.code === host.code),
    { ab, ms: 6000, was: "leerer Raum verschwindet aus der Liste" });
  return "leerer Raum steht nicht mehr in der Liste";
});

test("L11", "Raum voll: eine Meldung, kein stiller Beitritt", async (ctx) => {
  const host = await raumAuf(ctx);
  const max = host.letzte("room").maxPlayers ?? (await koennen(ctx.spiel)).max;
  if (max >= 12) {
    // Nicht das Spiel ist schuld, sondern die Bremse: zwoelf gleichzeitige
    // Verbindungen je IP sind das Limit, und alle Klienten der Probe kommen
    // von derselben Adresse. Genau diese Enge steht als G01 im Prüfplan -
    // ein Werwolf-Tisch mit zwoelf Leuten an einem WLAN hat null Luft.
    return `uebersprungen: ${max} Plaetze, aber nur 12 Verbindungen je IP erlaubt`;
  }
  const gaeste = [];
  for (let i = 1; i < max; i++) {
    const { c } = await dazu(ctx, host.code, "G" + i);
    await c.typ("joined", { ms: 8000 });
    gaeste.push(c);
  }
  await sitze(host, max, 10_000);
  const { c: zuviel } = await dazu(ctx, host.code, "Zuviel");
  const e = await zuviel.typ("error", { ms: 6000 });
  muss(/voll/i.test(e.msg), `Meldung bei vollem Raum lautet »${e.msg}«`);
  await schlaf(400);
  muss(host.letzte("room").players.length === max,
    "der ueberzaehlige Gast kam trotz Meldung hinein");
  return `${max} Plaetze, der ${max + 1}. bekommt »${e.msg}«`;
});

test("L12", "Runde laeuft schon: kein Beitritt, auch nicht mit erfundenem Token", async (ctx) => {
  const { host } = await rundeAn(ctx);
  const { c: fremd } = await dazu(ctx, host.code, "Spaet");
  const e1 = await fremd.typ("error", { ms: 6000 });
  muss(/l(ae|äu)uft|schon|begonnen/i.test(e1.msg), `Meldung lautet »${e1.msg}«`);

  const { c: faelscher } = await dazu(ctx, host.code, "Faelscher",
    "11111111-2222-3333-4444-555555555555");
  const e2 = await faelscher.typ("error", { ms: 6000 });
  muss(e2.msg, "erfundener Token brachte keine Meldung");
  await schlaf(300);
  muss(!faelscher.you, "erfundener Token brachte einen Platz ein");
  return `»${e1.msg}«, erfundener Token prallt ab`;
});

test("L13", "Zweiter Tab mit demselben Token: wer fliegt, und bleibt es dabei?", async (ctx) => {
  const host = await raumAuf(ctx, "Erst");
  const { c: zweit } = await dazu(ctx, host.code, "Erst", host.token);
  await zweit.typ("joined", { ms: 6000 });
  await host.warte(() => host.schluss !== null, { ms: 6000, was: "die alte Verbindung fliegt" })
    .catch(() => {});
  muss(host.schluss, "die alte Verbindung blieb offen - zwei Tabs auf einem Platz");
  muss(host.schluss.code === 4001,
    `alte Verbindung wurde mit ${host.schluss.code} geschlossen, erwartet 4001`);
  const r = await zweit.typ("room", { ms: 4000 });
  muss(r.players.length === 1, `nach dem Tabwechsel stehen ${r.players.length} Sitze im Raum`);
  return `alte Verbindung mit ${host.schluss.code} beendet, ein Sitz bleibt`;
});

test("L14", "Verlassen und wiederkommen", async (ctx) => {
  const host = await raumAuf(ctx);
  const { c: gast } = await dazu(ctx, host.code, "Gast");
  await gast.typ("joined");
  await sitze(host, 2);

  gast.schicke({ t: "leave" });
  await sitze(host, 1, 6000);

  // Die Verbindung bleibt offen - der Client zeigt danach die Startseite.
  const ab = gast.marke();
  gast.schicke({ t: "browse" });
  await gast.warte((m) => m.t === "rooms", { ab, ms: 5000, was: "Raumliste nach dem Verlassen" });

  const ab2 = gast.marke();
  gast.schicke({ t: "join", code: host.code, name: "Gast" });
  await gast.warte((m) => m.t === "joined", { ab: ab2, ms: 5000, was: "erneuter Beitritt" });
  await sitze(host, 2, 6000);
  return "leave → Liste → wieder hinein, alles auf derselben Verbindung";
});

test("L15", "Muell und Unfug: nichts davon darf den Dienst umbringen", async (ctx) => {
  const host = await raumAuf(ctx);
  const { c: gast } = await dazu(ctx, host.code, "Gast");
  await gast.typ("joined");
  await sitze(host, 2);

  gast.roh("das ist kein JSON");
  gast.roh("[]");
  gast.roh("null");
  gast.schicke({});
  gast.schicke({ t: 123 });
  gast.schicke({ t: "gibtsnichtunderfindeichgerade" });
  gast.schicke({ t: "join", code: null });
  gast.schicke({ t: "join", code: host.code });        // zweimal in denselben Raum
  gast.schicke({ t: "ready" });                        // ohne value
  gast.schicke({ t: "settings", isPublic: "vielleicht" });
  gast.schicke({ t: "name", name: { boese: true } });
  gast.schicke({ t: "start" });                        // Gast, kein Host
  gast.schicke({ t: "ende" });
  gast.schicke({ t: "again" });
  // Zuege mit Unsinn - die Namen decken alle Spiele ab, unbekannte fallen durch.
  for (const t of ["auf", "tipp", "legen", "ziehen", "stimme", "bieten", "press",
                   "dir", "karte", "wahl", "drehen", "schieben", "gesagt"]) {
    gast.schicke({ t, i: -1 });
    gast.schicke({ t, i: NaN });
    gast.schicke({ t, i: 99999 });
    gast.schicke({ t, index: "keine Zahl" });
  }
  gast.schicke({ t: "name", name: "x".repeat(200_000) });

  await schlaf(1200);
  // Lebt der Dienst noch, und steht der Raum noch richtig da?
  const pruef = await ctx.neu("Pruefer");
  pruef.schicke({ t: "join", code: host.code, name: "Pruefer" });
  await pruef.typ("joined", { ms: 6000 });
  const r = await sitze(host, 3, 6000);
  muss(r.phase === "lobby", `der Muell hat die Phase auf »${r.phase}« gestellt`);
  const lang = r.players.find((p) => p.name.length > 12);
  muss(!lang, `ein Name mit ${lang?.name.length} Zeichen steht im Raum`);
  return `${17 + 13 * 4} Unsinnsnachrichten, Raum und Dienst unbeeindruckt`;
});

test("L16", "Namen: leer, lang, Steuerzeichen, Emoji", async (ctx) => {
  const host = await raumAuf(ctx);
  const faelle = [
    // Was bei leerem Namen passieren soll, legt kein Spiel fest: die einen
    // setzen »Spieler«, die anderen behalten den alten. Beides ist in Ordnung
    // - der Client schickt ohnehin nie einen leeren Namen. Gefordert ist nur,
    // dass kein namenloser Sitz entsteht.
    { rein: "", erwartet: (n) => n.length > 0, was: "leerer Name bleibt nicht leer" },
    { rein: "   ", erwartet: (n) => n.length > 0, was: "nur Leerzeichen bleibt nicht leer" },
    { rein: "Anna\nBert", erwartet: (n) => !/[\u0000-\u001f\u007f]/.test(n), was: "Zeilenumbruch raus" },
    { rein: "A".repeat(40), erwartet: (n) => n.length <= 12, was: "auf 12 Zeichen gekuerzt" },
    { rein: "\u0007Pe\u007fter", erwartet: (n) => n === "Peter", was: "Steuerzeichen raus" },
    { rein: "  Klaus  ", erwartet: (n) => n === "Klaus", was: "Rand abgeschnitten" },
  ];
  // Manche Spiele schicken nach einem Umbenennen zwei `room`-Nachrichten
  // (Raumzustand und Nachzug der Runde). Wer auf "die naechste" wartet,
  // erwischt das Echo der vorigen Zeile. Deshalb: setzen lassen, dann die
  // letzte nehmen.
  const umbenennen = async (rein) => {
    const ab = host.marke();
    host.schicke({ t: "name", name: rein });
    await host.warte((m) => m.t === "room", { ab, ms: 4000, was: "Raum nach Umbenennen" });
    await schlaf(250);
    return host.letzte("room").players.find((p) => p.id === host.you).name;
  };

  const notizen = [];
  for (const f of faelle) {
    const n = await umbenennen(f.rein);
    muss(f.erwartet(n), `${f.was}: bekam »${n}«`);
    notizen.push(f.was);
  }

  // Emoji: `slice(0,12)` schneidet nach Code-Einheiten. Steht an Position 12
  // die Haelfte eines Paares, entsteht ein kaputtes Zeichen.
  for (const rein of ["ab😀😀😀😀😀😀", "😀".repeat(9), "Jörg 😀😀😀😀😀", "Anna 🦊🦊🦊🦊"]) {
    const n = await umbenennen(rein);
    const kaputt = [...n].some((z) => {
      const c = z.codePointAt(0);
      return c >= 0xd800 && c <= 0xdfff;
    });
    muss(!kaputt, `»${rein}« wurde zu »${n}« - da steht eine halbe Emoji drin`);
  }
  notizen.push("Emoji bleiben ganz");
  return notizen.join(", ");
});

// Der Fall, der Bugreport 4 zugrunde lag - und den kein anderer Test trifft:
// nicht die Verbindung, die *zugeht*, sondern die, die offen bleibt und
// niemandem mehr gehoert. Auf dem Handy ist das der Normalfall: wer wegwischt
// oder den Bildschirm sperrt, schickt kein FIN. Sitzt so ein Geist auf dem
// Hostplatz, wartet die ganze Lobby auf einen Knopf, den niemand mehr druecken
// kann.
//
// Der Dienst laeuft fuer diesen Test mit `GEIST_MS=3000` statt 65 s - deshalb
// nur gegen eine eigene Fassung. Der Gast tickt im Sekundentakt weiter und
// weist damit die andere Haelfte nach: wer sich meldet, bleibt sitzen.
test("L17", "Geist auf dem Hostplatz: offener Socket, der stumm bleibt", async (ctx) => {
  const host = await raumAuf(ctx, "Geist");
  const { c: gast } = await dazu(ctx, host.code, "Gast");
  await sitze(gast, 2);
  muss(gast.letzte("room").hostId === host.you, "der Geist ist gar nicht Host");

  const takt = setInterval(() => gast.schicke({ t: "ping", c: Date.now() }), 1000);
  let r;
  try {
    r = await gast.warte(
      (m) => m.t === "room" && !m.players.some((p) => p.id === host.you),
      { ms: 20_000, was: "der stumme Platz wird geraeumt" },
    );
  } finally {
    clearInterval(takt);
  }
  muss(r.hostId === gast.you,
    `Platz geraeumt, aber der Hostzeiger steht auf ${r.hostId} statt auf dem Gast`);
  muss(r.players.some((p) => p.id === gast.you),
    "der Gast wurde mit abgeraeumt, obwohl er die ganze Zeit gepingt hat");
  muss(!gast.schluss, `dem Gast wurde die Verbindung gekappt (${gast.schluss?.code})`);
  // Der Schlussrahmen laeuft dem Raumzustand hinterher - erst zusehen lassen.
  await schlaf(600);
  muss(host.schluss, "der Geist haelt seinen Socket weiter offen");
  return `stummer Host nach ~3 s weg (Schluss ${host.schluss.code}), ` +
    "Host wandert zum Gast, wer pingt bleibt sitzen";
}, { env: { GEIST_MS: "3000" } });

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------

async function laufSpiel(spiel) {
  const offen = [];
  const ctx = {
    spiel,
    neu: async (name) => {
      const c = new Klient(spiel, name);
      offen.push(c);
      await c.auf();
      return c;
    },
  };

  const ergebnisse = [];
  const gruppe = GRUPPE(spiel);
  const eigen = !LIVE && !PORT;
  console.log(`\n━━ ${spiel}  (Gruppe ${gruppe})  ${wsUrl(spiel)}` +
    (eigen ? "  [eigene Fassung]" : "  [live]"));

  let dienst = null;
  for (const t of TESTS) {
    if (NUR_TEST && t.id !== NUR_TEST) continue;
    const t0 = Date.now();
    try {
      // Frischer Dienst je Test: keine Raeume von vorher, Bremszaehler auf
      // null, und ein Absturz im vorigen Test reisst den naechsten nicht mit.
      if (eigen) {
        await dienst?.aus();
        dienst = await new Dienst(spiel, PRUEFPORT, t.env ?? {}).an();
      } else if (t.env) {
        // L17 braucht eine verkuerzte Geisterfrist. Gegen live gibt es die
        // nicht - dort dauerte der Test 80 s und liefe gegen echte Raeume.
        console.log(`  – ${t.id} ${t.titel}\n      nur gegen eine eigene Fassung`);
        continue;
      }
      const notiz = await t.lauf(ctx);
      const ms = Date.now() - t0;
      console.log(`  ✓ ${t.id} ${t.titel}\n      ${notiz}  (${ms} ms)`);
      ergebnisse.push({ id: t.id, ok: true, notiz });
    } catch (err) {
      const ms = Date.now() - t0;
      const text = err instanceof Schieflage ? err.message : `${err.name}: ${err.message}`;
      console.log(`  ✗ ${t.id} ${t.titel}\n      ${text}  (${ms} ms)`);
      ergebnisse.push({ id: t.id, ok: false, notiz: text });
    }
    // Nach jedem Test alles schliessen: sonst laeuft die Zahl gleichzeitiger
    // Verbindungen gegen die Bremse, und der naechste Test faellt aus dem
    // falschen Grund durch.
    for (const c of offen.splice(0)) await c.zu();
    await schlaf(120);
  }
  for (const c of offen.splice(0)) await c.zu();

  // Ist der Dienst ueber die ganze Runde am Leben geblieben? Ein Absturz in
  // L15 faellt sonst nirgends auf - der naechste Test startet ja neu.
  if (eigen && dienst) {
    const lebt = dienst.kind && dienst.kind.exitCode === null;
    if (!lebt) {
      ergebnisse.push({
        id: "L99", ok: false,
        notiz: `der Dienst ist unterwegs gestorben:\n${(dienst.fehler ?? "").slice(0, 600)}`,
      });
      console.log(`  ✗ L99 Dienst lebt noch\n      abgestuerzt`);
    }
    await dienst.aus();
  }
  return ergebnisse;
}

async function main() {
  const liste = NUR ? [NUR] : SPIELE;
  const alles = new Map();
  for (const spiel of liste) {
    try {
      alles.set(spiel, await laufSpiel(spiel));
    } catch (err) {
      console.log(`\n━━ ${spiel}: Lauf abgebrochen - ${err.message}`);
      alles.set(spiel, [{ id: "--", ok: false, notiz: err.message }]);
    }
  }

  console.log("\n\n═══ Zusammenfassung ═══════════════════════════════════════");
  let fehler = 0;
  for (const [spiel, e] of alles) {
    const schlecht = e.filter((x) => !x.ok);
    fehler += schlecht.length;
    const zeichen = schlecht.length ? "✗" : "✓";
    console.log(`${zeichen} ${spiel.padEnd(12)} ${e.length - schlecht.length}/${e.length}` +
      (schlecht.length ? `   offen: ${schlecht.map((x) => x.id).join(", ")}` : ""));
  }
  console.log(fehler ? `\n${fehler} Test(s) nicht bestanden.` : "\nAlles gruen.");
  process.exit(fehler ? 1 : 0);
}

main();
