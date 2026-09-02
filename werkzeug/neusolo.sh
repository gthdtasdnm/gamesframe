#!/bin/bash
# Geruest fuer ein Spiel aus der Sparte „Allein spielen": rein statisch, kein
# Dienst, kein Port, kein Apache-Block – Apache liefert den Ordner direkt aus.
#
#   neusolo.sh <name> "<Titel>" "<Logo1>" "<Logo2>" "<Untertitel>" "<Emoji>"
set -e
n=$1; titel=$2; l1=$3; l2=$4; tagline=$5; emoji=$6
cd /var/www/html
mkdir -p "$n"
cat gemeinsam/lobby.css werkzeug/rahmen.css werkzeug/solo.css > "$n/style.css"
# Sprachen: auch ein Solo-Spiel wird dreisprachig geboren. Ohne Schale gibt es
# hier keine schale-texte.js - alles Eigene steht in texte.js.
cp gemeinsam/sprache.js "$n/sprache.js"

cat > "$n/texte.js" <<EOF
// Tuerkisch und Englisch fuer $titel.
//
// Deutsch steht im HTML und - wo Text erst im Code entsteht - als drittes
// Argument bei \`t()\`. Hier liegen nur die beiden anderen Fassungen darueber.
//
// **TODO steht fuer: noch nicht uebersetzt.** \`werkzeug/pruefe-sprache.mjs\`
// schlaegt darauf an - ein Spiel gilt erst ohne TODO als fertig.

export const WOERTER = {
  tr: {
    "$n.tag": "TODO $tagline",
    "$n.soLaeuft": "TODO So laeuft das",
    "$n.allesKlar": "TODO Alles klar",
    "$n.alleSpiele": "TODO Alle Spiele",
  },

  en: {
    "$n.tag": "TODO $tagline",
    "$n.soLaeuft": "TODO So laeuft das",
    "$n.allesKlar": "TODO Alles klar",
    "$n.alleSpiele": "TODO Alle Spiele",
  },
};
EOF

cat > "$n/index.html" <<EOF
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

<div id="toast"></div>

<div class="solo">
  <header class="solokopf">
    <h1 class="logo sm">$l1<span>$l2</span></h1>
    <div class="solometa">
      <span id="stand"></span>
      <button id="helpBtn" class="btn ghost sm" type="button">?</button>
    </div>
  </header>
  <p class="tag klein" data-t="$n.tag">$tagline</p>

  <div id="einstellung" class="soloeinstellung"></div>
  <main id="buehne" class="solobuehne"></main>
  <div id="aktionen" class="aktionen"></div>
  <p id="hint" class="hintline"></p>
  <p class="hintline"><a class="zurueck" href="/spiele/" data-t="$n.alleSpiele">← Alle Spiele</a></p>
  <!-- Fuellt sprache.js; ohne JavaScript bleibt er leer und alles deutsch. -->
  <div data-sprachwahl aria-label="Sprache"></div>
</div>

<div id="help" hidden>
  <div class="help-inner">
    <h2 data-t="$n.soLaeuft">So läuft das</h2>
    <ul id="helpList"></ul>
    <button id="helpClose" class="btn" type="button" data-t="$n.allesKlar">Alles klar</button>
  </div>
</div>

<script type="module" src="app.js"></script>
</body>
</html>
EOF
echo "Solo-Geruest fuer $n steht: /var/www/html/$n/"
echo
echo "Sprachen: index.html traegt schon data-t, texte.js steht bereit."
echo "In app.js gehoeren diese drei Zeilen ganz nach oben:"
echo "    import { starteSprache, t } from \"./sprache.js\";"
echo "    import { WOERTER } from \"./texte.js\";"
echo "    starteSprache(WOERTER);"
echo "Danach in spiele.json unter gemeinsam: \"sprache\": \"sprache.js\""
