// ══════════════ Gemeinsame Raumverwaltung ══════════════ Anfang ═══════════
// ERZEUGT - NICHT HIER AENDERN. Quelle: /var/www/html/gemeinsam/raum.js
// Aendern, dann `node werkzeug/verteilen.mjs --nur <spiel>` - Spiel fuer
// Spiel, mit `deno task probe` dazwischen. Kein Build-Schritt, keine
// Abhaengigkeit: jedes Spiel behaelt seine eigene vollstaendige Kopie.
//
// Was hier drin ist, war in jedem Server-Spiel wortgleich noch einmal
// abgetippt: Raumcode, Host, Bereit-Zustand, Karenzzeit beim Verbindungs-
// abbruch, oeffentliche Raumliste, Senden an einen oder alle.
//
// Was NICHT hier drin ist: die Runde. Alles, was ein Spiel zu einem Spiel
// macht, bleibt in seinem server.js. Dieses Modul kennt keine Runden, keine
// Punkte und keine Karten - es reicht dafuer Haken durch.
// ──────────────────────────────────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Fristen. Alle in Millisekunden, alle ueber die Umgebung verkuerzbar - nicht
 * fuer den Betrieb, sondern damit `werkzeug/lobbyprobe.mjs` einen Fall in
 * Sekunden statt in Minuten pruefen kann. Ohne die Variable (oder ohne
 * `--allow-env`) gilt die Vorgabe.
 *
 * Die Vorgaben sind seit dem 08.09.2026 **grosszuegig**, und das ist der Kern
 * der Sache: wer sein Handy weglegt, den Bildschirm sperrt, kurz in eine
 * andere App schaut oder durch ein Funkloch faehrt, ist der Normalfall und
 * nicht die Ausnahme. Jedes Mal, wenn so jemand als *neuer* Spieler zurueck
 * kam, spann der ganze Tisch: Platz weg, Hostzeichen woanders, Blatt futsch.
 * Und weil niemand wusste, ob er noch drin ist oder nicht, hat auch niemand
 * mehr sicher weiterspielen koennen.
 *
 * Deshalb gilt jetzt: **endgueltig geht nur, wer selbst auf „Verlassen"
 * tippt.** Alles andere ist eine Pause, und eine Pause kostet den Platz nicht.
 */
const FRISTEN = {
  /** Leerer Raum wird abgeraeumt. */
  RAUM_MS: ["RAUM_MS", 30 * 60_000],
  /** So lange bleibt ein Platz in der laufenden Runde reserviert. */
  SITZ_MS: ["SITZ_MS", 20 * 60_000],
  /** Dasselbe im Warteraum - kuerzer, weil ein Platz dort jemanden aussperrt. */
  LOBBY_MS: ["LOBBY_MS", 5 * 60_000],
  /** So lange behaelt ein abwesender Host sein Zeichen. */
  HOST_MS: ["HOST_MS", 45_000],
  /**
   * So lange darf ein Socket stumm bleiben, bevor die Geisterwache ihn
   * abraeumt. Der Client meldet sich alle 20 s; das sind neun ausgefallene
   * Pings, bevor jemand als weg gilt. Vorher waren es 65 s - zwei Pings - und
   * genau das hat auf mobilen Netzen staendig Unschuldige getroffen.
   */
  GEIST_MS: ["GEIST_MS", 180_000],
};

function frist(name) {
  const [variable, vorgabe] = FRISTEN[name];
  try {
    const n = Number(Deno.env.get(variable));
    if (Number.isFinite(n) && n >= 200) return n;
  } catch { /* ohne --allow-env: dann eben die Vorgabe */ }
  return vorgabe;
}

/** Einmal anlegen, nicht bei jedem Namen neu - das Ding ist teuer. */
const ZEICHEN = new Intl.Segmenter("de", { granularity: "grapheme" });

export const token = () => crypto.randomUUID();

export function cleanName(raw) {
  // Steuerzeichen raus, sonst zerlegt ein Zeilenumbruch im Namen das Layout.
  // Die Regex steht bewusst mit \u-Escapes da - als rohe Zeichen geschrieben
  // landen echte Steuerzeichen in dieser Datei.
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  // Nach *Zeichen* kuerzen, nicht nach Code-Einheiten. `s.slice(0, 12)` zaehlt
  // UTF-16-Einheiten, und ein Emoji besteht aus zweien. "Anna" plus vier
  // Fuechsen ist damit ein halbes Zeichen zu lang: abgeschnitten wurde
  // mitten im vierten Fuchs, und im Raum stand ein Ersatzzeichen. Die Namen
  // in der Avatarleiste sind genau solche - der Fall ist nicht konstruiert.
  // `Intl.Segmenter` fasst auch zusammengesetzte Emoji (Familien,
  // Hautfarben, Flaggen) richtig als ein Zeichen auf.
  //
  // Die zweite Grenze ist die wichtigere: zwoelf *Zeichen* koennen beliebig
  // lang werden, wenn jemand Kombinationszeichen stapelt. Deshalb wird bei
  // 48 Code-Einheiten abgebrochen - und zwar zwischen zwei Zeichen, nie
  // mittendrin, sonst waere der Fehler nur verschoben.
  let kurz = "";
  for (const z of [...ZEICHEN.segment(s)].slice(0, 12)) {
    if (kurz.length + z.segment.length > 48) break;
    kurz += z.segment;
  }
  return kurz || "Spieler";
}

export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Legt die Raumverwaltung fuer ein Spiel an.
 *
 * Pflicht sind nur `maxPlayers`, `minPlayers` und `einstellungen`. Alle Haken
 * sind freiwillig; wer keinen angibt, bekommt das Verhalten von „Wer am
 * ehesten" - dem Spiel, aus dem dieser Code stammt.
 *
 * @param {object} o
 * @param {number} o.maxPlayers        obere Grenze, gilt auch fuer die Raumliste
 * @param {number} o.minPlayers        untere Grenze, geht in roomState mit
 * @param {object} o.einstellungen     Vorgabe je Raum (wird flach kopiert)
 * Die fuenf Fristen haben seit dem 08.09.2026 grosszuegige Vorgaben (siehe
 * `FRISTEN` oben) und muessen von keinem Spiel mehr gesetzt werden. Wer sie
 * doch angibt, sollte einen Grund haben, der im Spiel steht - kuerzer machen
 * heisst hier immer: jemanden aus einer Runde werfen, in der er noch sitzt.
 *
 * @param {number} [o.roomIdleMs]      leerer Raum wird danach abgeraeumt
 * @param {number} [o.seatGraceMs]     so lange bleibt ein Platz nach Abbruch
 * @param {number} [o.lobbyGraceMs]    dasselbe, aber im Warteraum
 * @param {number} [o.hostGraceMs]     so lange behaelt ein abwesender Host sein
 *                                     Zeichen, bevor es weiterwandert
 * @param {number} [o.geistMs]         so lange darf ein Socket stumm bleiben
 * @param {() => object} [o.raumfelder]        zusaetzliche Felder je Raum
 * @param {() => object} [o.spielerfelder]     zusaetzliche Felder je Spieler
 * @param {(room) => object} [o.zustandZusatz] zusaetzliche Felder in roomState
 * @param {(room) => object} [o.listeneintrag] zusaetzliche Felder in der Liste
 * @param {(room, player) => void} [o.beimBeitritt]  nach dem Verbinden
 * @param {(room, player) => void} [o.beimVerlassen] Abbruch, vor pushState
 * @param {(room, player) => void} [o.nachVerlassen] Abbruch, nach pushState
 * @param {(room, id) => void} [o.beimPlatzfrei]     Platz ist endgueltig weg
 * @param {(room) => void} [o.zurueckZurLobby]       letzte Person ist raus
 */
export function raumverwaltung({
  maxPlayers,
  minPlayers,
  einstellungen,
  roomIdleMs = frist("RAUM_MS"),
  seatGraceMs = frist("SITZ_MS"),
  lobbyGraceMs = frist("LOBBY_MS"),
  hostGraceMs = frist("HOST_MS"),
  geistMs = frist("GEIST_MS"),
  raumfelder = () => ({}),
  spielerfelder = () => ({}),
  zustandZusatz = () => ({}),
  listeneintrag = () => ({}),
  beimBeitritt = () => {},
  beimVerlassen = () => {},
  nachVerlassen = () => {},
  beimPlatzfrei = () => {},
  zurueckZurLobby = () => {},
}) {
  /** code -> Raum */
  const rooms = new Map();
  /** Sockets, die noch in keinem Raum sind und die Liste sehen wollen. */
  const browsing = new Set();

  function newCode() {
    for (let i = 0; i < 500; i++) {
      let c = "";
      for (let k = 0; k < 4; k++) {
        c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!rooms.has(c)) return c;
    }
    return "R" + Date.now().toString(36).slice(-3).toUpperCase();
  }

  function createRoom(isPublic) {
    const room = {
      code: newCode(),
      isPublic: !!isPublic,
      phase: "lobby",
      hostId: null,
      players: new Map(),
      settings: { ...einstellungen },
      rundeNr: 0,
      aktuell: null,
      timers: new Set(),
      idleTimer: null,
      hostTimer: null,
      lastActivity: Date.now(),
      ...raumfelder(),
    };
    rooms.set(room.code, room);
    return room;
  }

  function scheduleIdleClose(room) {
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => {
      if (room.players.size === 0) destroyRoom(room);
    }, roomIdleMs);
  }

  function cancelIdleClose(room) {
    if (room.idleTimer) { clearTimeout(room.idleTimer); room.idleTimer = null; }
  }

  function clearTimers(room) {
    for (const id of room.timers) clearTimeout(id);
    room.timers.clear();
  }

  function destroyRoom(room) {
    clearTimers(room);
    cancelIdleClose(room);
    cancelHostWacht(room);
    for (const p of room.players.values()) {
      if (p.dropTimer) clearTimeout(p.dropTimer);
    }
    rooms.delete(room.code);
    pushRoomList();
  }

  function cancelHostWacht(room) {
    if (room.hostTimer) { clearTimeout(room.hostTimer); room.hostTimer = null; }
  }

  /**
   * Der Host ist weg, hat aber noch einen Platz. Sein Zeichen wandert erst nach
   * `hostGraceMs` weiter - vorher gilt er als jemand, der kurz aufs Klo ist.
   * Ist er vorher zurueck, hat der Tisch nichts gemerkt.
   *
   * Ohne diese Uhr sprang das Zeichen bei jedem gesperrten Bildschirm, und wer
   * zurueckkam, fand seine Runde in fremder Hand.
   */
  function hostWacht(room) {
    if (hostGraceMs <= 0 || room.hostTimer) return;
    room.hostTimer = setTimeout(() => {
      room.hostTimer = null;
      if (room.players.get(room.hostId)?.connected) return;
      const naechster = anwesende(room)[0];
      // Niemand da, der uebernehmen koennte: das Zeichen bleibt liegen, wo es
      // ist. Der Naechste, der hereinkommt, startet die Uhr erneut.
      if (!naechster) return;
      room.hostId = naechster.id;
      pushState(room);
      pushRoomList();
    }, hostGraceMs);
  }

  function ensureHost(room) {
    const current = room.players.get(room.hostId);
    if (current?.connected) { cancelHostWacht(room); return; }
    // Mit Hostgnade behaelt ein nur abwesender Host sein Zeichen, solange sein
    // Platz steht; erst die Uhr oben gibt es weiter. Ohne Gnade (Vorgabe) geht
    // es sofort an den Naechsten - so war es hier immer.
    if (hostGraceMs > 0 && current) { hostWacht(room); return; }
    const all = [...room.players.values()];
    const next = all.find((p) => p.connected) ?? all[0];
    room.hostId = next ? next.id : null;
    cancelHostWacht(room);
  }

  const anwesende = (room) =>
    [...room.players.values()].filter((p) => p.connected);

  // -------------------------------------------------------------------------
  // Senden
  // -------------------------------------------------------------------------

  function send(player, msg) {
    const ws = player.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch { /* Verbindung stirbt gleich sowieso */ }
    }
  }

  function raw(ws, msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch { /* egal */ }
    }
  }

  function broadcast(room, msg) {
    for (const p of room.players.values()) send(p, msg);
  }

  function publicPlayers(room) {
    return [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      punkte: p.punkte,
      ready: p.ready,
      connected: p.connected,
      host: p.id === room.hostId,
    }));
  }

  function roomState(room) {
    return {
      t: "room",
      code: room.code,
      isPublic: room.isPublic,
      phase: room.phase,
      hostId: room.hostId,
      settings: room.settings,
      players: publicPlayers(room),
      rundeNr: room.rundeNr,
      maxPlayers,
      minPlayers,
      ...zustandZusatz(room),
    };
  }

  function pushState(room) {
    broadcast(room, roomState(room));
    if (room.isPublic) pushRoomList();
  }

  function roomList() {
    return [...rooms.values()]
      .map((r) => ({ room: r, count: anwesende(r).length }))
      .filter(({ room, count }) =>
        room.isPublic && room.phase === "lobby" &&
        count > 0 && room.players.size < maxPlayers
      )
      .map(({ room, count }) => ({
        code: room.code,
        host: room.players.get(room.hostId)?.name ?? "?",
        count,
        max: maxPlayers,
        ...listeneintrag(room),
      }))
      .sort((a, b) => b.count - a.count);
  }

  function pushRoomList() {
    const msg = { t: "rooms", rooms: roomList() };
    for (const ws of browsing) raw(ws, msg);
  }

  // -------------------------------------------------------------------------
  // Kommen und Gehen
  // -------------------------------------------------------------------------

  function makePlayer(name, ready) {
    return {
      id: token(),
      token: token(),
      name: cleanName(name),
      ws: null,
      dropTimer: null,
      punkte: 0,
      ready,
      connected: true,
      // Wann zuletzt etwas von dieser Verbindung kam. `statisch.js` stempelt
      // bei jeder Nachricht; der Client meldet sich alle 25 s mit `ping`,
      // auch wenn niemand etwas tut. Siehe Geisterwache weiter unten.
      lastSeen: Date.now(),
      ...spielerfelder(),
    };
  }

  function attach(ws, room, player) {
    browsing.delete(ws);
    cancelIdleClose(room);
    if (player.dropTimer) { clearTimeout(player.dropTimer); player.dropTimer = null; }
    ws._room = room;
    ws._player = player;
    player.ws = ws;
    player.connected = true;
    player.lastSeen = Date.now();
    ensureHost(room);
    send(player, {
      t: "joined",
      you: player.id,
      token: player.token,
      code: room.code,
    });
    send(player, roomState(room));
    beimBeitritt(room, player);
  }

  /**
   * Verbindung weg - aber nicht unbedingt der Mensch.
   *
   * Die Unterscheidung ist der ganze Punkt. Ein geschlossener Socket heisst
   * auf dem Handy fast nie „ich hoere auf": er heisst gesperrter Bildschirm,
   * gewechseltes Netz, eine Nachricht beantwortet, ein Tunnel. Deshalb bleibt
   * der Platz stehen - `seatGraceMs` lang in der Runde, `lobbyGraceMs` lang im
   * Warteraum - und wer zurueckkommt, setzt sich auf denselben.
   *
   * `immediate` setzt nur der Verlassenknopf (`t: "leave"`). Das ist die eine
   * Stelle, an der jemand *gesagt* hat, dass er geht.
   */
  function dropPlayer(ws, { immediate = false } = {}) {
    const room = ws._room;
    const player = ws._player;
    browsing.delete(ws);
    if (!room || !player) return;
    ws._room = null;
    ws._player = null;
    verlasse(room, player, immediate);
  }

  function verlasse(room, player, immediate) {
    player.connected = false;
    player.ws = null;
    // `ready` bleibt stehen, solange der Platz steht. Wer im Warteraum kurz
    // das Netz verliert, hat sich deshalb nicht anders entschieden - musste
    // aber frueher nach der Rueckkehr noch einmal auf „Bereit" tippen, und
    // bis dahin war der Startknopf des Hosts gesperrt. Beim endgueltigen
    // Abgang faellt es ohnehin mit dem Platz weg.
    if (immediate) player.ready = false;

    const gnade = room.phase === "lobby" ? lobbyGraceMs : seatGraceMs;
    if (immediate || gnade <= 0) {
      releaseSeat(room, player.id);
      return;
    }

    if (player.dropTimer) clearTimeout(player.dropTimer);
    player.dropTimer = setTimeout(() => releaseSeat(room, player.id), gnade);

    ensureHost(room);
    // Zwei Haken, und die Reihenfolge ist Absicht: erst den Zustand richtig
    // stellen (die Stimme der Person zaehlt nicht mehr mit), dann den neuen
    // Raumzustand schicken, dann die Runde nachziehen - denn die kann sich
    // durch den Abgang bereits aufloesen und schickt dann selbst.
    beimVerlassen(room, player);
    pushState(room);
    nachVerlassen(room, player);
    pushRoomList();
  }

  function releaseSeat(room, id) {
    const player = room.players.get(id);
    if (!player) return;
    if (player.dropTimer) { clearTimeout(player.dropTimer); player.dropTimer = null; }
    room.players.delete(id);
    ensureHost(room);

    if (room.players.size === 0) {
      cancelHostWacht(room);
      zurueckZurLobby(room);
      scheduleIdleClose(room);
      pushRoomList();
      return;
    }

    beimPlatzfrei(room, id);

    pushState(room);
    pushRoomList();
  }

  /**
   * Die Geisterwache.
   *
   * Ein Socket, der offen aussieht und keiner mehr ist, ist der Normalfall auf
   * dem Handy: wer wegwischt, den Bildschirm sperrt oder den Tab schliesst,
   * schickt kein FIN - der Server sieht bis zum TCP-Timeout einen anwesenden
   * Spieler. Steht dieser Geist auf dem Hostplatz, wartet die ganze Lobby auf
   * einen Startknopf, den niemand mehr druecken kann. Genau das war Bugreport 4
   * (Snake) und der Grund, warum die Runde nie losging.
   *
   * `connected` allein ist deshalb kein Nachweis. Der Client meldet sich alle
   * 20 Sekunden mit `ping`, auch wenn niemand etwas tut; `statisch.js` stempelt
   * jede eingehende Nachricht auf `lastSeen`.
   *
   * **Was die Wache tut und was nicht** - das ist die Aenderung vom 08.09.2026
   * und der Grund, warum das Ganze jetzt stabil ist:
   *
   *   - Sie stellt *nur* fest, dass eine Verbindung tot ist. Sie wirft
   *     niemanden aus dem Raum. Der Platz geht in dieselbe Karenzzeit wie bei
   *     einem sauber geschlossenen Socket - `verlasse(..., false)`.
   *   - Sie laesst dafuer viel Zeit: 180 s statt der frueheren 65 s. Das sind
   *     neun ausgefallene Pings. Mit 65 s reichten zwei, und zwei ausgefallene
   *     Pings hat jedes Mobilfunknetz mehrmals am Abend.
   *   - Ein Socket, der schon zu ist, wird nicht noch einmal geschlossen; das
   *     `close(4002)` ist nur dazu da, dem Client zu sagen, dass er neu
   *     verbinden soll, statt in eine Leitung zu reden, die keine mehr ist.
   *
   * Wichtig bleibt die Reihenfolge der Fristen: `geistMs` steht unter
   * `seatGraceMs` und `lobbyGraceMs` - erst gilt einer als weg, *dann* laeuft
   * seine Karenzzeit. Andersherum verloere ein kurz gestoerter Client seinen
   * Platz, bevor er ueberhaupt als abwesend gilt.
   */
  function geisterPruefen(jetzt = Date.now()) {
    let gefunden = 0;
    for (const room of [...rooms.values()]) {
      for (const player of [...room.players.values()]) {
        if (!player.connected) continue;
        if (jetzt - (player.lastSeen ?? jetzt) <= geistMs) continue;
        gefunden++;
        const ws = player.ws;
        if (ws) {
          ws._room = null;
          ws._player = null;
          browsing.delete(ws);
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.close(4002, "stumm"); } catch { /* war ja schon tot */ }
          }
        }
        // Kein `immediate`: ein Geist ist kein Mensch, der „Verlassen" getippt
        // hat. Sein Platz steht weiter, bis die Karenzzeit ihn raeumt.
        verlasse(room, player, false);
      }
    }
    return gefunden;
  }

  // Viertelstuendlich im Verhaeltnis zur Frist, mindestens alle fuenf Sekunden:
  // die Wache soll nicht selbst zur Verzoegerung werden, wenn `geistMs` fuer
  // eine Probe auf Sekunden heruntergesetzt ist.
  const geisterUhr = setInterval(
    () => geisterPruefen(),
    Math.max(5_000, Math.floor(geistMs / 4)),
  );

  /**
   * Sicherheitsnetz gegen liegengebliebene Raeume - etwa wenn ein Timer beim
   * Neustart des Dienstes verlorenging.
   *
   * Es darf niemandem den Platz wegnehmen, deshalb die grosszuegige Grenze:
   * erst wenn selbst ein reservierter Platz laengst abgelaufen waere, ist der
   * Raum wirklich tot. Frueher standen hier zehn Minuten - weniger als die
   * Karenzzeit, das haette Plaetze geraeumt, die noch stehen sollten.
   */
  const RAUM_TOT_MS = roomIdleMs + seatGraceMs;

  function starteAufraeumen(intervall = 60_000) {
    return setInterval(() => {
      const now = Date.now();
      for (const room of [...rooms.values()]) {
        if (anwesende(room).length) continue;
        const zuletzt = Math.max(
          room.lastActivity ?? 0,
          ...[...room.players.values()].map((p) => p.lastSeen ?? 0),
        );
        if (now - zuletzt > RAUM_TOT_MS) destroyRoom(room);
      }
    }, intervall);
  }

  return {
    rooms, browsing, maxPlayers, minPlayers,
    // Die tatsaechlich geltenden Fristen - Vorgabe, Umgebung oder was das
    // Spiel uebergeben hat. Wer im `server.js` selbst eine Karenzuhr stellt
    // (etwa um beim Rundenstart von der kurzen auf die lange umzuhaengen),
    // nimmt den Wert von hier statt eine eigene Zahl zu tippen.
    fristen: { roomIdleMs, seatGraceMs, lobbyGraceMs, hostGraceMs, geistMs },
    newCode, createRoom, destroyRoom,
    scheduleIdleClose, cancelIdleClose, clearTimers,
    ensureHost, hostWacht, cancelHostWacht, anwesende,
    send, raw, broadcast,
    publicPlayers, roomState, pushState, roomList, pushRoomList,
    makePlayer, attach, dropPlayer, releaseSeat,
    starteAufraeumen, geisterPruefen, geisterUhr,
  };
}

// ══════════════ Gemeinsame Raumverwaltung ══════════════ Ende ═════════════
