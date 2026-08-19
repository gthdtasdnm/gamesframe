# ZWEI – `/dating/` (kein Spiel, nicht verlinkt)

Angelegt am 19.08.2026. Ein Speed-Dating-Ablauf, der die **bestehenden Spiele
benutzt**, statt eigene mitzubringen. Läuft als eigener Dienst auf Port 8085.

Die ausführliche Beschreibung steht in `dating/README.md` und geht mit dem
eigenen Repo. Hier steht nur, was der Seitenrahmen davon wissen muss.

## Warum es nicht in `spiele.json` unter `spiele` steht

Es ist kein Spiel und soll **geheim bleiben** — kein Eintrag dort heißt: keine
Kachel auf `/spiele/`, kein Eintrag im Bugreport-Auswahlfeld, keine Zeile in
`jq '.spiele[].name'`. Es soll ausschließlich über den Link erreichbar sein.

Damit trotzdem niemand die Kopien von `bremse.js` und `statisch.js` vergisst,
gibt es in `spiele.json` seit dem 19.08.2026 den Schlüssel **`still`**:
dieselbe Form wie ein Spieleintrag, aber nur `werkzeug/verteilen.mjs` liest ihn
(eine Zeile: `[...registry.spiele, ...(registry.still ?? [])]`). Wer ein
weiteres nicht-öffentliches Ding baut, trägt es dort ein und sonst nirgends.

```bash
node werkzeug/verteilen.mjs --nur dating
node werkzeug/verteilen.mjs --pruefen        # zaehlt dating mit
```

## Was es an den Spielen tut – und was ausdrücklich nicht

**Nicht angefasst wurde keins.** Der Dienst benutzt nur, was jedes Lobbyspiel
ohnehin kann:

* Er öffnet eine WebSocket-Verbindung nach `127.0.0.1:<port>/ws`, schickt
  `{t:"create", isPublic:false}`, merkt sich den Code und legt auf. Der Raum
  steht danach `ROOM_IDLE_MS` = fünf Minuten leer weiter — das ist die
  Link-Teilen-Karenz, die alle sechzehn Spiele haben.
* Der Browser bekommt den Code und legt den Spielen ihren jeweiligen
  `localStorage`-Sitz hin, damit der iframe **ohne Klick** in die Lobby geht.
  Beide Bauarten stehen im Kopf von `dating/spiele.js`.

**Die Folge fürs Betriebsbild:** in zehn Spielen entstehen von Zeit zu Zeit
private Räume, deren Host `Zwei` heißt und der sofort wieder weg ist. Das ist
kein Fehler. Die Bremse der Spiele lässt zwölf Räume je zehn Minuten und IP zu;
alle Bestellungen kommen von 127.0.0.1, aber je Spiel höchstens eine je Sitzung
(ein Spiel gehört genau einem Mann).

Welche zehn und warum: `dating/spiele.js`. Kurz — es müssen drei Dinge
zusammenkommen: zu zweit spielbar (`MIN_PLAYERS ≤ 2`), Raum von außen
bestellbar, und der Browser kommt ohne Klick hinein. Seconds und Lucky Reflex
scheitern am dritten Punkt.

## Geheimhaltung

Drei Reihen, keine davon eine Sperre:

1. Nirgends verlinkt (Startseite, `/spiele/`, README, Bugreport).
2. `noindex, nofollow, noarchive` als `X-Robots-Tag` im Apache-Block **und** als
   `<meta name="robots">` in der Seite.
3. Kein Eintrag unter `spiele` in `spiele.json`.

**Wer den Link hat, kommt hinein.** Es gibt kein Zugangswort — anders als bei
`/hochzeit/`. Soll das anders werden, ist der Weg dorthin derselbe wie dort
(siehe `doku/hochzeit.md`).

## Prüfen

```bash
cd /var/www/html/dating
WS_URL=wss://inf-zeus.de/dating/ws deno task probe   # gegen live: nur die Tuer
deno task spielprobe                                  # alle zehn Spiele
cd /root/werkzeug-screenshots && node pruefe-dating.mjs
```

Die volle Sitzungsprobe braucht eine **eigene Fassung** mit verkürzten Zeiten —
eine Sitzung verbraucht die Wartenden, und live sind das echte Leute. Gegen live
sagt `probe.js` den Sitzungsteil deshalb ausdrücklich ab, statt ihn stumm zu
überspringen (dieselbe Regel wie bei Ameisen). Der Befehl steht in
`dating/README.md`.

`pruefe-dating.mjs` läuft dagegen **gegen live**, über die Übungsrunde: die
fängt sofort an und verbraucht niemanden. Sie ist die einzige Probe, die die
iframe-Übergabe wirklich nachweist — der Server sagt nur „Raum K7QF in Paare",
ob der iframe daraufhin in genau dieser Lobby steht, sieht man nur im Browser.

## Was fehlt

Steht in `dating/README.md` unter „Was noch offen ist". Das Wichtigste: es gibt
keinen Missbrauchsschutz über die Bremse hinaus — kein Melden, kein Sperren,
keine Altersprüfung. Solange die Adresse nicht kursiert, ist das vertretbar.
Vor einer Veröffentlichung ist es das nicht.
