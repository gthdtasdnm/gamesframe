# Deutsch, Türkisch, Englisch

Stand: 02.09.2026. Die Mechanik steht, `/spiele/`, die Startseite und **ein**
Spiel (`/paare/`) sind durchgezogen. Die übrigen 27 Spiele sind noch deutsch –
was fehlt, steht unten unter „Was noch aussteht".

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
| `gemeinsam/schale-texte.js` | tr/en für alles, was in **jedem** Schalenspiel gleich dasteht | ja, als `schaleTexte` |
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

## Was nicht übersetzt wird

* **Die Spielnamen.** Der Name ist die Adresse und das, was auf dem Bildschirm
  des Spiels steht; eine übersetzte Kachel führte sonst zu einem Spiel, das
  anders heißt. Was es ist, sagt der Satz darunter.
* **Impressum und Datenschutz.** Sie bleiben deutsch und verbindlich; auf
  `/spiele/` steht in einer anderen Sprache ein Hinweis darauf, auf der
  Startseite tragen die beiden Links „(German)". Selbst juristisch zu
  übersetzen wäre eine zweite Fassung, die niemand pflegt.
* **Die Alternativtexte der Screenshots.** Die Bilder zeigen deutsche
  Oberflächen, solange die Spiele selbst nicht übersetzt sind.

## Prüfen

```bash
cd /var/www/html/paare
PORT=8087 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
cd /root/werkzeug-screenshots && node pruefe-sprache.mjs
ss -tlnp | grep ':8087 '   # danach über den Port beenden, nie per pkill
```

Sie geht beide Richtungen durch – kein Schlüssel ohne Übersetzung, keine
Übersetzung ohne Schlüssel – und dazu: gleiche Platzhalter (`{name}`) und
gleiche Auszeichnung in beiden Sprachen, nichts steht mehr auf `TODO`, das
Umschalten ändert wirklich den sichtbaren Text, die Wahl überlebt ein Neuladen,
ein türkischer Browser bekommt beim ersten Besuch Türkisch – **und ohne
JavaScript bleibt alles deutsch und vollständig**.

## Ein Spiel nachziehen

Die Reihenfolge, in der es bei Paare gemacht wurde:

1. `spiele.json`: `"sprache": "public/sprache.js"` und – bei Schalenspielen –
   `"schaleTexte": "public/schale-texte.js"` eintragen, dann
   `node werkzeug/verteilen.mjs --nur <spiel>`.
2. Im Markup `data-t` setzen. Was der Warteraum trägt, hat schon Schlüssel:
   `schale.*` aus `schale-texte.js` – abschreiben, nicht neu erfinden.
3. `public/texte.js` anlegen (Vorlage: `paare/public/texte.js`), die beiden
   Wörterbücher zusammenführen.
4. In `app.js` `starteSprache(WOERTER)` **vor** `starteSchale()`.
5. Servermeldungen auf `{ text, k, w }` umstellen und im Client durch `satz()`
   schicken.
6. Was im Code entsteht, auf `t(schlüssel, werte, deutsch)` umstellen; was nach
   dem Start ins Dokument kommt, mit `uebersetze(...)` nachziehen.
7. `deno task probe` und `node pruefe-sprache.mjs`.

Ein Abend je Spiel, bei den textarmen weniger. Neue Spiele bringen das Gerüst
schon mit: `werkzeug/neuspiel.sh` und `neusolo.sh` legen `sprache.js`,
`texte.js` und die `data-t` von sich aus an.

## Was noch aussteht

* **27 Spiele.** Vorschlag für die Reihenfolge: erst die textarmen (Snake,
  Wurm, Revier, Minenfeld, Sudoku, Cubes, Patience), zuletzt die textreichen.
* **Die Wortspiele sind der teure Teil und keine Übersetzungsarbeit.**
  Wortgitter und Wortleger brauchen je Sprache eine **eigene** Wortliste,
  Imposter/Nochnie/Wer-am-ehesten/Kings Cup eigene Karten. Türkische Vokale und
  `i/İ` brechen jede naive `toUpperCase()`-Prüfung – das gehört in die Probe
  des jeweiligen Spiels.
* **Der Umschalter steht bei Paare nur auf dem Startbildschirm.** Gewählt wird
  vor dem Spielen, und die Wahl gilt geräteweit. Sollte er einmal in mehr
  Spielen stehen, gehört sein CSS nach `gemeinsam/lobby.css` statt in jede
  `style.css` – noch trägt es nur eines.
* **Screenshots** bleiben deutsch.
