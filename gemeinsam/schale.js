// ══════════════ Gemeinsame Client-Schale ══════════════ Anfang ═══════════
// ERZEUGT - NICHT HIER AENDERN. Quelle: /var/www/html/gemeinsam/schale.js
// Aendern, dann `node werkzeug/verteilen.mjs --nur <spiel>`.
//
// Was in jedem Spiel-Client wortgleich dasteht: Verbindung mit Wiederaufbau,
// Raumliste, Beitreten per Code oder Link, Lobby mit Sitzen und Bereit-Knopf,
// Umschalten der vier Bildschirme, Toast und Hilfe-Dialog.
//
// Was NICHT hier drin ist: das Spiel. `starteSchale({ zeichneSpiel })` bekommt
// den Zeichner des Spielbildschirms uebergeben und ruft ihn bei jeder
// `runde`-Nachricht auf. Jedes Spiel behaelt eine eigene vollstaendige Kopie
// dieser Datei; faellt gemeinsam/ weg, laeuft es weiter.
// ──────────────────────────────────────────────────────────────────────────

export const $ = (id) => document.getElementById(id);

/**
 * Texte, die hier entstehen statt im HTML zu stehen.
 *
 * `sprache.js` liegt nicht in jedem Spiel - nur in denen, die schon uebersetzt
 * sind. Deshalb ist der deutsche Wortlaut das dritte Argument und nicht der
 * Notnagel: ohne `sprache.js` steht hier woertlich dasselbe wie vorher, und
 * ein Spiel ohne Uebersetzung merkt von dieser Zeile nichts.
 */
const T = (schluessel, werte, deutsch) =>
  globalThis.sprache?.t(schluessel, werte, deutsch) ?? deutsch;

/**
 * Ein Satz, der vom **Server** kommt.
 *
 * Der Server kennt die Sprache des Clients nicht und soll sie auch nicht
 * kennen - jeder am Tisch kann eine andere eingestellt haben. Deshalb schickt
 * er beides: den deutschen Wortlaut und einen Schluessel dazu.
 *
 *   room.meldung = { text: `${name} hat ein Paar!`, k: "p.paar", w: { name } };
 *
 * Uebersetzt wird hier, im Client, und zwar fuer jeden in seiner eigenen
 * Sprache. Eine blosse Zeichenkette geht weiterhin durch - so bleiben Spiele,
 * die noch nichts davon wissen, unveraendert.
 */
export const satz = (x) =>
  x == null ? "" : typeof x === "object" ? T(x.k, x.w ?? {}, x.text ?? "") : String(x);

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export const S = {
  ws: null, me: null, token: null, code: null,
  room: null, runde: null, isPublic: true, key: "spiel",
};

export const schicke = (m) =>
  S.ws?.readyState === WebSocket.OPEN && S.ws.send(JSON.stringify(m));

export const nameFeld = () => $("name").value.trim() || T("schale.spieler", {}, "Spieler");

export function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2600);
}

export function zeige(name) {
  for (const s of document.querySelectorAll(".screen")) {
    s.classList.toggle("active", s.id === "screen-" + name);
  }
}

export const binHost = () => S.room?.hostId === S.me;
export const ich = () => S.room?.players.find((p) => p.id === S.me);

function wsUrl() {
  const u = new URL("ws", location.href);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.href;
}

/**
 * @param {object} o
 * @param {string} o.key                  Name fuer sessionStorage
 * @param {(m:object) => void} o.zeichneSpiel   eine `runde`-Nachricht
 * @param {(m:object) => void} [o.zeichneFinal] sonst: Tabelle mit name/wert
 * @param {(m:object) => void} [o.zeichneRaum]  zusaetzlich zur Lobby
 * @param {(m:object) => void} [o.sonstige]     alles, was die Schale nicht kennt
 * @param {() => object} [o.raumOptionen] Zusatzfelder fuer `create`
 */
export function starteSchale({
  key, zeichneSpiel, zeichneFinal, zeichneRaum, sonstige, raumOptionen,
}) {
  S.key = key;

  // ---- Die eigene Kennung ------------------------------------------------
  //
  // Bis zum 17.08.2026 lag sie im `sessionStorage`. Der stirbt mit dem Tab -
  // und auf dem Handy schliesst Safari Tabs auch von sich aus. Wer zurueckkam,
  // war fuer den Server ein neuer Spieler: sein alter Platz stand noch da, hatte
  // das Hostzeichen, und niemand konnte die Runde starten. Das war Bugreport 4.
  //
  // Jetzt liegt sie im `localStorage` und ueberlebt das Schliessen. Damit zwei
  // Tabs desselben Geraets sich nicht gegenseitig vom Platz werfen, haengt ein
  // Herzschlag daran: der Tab, dem die Kennung gehoert, frischt sie im
  // Sekundentakt auf und schreibt seine eigene Tabkennung dazu.
  //
  //   - dieselbe Tabkennung  -> das sind wir selbst (Neuladen), Kennung nehmen
  //   - fremd und Herzschlag frisch -> ein anderer Tab spielt gerade, Finger weg
  //   - fremd und Herzschlag alt    -> niemand da, Kennung uebernehmen
  //
  // Ohne den mittleren Fall zoegen zwei Tabs einander abwechselnd den Platz weg.
  const HERZ_MS = 4000;
  const HERZ_TOT = 12_000;
  // Nach zwei Stunden verfaellt der Eintrag: den Raum gibt es dann laengst
  // nicht mehr, und niemand will morgen frueh in die Runde von gestern
  // geworfen werden. Gleicher Wert wie in den neun eigenen Clients.
  const SITZ_VERFALL = 2 * 60 * 60 * 1000;
  const TAB = (() => {
    try {
      const t = sessionStorage.getItem("spiele_tab") ??
        (crypto.randomUUID?.() ?? String(Date.now()) + String(Math.random()).slice(2));
      sessionStorage.setItem("spiele_tab", t);
      return t;
    } catch {
      return "tab";
    }
  })();
  let herzUhr = null;

  function sitzLesen() {
    try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
  }

  /** Kennung, die wir benutzen duerfen - oder `null`. */
  function sitzFrei() {
    const s = sitzLesen();
    if (!s?.code || !s?.token) return null;
    const alt = Date.now() - (s.herz ?? 0);
    if (alt > SITZ_VERFALL) { sitzLoeschen(); return null; }
    if (s.tab === TAB) return s;
    return alt > HERZ_TOT ? s : null;
  }

  const tokenFuer = (code) => (sitzFrei()?.code === code ? sitzFrei().token : undefined);

  function sitzHalten() {
    if (!S.code || !S.token) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        code: S.code, token: S.token, tab: TAB, herz: Date.now(),
      }));
    } catch { /* Privatmodus - dann eben ohne Wiedereinstieg */ }
  }

  function sitzLoeschen() {
    clearInterval(herzUhr);
    herzUhr = null;
    try { localStorage.removeItem(key); } catch { /* egal */ }
  }

  // Ist auf *dieser* Verbindung schon ein Raumzustand angekommen? Daran haengt,
  // was ein „error" bedeutet: vor dem ersten `room` ist es die Antwort auf den
  // Wiedereinstieg (Raum weg, Runde laeuft schon) - danach nur eine Meldung,
  // die niemanden aus dem Raum werfen darf.
  let angekommen = false;

  function empfange(m) {
    switch (m.t) {
      case "rooms": zeichneRaeume(m.rooms); break;
      case "joined":
        S.me = m.you; S.token = m.token; S.code = m.code;
        sitzHalten();
        clearInterval(herzUhr);
        herzUhr = setInterval(sitzHalten, HERZ_MS);
        history.replaceState(null, "", "#" + m.code);
        break;
      case "room":
        angekommen = true;
        S.room = m;
        zeichneLobby();
        zeichneRaum?.(m);
        break;
      case "runde": S.runde = m; zeichneSpiel(m); break;
      case "final": (zeichneFinal ?? standardFinal)(m); break;
      case "error":
        toast(m.msg);
        // Kam die Meldung, bevor auf dieser Verbindung je ein Raum ankam, ist
        // der Wiedereinstieg gescheitert: den Raum gibt es nicht mehr, oder die
        // Runde laeuft ohne uns weiter. Dann muss die gemerkte Kennung weg -
        // sonst versucht der Client sie bei jedem Neuverbinden wieder und man
        // bekommt dieselbe Meldung im Halbminutentakt.
        //
        // Steht dagegen schon ein Raum, sitzen wir drin: dann ist es nur eine
        // Meldung (Raum voll, zu viele Raeume) und niemand fliegt heraus.
        if (!angekommen) heimwaerts();
        break;
      default: sonstige?.(m);
    }
  }

  // Wartezeit bis zum naechsten Versuch. Sie waechst mit jedem Fehlschlag und
  // faellt beim ersten Erfolg zurueck - genau so, wie es die neun eigenen
  // Clients (nochnie, maexchen, imposter, flasche, luckyreflex, amehesten,
  // cubes, wortleger, luegen) schon immer gemacht haben.
  //
  // Vorher stand hier ein fester Takt von 1500 ms. Das sind **genau 40 neue
  // Verbindungen je Minute** - und `bremse.js` laesst 40 je Minute und IP zu.
  // Ein einzelner Tab lag damit exakt auf der Grenze, zwei Tabs oder zwei
  // Leute an einem Anschluss darueber: wem der Dienst kurz wegbrach, der
  // sperrte sich selbst aus und kam auch dann nicht zurueck, als der Dienst
  // laengst wieder lief. Beim Ausrollen eines Updates traefe es alle
  // gleichzeitig, und alle im selben Takt.
  //
  // Der Zufallsanteil ist kein Beiwerk: ohne ihn kommen nach einem Neustart
  // alle Clients in derselben Millisekunde wieder - und werden gemeinsam
  // abgewiesen, immer wieder.
  const WARTE_ANFANG = 500;
  const WARTE_MAX = 8000;
  // Zurueckgesetzt wird erst, wenn die Verbindung sich bewaehrt hat. Ein
  // `onopen` allein reicht nicht: ein Dienst in der Absturzschleife nimmt die
  // Verbindung an und wirft sie sofort wieder ab. Wer dann bei jedem `open`
  // auf 500 ms zuruecksetzt, haemmert schneller als mit dem festen Takt, den
  // dieser Rueckzug ersetzen soll - nachgemessen mit `pruefe-durchlauf.mjs`
  // B08, Betriebsart "flapp": 32 Versuche in 20 Sekunden.
  const BEWAEHRT_NACH = 3000;
  let warte = WARTE_ANFANG;
  let bewaehrung = null;

  // Was beim Verbinden als Erstes gesagt wird. Entweder wir haben einen Platz
  // (dann zurueck darauf) oder nicht (dann die Raumliste). Steht an einer
  // Stelle, weil es an dreien gebraucht wird: erster Start, Wiederaufbau nach
  // Abbruch und die Rueckkehr aus der Hosentasche.
  function anmelden() {
    const s = S.code && S.token ? { code: S.code, token: S.token } : sitzFrei();
    if (s?.code && s?.token) {
      S.code = s.code;
      S.token = s.token;
      schicke({ t: "join", code: s.code, token: s.token, name: nameFeld() });
    } else {
      schicke({ t: "browse" });
    }
  }

  let wiederUhr = null;

  function verbinde(dann) {
    clearTimeout(wiederUhr);
    wiederUhr = null;
    // Doppelte Verbindungen sind der Hauptgrund, warum der Wiedereinstieg
    // frueher schiefging: `sofortWieder` unten feuert bei jeder Rueckkehr, und
    // Handys feuern gleich drei Ereignisse auf einmal.
    if (S.ws && S.ws.readyState === WebSocket.CONNECTING) return;
    if (S.ws && S.ws.readyState === WebSocket.OPEN) return dann?.();
    angekommen = false;
    S.ws = new WebSocket(wsUrl());
    S.ws.onopen = () => {
      clearTimeout(bewaehrung);
      bewaehrung = setTimeout(() => { warte = WARTE_ANFANG; }, BEWAEHRT_NACH);
      $("status").textContent = "";
      (dann ?? anmelden)();
    };
    S.ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      empfange(m);
    };
    S.ws.onclose = () => {
      clearTimeout(bewaehrung);
      $("status").textContent = T("schale.weg", {}, "Verbindung weg – neu verbinden …");
      const gleich = warte * (0.8 + Math.random() * 0.4);
      warte = Math.min(warte * 1.8, WARTE_MAX);
      clearTimeout(wiederUhr);
      wiederUhr = setTimeout(() => verbinde(), gleich);
    };
  }

  // Zurueck aus der Hosentasche.
  //
  // Auf dem Handy ist der weggelegte Bildschirm der Normalfall. Safari friert
  // den Tab ein, kappt die Verbindung und laesst auch die Wartezeit oben nicht
  // weiterlaufen. Wer dann zurueckkommt, sitzt vor einer toten Seite, bis der
  // Zaehler irgendwann von selbst zuschlaegt - bis zu acht Sekunden lang, und
  // in dieser Zeit weiss niemand, ob er noch im Raum ist. Deshalb bei jedem
  // Zeichen von Rueckkehr sofort und ohne Wartezeit neu verbinden; `verbinde`
  // bricht von selbst ab, wenn die Verbindung noch steht. Gleiche Fassung wie
  // in den neun eigenen Clients.
  function sofortWieder() {
    if (document.visibilityState === "hidden") return;
    warte = WARTE_ANFANG;
    verbinde();
  }

  document.addEventListener("visibilitychange", sofortWieder);
  globalThis.addEventListener("pageshow", sofortWieder);
  globalThis.addEventListener("focus", sofortWieder);
  globalThis.addEventListener("online", sofortWieder);

  // Gemerkt, damit sie nach einem Sprachwechsel neu gezeichnet werden kann:
  // „Gerade keine offenen Raeume" stand sonst weiter auf Deutsch da, bis der
  // Server das Naechste schickt.
  let letzteRaeume = [];

  function zeichneRaeume(liste) {
    letzteRaeume = liste;
    const box = $("roomList");
    box.innerHTML = "";
    $("roomsCount").textContent = liste.length ? `(${liste.length})` : "";
    if (!liste.length) {
      box.append(el("div", "rooms-empty", T("schale.keineRaeume", {}, "Gerade keine offenen Räume.")));
      return;
    }
    for (const r of liste) {
      const row = el("div", "roomrow");
      row.append(el("span", "roomrow-code", r.code));
      row.append(el("span", "roomrow-name", r.host));
      row.append(el("span", "roomrow-count", `${r.count}/${r.max}`));
      // `token` ist meist leer. Steht dort einer, hat dieses Geraet in genau
      // diesem Raum schon einen Platz - dann zurueck auf den alten, statt sich
      // als zweite Person danebenzusetzen.
      row.onclick = () => verbinde(() =>
        schicke({ t: "join", code: r.code, token: tokenFuer(r.code), name: nameFeld() }));
      box.append(row);
    }
  }

  function zeichneLobby() {
    const r = S.room;
    if (r.phase === "lobby") zeige("lobby");
    $("roomCode").textContent = r.code;
    $("roomVis").textContent = r.isPublic
      ? T("schale.oeffentlich", {}, "öffentlich")
      : T("schale.privat", {}, "privat");
    $("lobbyCount").textContent = `${r.players.length}/${r.maxPlayers}`;

    const liste = $("playerList");
    liste.innerHTML = "";
    for (const p of r.players) {
      const s = el("div", "seat" + (p.ready ? " ready" : "") + (p.connected ? "" : " off"));
      s.append(el("div", "av", (p.name[0] ?? "?").toUpperCase()));
      s.append(el("div", "nm", p.name));
      // Reihenfolge mit Absicht: wer weg ist, steht als „weg" da - auch wenn
      // er sich vorher bereit gemeldet hat. Sein Bereit-Zeichen bleibt jetzt
      // ueber den Abbruch hinweg stehen (siehe `raum.js`), und ein Platz, der
      // „bereit" sagt, obwohl dort niemand sitzt, ist genau die Unklarheit,
      // um die es hier geht.
      s.append(el("div", "st",
        !p.connected
          ? T("schale.fort", {}, "weg")
          : p.ready
          ? T("schale.bereit", {}, "bereit")
          : T("schale.wartet", {}, "wartet")));
      if (p.host) s.append(el("div", "host", T("schale.host", {}, "Host")));
      liste.append(s);
    }

    const host = binHost();
    $("hostControls").hidden = !host;
    $("guestControls").hidden = host;
    if ($("endeBtn")) $("endeBtn").hidden = !host;
    for (const b of document.querySelectorAll("[data-lobbyvis]")) {
      b.classList.toggle("sel", (b.dataset.lobbyvis === "public") === r.isPublic);
    }
    const da = r.players.filter((p) => p.connected).length;
    const alleBereit = r.players
      .filter((p) => p.connected && p.id !== r.hostId)
      .every((p) => p.ready);
    $("startBtn").disabled = da < r.minPlayers || !alleBereit;
    // Der Solo-Zweig ist nur bei minPlayers === 1 erreichbar; wo zwei noetig
    // sind, faengt die Zeile darueber den Fall schon ab.
    $("startHint").textContent = da < r.minPlayers
      ? T("schale.mindestens", { min: r.minPlayers, da },
        `Mindestens ${r.minPlayers} Leute – ihr seid ${da}.`)
      : da === 1
      ? T("schale.allein", {}, "Allein unterwegs – du kannst sofort starten.")
      : alleBereit ? "" : T("schale.nichtBereit", {}, "Noch nicht alle sind bereit.");
    $("readyBtn").classList.toggle("on", !!ich()?.ready);
  }

  function standardFinal(m) {
    zeige("final");
    $("finalSub").textContent = satz(m.untertitel);
    const ol = $("podium");
    ol.innerHTML = "";
    for (const z of m.tabelle ?? []) {
      const li = el("li");
      li.append(el("span", "pd-name", z.name));
      li.append(el("span", "pd-pt", satz(z.wert ?? z.punkte ?? "")));
      ol.append(li);
    }
    $("againBtn").hidden = !binHost();
  }

  // ---- Bedienung ---------------------------------------------------------
  for (const b of document.querySelectorAll("[data-vis]")) {
    b.onclick = () => {
      S.isPublic = b.dataset.vis === "public";
      for (const x of document.querySelectorAll("[data-vis]")) x.classList.toggle("sel", x === b);
    };
  }
  for (const b of document.querySelectorAll("[data-lobbyvis]")) {
    b.onclick = () => schicke({ t: "settings", isPublic: b.dataset.lobbyvis === "public" });
  }
  $("createBtn").onclick = () =>
    verbinde(() =>
      schicke({ t: "create", name: nameFeld(), isPublic: S.isPublic, ...(raumOptionen?.() ?? {}) })
    );
  $("joinBtn").onclick = () => {
    const code = $("codeInput").value.toUpperCase().trim();
    if (code) {
      verbinde(() => schicke({ t: "join", code, token: tokenFuer(code), name: nameFeld() }));
    }
  };
  $("copyBtn").onclick = async () => {
    const link = location.origin + location.pathname + "#" + S.code;
    try {
      await navigator.clipboard.writeText(link);
      toast(T("schale.kopiert", {}, "Link kopiert"));
    } catch {
      toast(link);
    }
  };
  $("readyBtn").onclick = () => schicke({ t: "ready", value: !ich()?.ready });
  $("startBtn").onclick = () => schicke({ t: "start" });
  if ($("endeBtn")) $("endeBtn").onclick = () => schicke({ t: "ende" });
  $("againBtn").onclick = () => schicke({ t: "again" });

  // Umgeschaltet wird selten, aber wenn, dann mitten im Warteraum: was hier
  // gezeichnet wurde, traegt sonst weiter die alte Sprache. Das Ereignis kommt
  // von `sprache.js` und bleibt ohne sie einfach aus.
  document.addEventListener("sprachwechsel", () => {
    zeichneRaeume(letzteRaeume);
    if (S.room) zeichneLobby();
    if (S.runde) zeichneSpiel?.(S.runde);
  });
  // Hinaus geht es von ueberall, nicht nur aus der Lobby: `#leaveBtn` und jeder
  // Knopf mit `data-raus`. Vorher fuehrte aus dem Spielbildschirm nur der
  // Zurueck-Knopf des Browsers heraus, und aus dem Endstand gar nichts - wer
  // nicht Host war, sass fest. Das war Bugreport 10.
  //
  // Seit dem 08.09.2026 ist dieser Knopf der **einzige** Weg, den Platz
  // wirklich aufzugeben: alles andere - weggewischt, gesperrt, Funkloch -
  // haelt der Server bis zu zwanzig Minuten lang frei. Umgekehrt heisst das,
  // dass ein Fehlgriff hier teuer ist, deshalb fragt er mitten in der Runde
  // einmal nach.
  const raus = () => {
    schicke({ t: "leave" });
    heimwaerts();
    schicke({ t: "browse" });
  };

  /** Aus dem Raum heraus auf die Startseite - ohne dem Server etwas zu sagen. */
  function heimwaerts() {
    S.code = null; S.token = null; S.me = null; S.room = null; S.runde = null;
    sitzLoeschen();
    history.replaceState(null, "", location.pathname);
    zeige("home");
  }

  // Zwei Stufen, aber nur wo es weh tut: im Warteraum kostet ein Fehlgriff
  // nichts, in der laufenden Runde das Blatt. Der Knopf schreibt sich dafuer
  // kurz um, statt einen Dialog aufzumachen - `confirm()` blockiert auf dem
  // Handy die ganze Seite, und die Verbindung laeuft derweil weiter.
  const BEDENK_MS = 4000;
  function knopfRaus(b) {
    let scharf = null;
    const zurueck = () => {
      clearTimeout(scharf);
      scharf = null;
      if (b.dataset.wortlaut != null) b.textContent = b.dataset.wortlaut;
      b.classList.remove("fragt");
    };
    b.onclick = () => {
      if (!S.room || S.room.phase === "lobby") return raus();
      if (scharf) { zurueck(); return raus(); }
      b.dataset.wortlaut = b.textContent;
      b.textContent = T("schale.wirklichRaus", {}, "Wirklich raus?");
      b.classList.add("fragt");
      scharf = setTimeout(zurueck, BEDENK_MS);
    };
  }

  knopfRaus($("leaveBtn"));
  for (const b of document.querySelectorAll("[data-raus]")) knopfRaus(b);
  $("helpBtn").onclick = () => { $("help").hidden = false; };
  $("helpClose").onclick = () => { $("help").hidden = true; };

  const gespeichert = sitzFrei();
  const hash = location.hash.replace("#", "").toUpperCase();
  // Der Schluessel heisst in allen dreiundzwanzig Spielen gleich - nur so
  // findet man seinen Namen beim naechsten Spiel wieder vor, ohne ihn neu zu
  // tippen. Wer ihn hier aendert, trennt die Schale von den uebrigen Spielen.
  try {
    $("name").value = localStorage.getItem("spiele_name") ?? "";
    $("name").onchange = () => localStorage.setItem("spiele_name", nameFeld());
  } catch { /* Privatmodus */ }

  // Wer einen gehaltenen Platz hat, geht zurueck darauf - **auch ohne `#CODE`
  // in der Adresse**. Das war die zweite Haelfte der Unklarheit: der Server
  // hielt den Platz brav zwanzig Minuten, aber wer ueber die Kachel statt ueber
  // den geteilten Link zurueckkam, landete auf der Startseite und hielt sich
  // fuer draussen - waehrend er in Wahrheit noch am Tisch sass.
  //
  // Der Hash gewinnt trotzdem, wenn er auf einen *anderen* Raum zeigt: wer
  // gerade einen Link geschickt bekommt, will dorthin und nicht in seine alte
  // Runde. Dann bleibt die alte Kennung liegen, statt sie mitzuschicken.
  if (hash && gespeichert?.code !== hash) $("codeInput").value = hash;
  verbinde(() => {
    if (hash && gespeichert?.code === hash) {
      S.code = hash;
      S.token = gespeichert.token;
    }
    if (hash && gespeichert?.code !== hash) {
      schicke({ t: "join", code: hash, token: tokenFuer(hash), name: nameFeld() });
      return;
    }
    anmelden();
  });

  // Lebenszeichen alle 20 s. Der Server raeumt Verbindungen ab, die 180 s lang
  // schweigen (die Geisterwache in `raum.js`) - das sind neun Pings Luft.
  // Frueher: 25 s Takt gegen 65 s Frist, also zwei. Wer eine Weile nur zusah,
  // flog dadurch mitten im Spiel aus dem Raum.
  setInterval(() => schicke({ t: "ping", c: Date.now() }), 20_000);

  return { verbinde };
}

// ══════════════ Gemeinsame Client-Schale ══════════════ Ende ══════════════
