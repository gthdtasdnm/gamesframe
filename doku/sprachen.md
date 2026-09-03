# Deutsch, Türkisch, Englisch

Stand: 03.09.2026. **Alle 29 Spiele, der Bugreport, die Spieleübersicht und die
Startseite sind dreisprachig** – die Oberfläche jedenfalls. Was bewusst deutsch
bleibt, steht unten unter „Was nicht übersetzt wird".

## Die eine Regel

**Deutsch steht im HTML. Türkisch und Englisch liegen darüber.**

```html
<p class="kurz" data-t-html="k.paare.kurz">Ein Brett, alle schauen zu …</p>
```

Das Wörterbuch führt **nur** `tr` und `en`. Zwei Gründe:

1. **Ohne JavaScript bleibt die Seite vollständig.** Auf `/spiele/` ist das
   eine ausdrückliche Zusage (`doku/startseite.md`) – die Übersicht ist der
   einzige Teil, der auch ohne JS etwas wert ist. Läge Deutsch in einer
   Wortliste, stünde dort ohne JS eine leere Seite.
2. **Es gibt keine zweite Fassung des deutschen Textes**, die auseinanderlaufen
   könnte. Genau daran ist auf dieser Seite schon einmal etwas gescheitert (die
   Spielliste als JS-Objekt neben den Kacheln, siehe `doku/startseite.md`).

## Die Teile

| Datei | Was | Verteilt? |
|---|---|---|
| `gemeinsam/sprache.js` | die Mechanik: Auswahl, Umschalter, Ersetzen | ja, als `sprache` |
| `gemeinsam/schale-texte.js` | tr/en für alles, was in **jedem** Warteraum gleich dasteht | ja, als `schaleTexte` |
| `<ort>/texte.js` | tr/en für das Eigene dieses Ortes | nein, gehört dem Ort |

`spiele.json` sagt, wer was bekommt – auch die beiden Seiten ohne Dienst stehen
dort, unter dem Schlüssel **`seiten`** (`/spiele/` und die Startseite).

## Im Markup

```html
<p data-t="k.paare.kurz">Deutscher Satz.</p>                    <!-- Text -->
<p data-t-html="fuss.text">Text mit <b>Auszeichnung</b>.</p>    <!-- mit Tags -->
<input data-t-attr="placeholder:suche.platz|aria-label:suche.label">
<div data-sprachwahl></div>                                     <!-- Umschalter -->
```

`data-sprachwahl` wird von `sprache.js` gefüllt und bleibt ohne JavaScript
leer – deshalb hat er im CSS ein `:empty { display: none }` und steht sonst als
leerer Kasten da.

## Im Code

Was erst beim Tippen oder Zeichnen entsteht, steht nicht im Markup:

```js
import { starteSprache, t } from "./sprache.js";
import { WOERTER } from "./texte.js";
starteSprache(WOERTER);          // vor allem, was zeichnet

t("suche.viele", { n: 3, alle: 28 }, `3 von 28 Spielen.`)
```

Das **dritte Argument ist der deutsche Wortlaut** – nicht der Notnagel, sondern
die Quelle. Fehlt eine Übersetzung, steht dort Deutsch, und
`sprache.fehlendeSchluessel()` sagt hinterher, welche es war.

Für klassische Skripte (die Übersicht hat ihr JS inline, nicht als Modul) liegt
dasselbe unter `globalThis.sprache`.

### Nach dem Umschalten neu zeichnen

`sprache.js` feuert `document` → `sprachwechsel`. Wer Text **gespeichert** hat,
muss darauf hören:

* die Suche auf `/spiele/` baut ihren Index neu (sonst findet sie in einer
  türkischen Seite weiter nur die deutschen Wörter),
* `schale.js` zeichnet Raumliste und Warteraum neu,
* ein Spiel zeichnet, was es selbst gebaut hat.

Was in einem `<template>` liegt, sieht `sprache.js` **nicht** – Templates stehen
außerhalb des Dokuments. Erst die geklonten Knoten sind erreichbar:
`sprache.uebersetze(liste)` nach dem Einhängen. Genau so macht es der
Anleitungsdialog auf `/spiele/`.

## Texte, die vom Server kommen

Der Server kennt die Sprache des Clients **nicht** und soll sie nicht kennen:
am selben Tisch kann jeder eine andere eingestellt haben. Deshalb schickt er
beides – den deutschen Wortlaut und einen Schlüssel:

```js
room.meldung = {
  text: `${player.name} hat ein Paar – noch mal!`,
  k: "p.paarGefunden",
  w: { name: player.name },
};
```

Im Client übersetzt `satz()` aus `schale.js` das für jeden einzeln. Eine bloße
Zeichenkette geht weiterhin durch – Spiele, die noch nichts davon wissen,
bleiben unverändert.

## Welche Sprache gilt?

In dieser Reihenfolge:

1. `?lang=tr` in der Adresse – damit ein geteilter Link in der Sprache aufgeht,
   in der er weitergegeben wurde. Wird gleich gemerkt.
2. was zuletzt gewählt wurde (`localStorage["spiele_sprache"]`, **geräteweit
   für alle Spiele**, wie `spiele_name`)
3. die Sprache des Browsers, wenn wir sie können
4. Deutsch

## Die Schlüssel

Sie sind beim Umstellen **maschinell vergeben** worden und tragen deshalb die
ersten Wörter des deutschen Satzes im Namen: `k.cubes.jederbekommt16`,
`nochnie.jederundewir22`. Das sieht ungewohnt aus, hat aber einen Zweck – man
findet die Stelle im Markup wieder, ohne suchen zu müssen. Von Hand vergebene
Schlüssel (`mm.sagtMau`, `sw.feuer`) stehen daneben; beides ist in Ordnung.

Zwei Familien sind gemeinsam und stehen in `schale-texte.js`:

* `schale.*` – der Warteraum der sieben Schalenspiele, Wort für Wort wie in
  `schale.js`.
* `c.*` – dieselben Sachen für die Spiele mit **eigener** Klempnerei
  („Gruppe C"): anderer Wortlaut, untereinander aber gleich.

Ein Spiel bindet beide über seine `texte.js` ein und legt nur noch die eigenen
Sätze darüber. Deshalb kostete das letzte Spiel weniger als das erste.

## Wo `t` schon vergeben ist

In `cardchaos` heißt die verstrichene Zeit `t` (`renderLive(st, t)`), im
Bugreport das Toast-Element. Dort heißt der Übersetzer `uebersetzt`:

```js
import { t as uebersetzt } from "../sprache.js";
```

Das ist kein Schönheitsfehler, sondern der Grund, warum es dort einmal
`TypeError: t is not a function` gab.

## Klassische Skripte

`ameisen` und der `bugreport` laden ihr `app.js` weiterhin **ohne**
`type="module"`. Bei Ameisen schaut die Browserprobe auf die globale Variable
`S`; ein Modul hätte sie weggekapselt. Beide holen sich die Texte deshalb über
`globalThis.sprache` – dasselbe Muster wie das Skript der Spieleübersicht:

```js
const t = (k, w, deutsch) => globalThis.sprache?.t(k, w, deutsch) ?? deutsch;
```

## Was nicht übersetzt wird

* **Die Spielnamen.** Der Name ist die Adresse und das, was auf dem Bildschirm
  des Spiels steht; eine übersetzte Kachel führte sonst zu einem Spiel, das
  anders heißt. Was es ist, sagt der Satz darunter.
* **Impressum und Datenschutz.** Sie bleiben deutsch und verbindlich; auf
  `/spiele/` steht in einer anderen Sprache ein Hinweis darauf, auf der
  Startseite tragen die beiden Links „(German)". Selbst juristisch zu
  übersetzen wäre eine zweite Fassung, die niemand pflegt.
* **Die Alternativtexte der Screenshots.** Die Bilder zeigen deutsche
  Oberflächen.
* **Die Inhaltslisten.** Karten, Fragen, Begriffe, Wortlisten: Kings Cup,
  „Ich hab noch nie", Wer am ehesten, Flaschendrehen, Imposter, Wortgitter,
  Wortleger. Das ist keine Übersetzungsarbeit, sondern **eigene Listen je
  Sprache** – türkische Trinkspielkarten schreibt man neu, man übersetzt sie
  nicht, und ein deutsches Wortgitter besteht aus deutschen Wörtern. Bei Kings
  Cup und Wortgitter sagt die Hilfe das jetzt auch dazu.

## Prüfen

```bash
cd /var/www/html/paare
PORT=8087 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
cd /root/werkzeug-screenshots && node pruefe-sprache.mjs
ss -tlnp | grep ':8087 '   # danach über den Port beenden, nie per pkill
```

Seit dem 03.09.2026 liest sie **alle eigenen JS-Dateien eines Spiels**, nicht
mehr nur `app.js` und `server.js`. Vorher stand dort eine Liste von Kandidaten;
das reichte, solange jedes Spiel seinen Client in einer Datei hatte. Glückspilz
hat vier davon (`app.js`, `kern.js`, `casino.js`, `markt.js`) und vier auf der
Serverseite – deren Schlüssel wären als Karteileichen gemeldet worden, obwohl
sie benutzt werden. Ausgenommen sind die verteilten Teile, `texte.js` selbst
und `probe.js`.

Dabei ist ein zweiter Fehler aufgefallen: das Muster für Schlüssel war zu grob.
`"D..t..T..t..D"` aus `wortleger/brett.js` – eine Zeile des Spielbretts – galt
als Schlüssel und wurde als unübersetzt gemeldet. Jetzt muss **jedes Segment
mit einem Buchstaben anfangen**.

Sie geht beide Richtungen durch – kein Schlüssel ohne Übersetzung, keine
Übersetzung ohne Schlüssel – und dazu: gleiche Platzhalter (`{name}`) und
gleiche Auszeichnung in beiden Sprachen, nichts steht mehr auf `TODO`, das
Umschalten ändert wirklich den sichtbaren Text, die Wahl überlebt ein Neuladen,
ein türkischer Browser bekommt beim ersten Besuch Türkisch – **und ohne
JavaScript bleibt alles deutsch und vollständig**.

## Ein Spiel nachziehen

Alle sind nachgezogen; für ein **neues** Spiel legt `werkzeug/neuspiel.sh` bzw.
`neusolo.sh` das Gerüst an. Der Weg, falls doch einmal etwas von Hand kommt:

1. `spiele.json`: `"sprache"` (und bei einem Warteraum `"schaleTexte"`)
   eintragen, dann `node werkzeug/verteilen.mjs --nur <spiel>`.
2. Im Markup `data-t` setzen. Was der Warteraum trägt, hat schon Schlüssel:
   `schale.*` bzw. `c.*` – abschreiben, nicht neu erfinden.
3. `public/texte.js` anlegen (Vorlage: `paare/public/texte.js`).
4. `starteSprache(WOERTER)` **vor** allem, was zeichnet.
5. Servermeldungen auf `{ text, k, w }` umstellen und im Client durch `satz()`
   schicken.
6. Was im Code entsteht, auf `t(schlüssel, werte, deutsch)` umstellen; was nach
   dem Start ins Dokument kommt, mit `uebersetze(...)` nachziehen.
7. `deno task probe` und `node pruefe-sprache.mjs`.

## Was noch aussteht

* **Die Inhaltslisten** (siehe oben) – das ist die nächste, eigene Aufgabe und
  kein Nachziehen: sie müssen je Sprache neu geschrieben werden.
* **Die Screenshots** auf `/spiele/` zeigen deutsche Oberflächen.
* **Die Anleitungen im Repo** (`README.md` je Spiel) sind deutsch. Sie richten
  sich an den, der hier baut, nicht an die Spielenden.
