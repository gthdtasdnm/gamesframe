# Was alle Spiele teilen

## Die Regel

Gemeinsame Teile liegen in `/var/www/html/gemeinsam/` und werden von dort in
jedes Spiel **kopiert**. Kein Spiel lädt zur Laufzeit etwas aus diesem Ordner.

Das ist Absicht: würden alle dieselbe Datei importieren, risse ein Fehler darin
alle Spiele gleichzeitig mit. So behält jedes Spiel eine vollständige eigene
Kopie, läuft auch ohne `gemeinsam/` weiter, und sein Repo bleibt in sich
geschlossen. Der Preis ist Drift – und genau die fängt das Verteilskript ab.

## Die Teile

| Teil | Quelle | Was |
|---|---|---|
| `bremse` | `gemeinsam/bremse.js` | Verbindungs- und Raumbremse je IP |
| `raum` | `gemeinsam/raum.js` | Raumcode, Host, Bereit, Karenzzeit, Raumliste, Senden |
| `statisch` | `gemeinsam/statisch.js` | statische Dateien, WebSocket-Annahme, Start |
| `schale` | `gemeinsam/schale.js` | Client-Schale: Verbindung, Lobby, Bildschirme |
| `lobbyCss` | `gemeinsam/lobby.css` | CSS-Block bis zum Endmarker |
| `rahmenCss` | `werkzeug/rahmen.css` | CSS-Abschnitt zwischen zwei Markern |

Welches Spiel welchen Teil bekommt und wohin, steht in `spiele.json` unter
`gemeinsam`. Ein Spiel, das einen Teil nicht braucht, führt ihn dort nicht auf.

## Verteilen

```bash
cd /var/www/html
node werkzeug/verteilen.mjs --pruefen        # nur melden, Exitcode 1 bei Drift
node werkzeug/verteilen.mjs --nur imposter   # ein Spiel
node werkzeug/verteilen.mjs                  # alle
```

**Ausrollen immer Spiel für Spiel**, mit `deno task probe` dazwischen. Genau
dafür gibt es `--nur`: ein Fehler im gemeinsamen Teil trifft dann eins statt
neun. `--pruefen` gehört in jeden Abschluss einer Sitzung.

Drei Arten, wie ein Teil in die Zieldatei kommt:

| Modus | Was ersetzt wird | Wer |
|---|---|---|
| `ganz` | die ganze Datei; sie wird **angelegt**, wenn sie fehlt | `bremse`, `raum`, `statisch`, `schale` |
| `block` | der Kopf bis zur Zeile mit dem Endmarker | `lobbyCss` |
| `abschnitt` | das Stück zwischen Anfangs- und Endmarker | `rahmenCss` |

`ganz` ist der Grund, warum ein neues Spiel überhaupt erst an `raum.js` kommt.
Bei `block` gehört alles unter `Gemeinsame Lobby-Basis ══ Ende` dem Spiel und
bleibt unberührt.

`abschnitt` gibt es seit dem 09.08.2026 und nur für einen Fall: `rahmen.css`
steht in `public/style.css` **zwischen** der Lobby-Basis und dem Eigenen des
Spiels und ist von keiner Seite her zu fassen. Vorher wurde die Datei von
`neuspiel.sh` einmal beim Anlegen hineinkopiert und danach nie wieder angefasst
– eine dritte CSS-Ebene, die niemand pflegte. Jetzt trägt sie die Marker
`Gemeinsamer Rahmen ══ Anfang` und `… Ende` und wird mitgeführt.

**Nur die acht Spiele vom 09.08. führen `rahmenCss`.** Die älteren haben an
derselben Stelle ihr eigenes, gewachsenes CSS; sie nachträglich auf den Rahmen
zu ziehen hieße, ihr Aussehen anzufassen, und dafür gibt es keinen Grund.

## raum.js benutzen

`raumverwaltung()` liefert alles zurück, was der Server sonst selbst hatte.
Pflicht sind `maxPlayers`, `minPlayers`, `einstellungen`; alles andere sind
Haken mit sinnvoller Vorgabe. Vollständiges Beispiel: `amehesten/server.js`.

```js
const {
  rooms, browsing, createRoom, clearTimers, anwesende,
  send, raw, broadcast, roomList, pushState, pushRoomList,
  makePlayer, attach, dropPlayer,
} = raumverwaltung({
  maxPlayers: 10,
  minPlayers: 3,
  einstellungen: { rounds: 12, modus: "gemischt" },
  raumfelder: () => ({ deck: [] }),          // eigene Felder je Raum
  spielerfelder: () => ({ kronen: 0 }),      // eigene Felder je Spieler
  listeneintrag: (room) => ({ modus: room.settings.modus }),
  zustandZusatz: (room) => ({}),             // zusätzlich in roomState
  beimBeitritt: (room, player) => {},        // nach dem Verbinden
  beimVerlassen: (room, player) => {},       // Abbruch, VOR pushState
  nachVerlassen: (room, player) => {},       // Abbruch, NACH pushState
  beimPlatzfrei: (room, id) => {},           // Platz endgültig weg
  zurueckZurLobby: (room) => backToLobby(room),
});
```

Die Trennung von `beimVerlassen` und `nachVerlassen` ist der einzige
unbequeme Teil und hat einen Grund: erst den Zustand richtigstellen (die
Stimme der Person zählt nicht mehr mit), dann den Raumzustand schicken, dann
die Runde nachziehen – denn die kann sich durch den Abgang bereits auflösen
und schickt dann selbst.

## statisch.js benutzen

```js
starte({ port: PORT, host: HOST, publicDir: PUBLIC,
         titel: "WER AM EHESTEN", handle, dropPlayer });
```

`statisch.js` lädt `./bremse.js` aus demselben Spielordner. `darfRaumOeffnen`
und `raumVermerkt` braucht das Spiel selbst – die gehören in den `create`-Zweig
von `handle`.

## Wer schon umgestellt ist

`spiele.json` sagt es: wer `raum` und `statisch` unter `gemeinsam` stehen hat,
ist umgestellt. Die übrigen tragen ihre Klempnerei noch selbst und laufen
weiter – es gibt keinen Zwang, sie anzufassen. Wenn doch, dann eins nach dem
anderen, jedes mit grüner Probe.

Nicht umgestellt und auf absehbare Zeit nicht dran: **Keep** und **Card Chaos**
(anderer Aufbau, PM2, `server/`-Unterordner) sowie **Seconds** und **Lucky
Reflex** – die beiden haben kein `probe.js`, also fehlt der Nachweis, mit dem
ein Umbau überhaupt vertretbar wäre.

## Was außerdem gleich ist, aber nicht verteilt wird

Die Avatar-Liste `["🦊","🐙","🦅","🐺","🦁","🐉"]` mit derselben Ableitung aus
der Spieler-Id, und `localStorage["spiele_name"]` – wer bei einem Spiel seinen
Namen eintippt, findet ihn beim nächsten vor. Beides steckt im Client jedes
Spiels. Der Client-Kern ist der nächste Kandidat fürs Verteilen; er ist noch
nicht ausgelagert, weil er im Gegensatz zum Server pro Spiel stärker abweicht.

## Die Client-Schale (`schale.js`)

Seit dem 09.08.2026 liegt neben `bremse.js`, `raum.js` und `statisch.js` ein
vierter Teil in `gemeinsam/`: **`schale.js`**, verteilt nach
`<spiel>/public/schale.js`. Darin steht, was in jedem Client wortgleich stand –
Verbindung samt Wiederaufbau, Raumliste, Beitreten per Code oder Link, die
Lobby mit Sitzen und Bereit-Knopf, das Umschalten der vier Bildschirme, Toast
und Hilfe-Dialog.

Ein Spiel ruft `starteSchale({ key, zeichneSpiel })` auf und schreibt nur noch
seinen eigenen Spielbildschirm. Optional: `zeichneRaum` (eigene Host-
Einstellungen in `#hostExtra`), `zeichneFinal` (sonst Tabelle aus
`{name, wert}`), `sonstige` (unbekannte Nachrichten), `raumOptionen`
(Zusatzfelder für `create`).

Wie bei den anderen Teilen gilt: **kopiert, nicht importiert.** Jedes Spiel
behält seine vollständige Kopie und läuft auch ohne `gemeinsam/` weiter.
