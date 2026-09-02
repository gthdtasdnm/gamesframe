#!/bin/bash
# Geruest fuer ein neues Server-Spiel: Ordner, gemeinsame Teile, HTML-Huelle,
# Dienst, Apache. Das Spiel selbst sind danach nur noch server.js, app.js und
# ein CSS-Anhang.
#
#   neuspiel.sh <name> <port> "<Beschreibung>" "<TITEL>" "<LOGO1>" "<LOGO2>" \
#               "<Untertitel>" "<Emoji>" <max>
set -e
n=$1; p=$2; d=$3; titel=$4; l1=$5; l2=$6; tagline=$7; emoji=$8; max=${9:-8}
cd /var/www/html
mkdir -p "$n/public"
cp gemeinsam/bremse.js gemeinsam/raum.js gemeinsam/statisch.js "$n/"
cp gemeinsam/schale.js "$n/public/schale.js"
# Sprachen: jedes neue Spiel wird dreisprachig geboren. sprache.js legt tr/en
# ueber das deutsche Markup, schale-texte.js bringt Warteraum und Endstand
# schon uebersetzt mit - zu tun bleiben nur die eigenen Saetze des Spiels.
cp gemeinsam/sprache.js "$n/public/sprache.js"
cp gemeinsam/schale-texte.js "$n/public/schale-texte.js"
cp gemeinsam/lobby.css "$n/public/style.css"
cat werkzeug/rahmen.css >> "$n/public/style.css"

cat > "$n/public/texte.js" <<EOF
// Tuerkisch und Englisch fuer $titel.
//
// Deutsch steht im HTML und - wo Text erst im Code entsteht - als drittes
// Argument bei \`t()\`. Hier liegen nur die beiden anderen Fassungen darueber.
// Warteraum, Raumliste und Endstand kommen aus \`schale-texte.js\` und sind
// schon uebersetzt; hier gehoeren die eigenen Saetze des Spiels hinein.
//
// **TODO steht fuer: noch nicht uebersetzt.** \`werkzeug/pruefe-sprache.mjs\`
// schlaegt darauf an - ein Spiel gilt erst ohne TODO als fertig.

import { SCHALE_WOERTER } from "./schale-texte.js";

const EIGEN = {
  tr: {
    "$n.tag": "TODO $tagline",
  },

  en: {
    "$n.tag": "TODO $tagline",
  },
};

export const WOERTER = {
  tr: { ...SCHALE_WOERTER.tr, ...EIGEN.tr },
  en: { ...SCHALE_WOERTER.en, ...EIGEN.en },
};
EOF

cat > "$n/deno.json" <<EOF
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-env --allow-sys server.js"
  }
}
EOF

cat > "$n/public/index.html" <<EOF
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0a0612">
<title>$titel</title>
<link rel="stylesheet" href="style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>$emoji</text></svg>">
</head>
<body>

<div id="status"></div>
<div id="toast"></div>

<section id="screen-home" class="screen active">
  <div class="home">
    <h1 class="logo">$l1<span>$l2</span></h1>
    <p class="tag" data-t="$n.tag">$tagline</p>

    <label class="field-label" for="name" data-t="schale.deinName">Dein Name</label>
    <input id="name" maxlength="12" placeholder="z.&nbsp;B. Mo" autocomplete="nickname"
           data-t-attr="placeholder:schale.namePlatz">

    <div id="homeExtra"></div>

    <div class="setting">
      <span class="setting-label">Sichtbar</span>
      <div class="segmented">
        <button class="seg sel" data-vis="public" data-t="schale.oeffentlichKnopf">Öffentlich</button>
        <button class="seg" data-vis="private" data-t="schale.privatKnopf">Privat</button>
      </div>
    </div>
    <button id="createBtn" class="btn primary big" data-t="schale.raumAuf">Raum eröffnen</button>

    <div class="or"><span data-t="schale.oder">oder beitreten</span></div>

    <div class="rooms-head"><span data-t="schale.offeneRaeume">Offene Räume</span> <span id="roomsCount"></span></div>
    <div id="roomList" class="roomlist"></div>

    <div class="joinrow">
      <input id="codeInput" maxlength="5" placeholder="CODE" autocapitalize="characters"
             autocomplete="off" spellcheck="false" data-t-attr="placeholder:schale.codePlatz">
      <button id="joinBtn" class="btn" data-t="schale.mitCode">Mit Code</button>
    </div>

    <button id="helpBtn" class="btn ghost small" data-t="schale.wieGeht">Wie geht das?</button>
    <p class="zurueckzeile">
      <a class="zurueck" href="/spiele/" data-t="schale.alleSpiele">← Alle Spiele</a>
    </p>
    <!-- Fuellt sprache.js; ohne JavaScript bleibt er leer und alles deutsch. -->
    <div data-sprachwahl aria-label="Sprache"></div>
  </div>
</section>

<section id="screen-lobby" class="screen">
  <div class="lobby">
    <div class="codebox">
      <span class="codebox-label" data-t="schale.raumcode">Raumcode</span>
      <strong id="roomCode">····</strong>
      <span id="roomVis" class="codebox-vis"></span>
      <button id="copyBtn" class="btn ghost small" data-t="schale.linkKopieren">Link kopieren</button>
    </div>
    <div class="lobby-head"><h2><span data-t="schale.spielerKopf">Spieler</span> <span id="lobbyCount">1/$max</span></h2></div>
    <div id="playerList" class="seats"></div>

    <div id="hostControls" hidden>
      <div id="hostExtra"></div>
      <div class="setting">
        <span class="setting-label">Sichtbar</span>
        <div class="segmented">
          <button class="seg" data-lobbyvis="public" data-t="schale.oeffentlichKnopf">Öffentlich</button>
          <button class="seg" data-lobbyvis="private" data-t="schale.privatKnopf">Privat</button>
        </div>
      </div>
      <button id="startBtn" class="btn primary big" data-t="schale.starten">Runde starten</button>
      <p id="startHint" class="hintline"></p>
    </div>
    <div id="guestControls" hidden>
      <button id="readyBtn" class="btn big" data-t="schale.bereitKnopf">Bereit!</button>
      <p class="hintline" data-t="schale.hostStartet">Der Host startet, sobald alle bereit sind.</p>
    </div>
    <button id="leaveBtn" class="btn ghost small" data-t="schale.verlassen">Raum verlassen</button>
  </div>
</section>

<section id="screen-game" class="screen">
  <div class="game">
    <header class="topbar">
      <div class="tb-runde" id="tbLinks"></div>
      <div class="tb-modus" id="tbTag"></div>
      <button id="endeBtn" class="btn ghost sm" hidden data-t="schale.beenden">Beenden</button>
    </header>
    <main class="buehne" id="buehne"></main>
    <footer class="fussbereich">
      <div id="aktionen" class="aktionen"></div>
      <p id="rundenHint" class="hintline"></p>
    </footer>
  </div>
</section>

<section id="screen-final" class="screen">
  <div class="final">
    <h2 class="final-title" data-t="schale.endstand">Endstand</h2>
    <p id="finalSub" class="hintline"></p>
    <ol id="podium" class="podium"></ol>
    <button id="againBtn" class="btn big" data-t="schale.nochmal">Nochmal!</button>
    <p id="againHint" class="hintline" data-t="schale.zurueckWarteraum">Der Host holt alle zurück in den Warteraum.</p>
  </div>
</section>

<div id="help" hidden>
  <div class="help-inner">
    <h2 data-t="schale.soLaeuft">So läuft das</h2>
    <ul id="helpList"></ul>
    <button id="helpClose" class="btn" data-t="schale.allesKlar">Alles klar</button>
  </div>
</div>

<script type="module" src="app.js"></script>
</body>
</html>
EOF

cat > "/etc/systemd/system/$n.service" <<EOF
[Unit]
Description=$d
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/$n
ExecStart=/usr/local/bin/deno run --allow-net --allow-read --allow-env --allow-sys server.js
Environment=PORT=$p
Environment=HOST=127.0.0.1
Environment=DENO_DIR=/tmp/deno-cache
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/apache2/conf-available/$n.conf" <<EOF
# $d hinter Apache unter https://inf-zeus.de/$n/

RedirectMatch permanent "^/$n\$" "/$n/"

ProxyPass        /$n/ws  ws://127.0.0.1:$p/ws
ProxyPassReverse /$n/ws  ws://127.0.0.1:$p/ws

ProxyPass        /$n/    http://127.0.0.1:$p/
ProxyPassReverse /$n/    http://127.0.0.1:$p/
EOF
echo "Geruest fuer $n auf Port $p steht."
echo
echo "Sprachen: public/index.html traegt schon data-t, public/texte.js steht"
echo "bereit. In app.js gehoeren diese drei Zeilen VOR starteSchale():"
echo "    import { starteSprache, t } from \"./sprache.js\";"
echo "    import { WOERTER } from \"./texte.js\";"
echo "    starteSprache(WOERTER);"
echo "Danach in spiele.json unter gemeinsam eintragen:"
echo "    \"sprache\": \"public/sprache.js\", \"schaleTexte\": \"public/schale-texte.js\""
