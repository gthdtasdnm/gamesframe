# ZWEI – `/dating/` (kein Spiel, nicht verlinkt)

Angelegt am 19.08.2026. Ein Speed-Dating-Abend, der die **bestehenden Spiele
benutzt**, statt eigene mitzubringen. Läuft als eigener Dienst auf Port 8085,
Termin ist **täglich 20:00 Uhr Europe/Berlin**.

Drei Dateien, drei Zwecke – wer dort arbeitet, braucht meist nur die erste:

* **`dating/CLAUDE.md`** – der schnelle Einstieg: wo was steht, das Protokoll,
  die Fallen, die Befehle. Reicht, um eine Änderung anzufangen, ohne
  `server.js` zu lesen.
* **`dating/README.md`** – das Warum: wogegen es gebaut ist, wie der Abend
  läuft, warum die Regeln so sind.
* **diese Datei** – nur, was der Seitenrahmen davon wissen muss.

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

**Der Eintrag führt bewusst kein `lobbyCss` und kein `rahmenCss`.** `/dating/`
hat ein eigenes, dunkelrotes Aussehen ohne Neon; stünden die beiden dort,
schriebe `verteilen.mjs` beim nächsten Lauf das Aussehen der Spieleseite
zurück. Wer dort etwas ergänzt, ändert damit das Aussehen — nicht nur die
Pflege.

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

**Die Folge fürs Betriebsbild:** in zehn Spielen entstehen abends private
Räume, deren Host `Zwei` heißt und der sofort wieder weg ist. Das ist kein
Fehler. Die Bremse der Spiele lässt zwölf Räume je zehn Minuten und IP zu; alle
Bestellungen kommen von 127.0.0.1, aber je Spiel höchstens eine je Abend (ein
Spiel gehört genau einem Mann).

Welche zehn und warum: `dating/spiele.js`. Kurz — es müssen drei Dinge
zusammenkommen: zu zweit spielbar (`MIN_PLAYERS ≤ 2`), Raum von außen
bestellbar, und der Browser kommt ohne Klick hinein. Seconds und Lucky Reflex
scheitern am dritten Punkt.

## Das Einzige, was dieser Dienst schreibt

`dating/daten/reservierungen.json` — Vorname, Seite und Token der Leute, die
sich für **heute Abend** eingetragen haben. Ohne das wäre eine Reservierung
wertlos: man trägt sich morgens ein und kommt abends wieder. Nach dem Abend
wird die Liste geleert; Chat und Paare werden nie geschrieben.

Daraus folgt für die Unit: `--allow-write=/var/www/html/dating/daten` und
`ReadWritePaths` — dieselbe Behandlung wie die Ameisenbaue, aus demselben
Grund, und mit demselben Kniff (erst daneben schreiben, dann umbenennen).

Der Ordner liegt **nicht** im `public/`-Baum, den `statisch.js` ausliefert, und
Apache kommt bei `/dating/` gar nicht ans Dateisystem. Er ist damit von außen
nicht erreichbar, ohne dass `.htaccess` etwas dazu sagen müsste.

**Die Tafel von Hand leeren** (es gibt keinen Knopf dafür):

```bash
systemctl stop dating
python3 -c 'import json;p="/var/www/html/dating/daten/reservierungen.json";d=json.load(open(p));d["m"]=[];d["w"]=[];json.dump(d,open(p,"w"))'
chown www-data:www-data /var/www/html/dating/daten/reservierungen.json
systemctl start dating
```

## Geheimhaltung

Drei Reihen, keine davon eine Sperre:

1. Nirgends verlinkt (Startseite, `/spiele/`, README, Bugreport).
2. `noindex, nofollow, noarchive` als `X-Robots-Tag` im Apache-Block **und** als
   `<meta name="robots">` in der Seite.
3. Kein Eintrag unter `spiele` in `spiele.json`.

**Wer den Link hat, kommt hinein** — es gibt kein Zugangswort, anders als bei
`/hochzeit/`. Und wer hineinkommt, sieht die Vornamen aller, die für heute
Abend reserviert haben. Soll das anders werden, ist der Weg dorthin derselbe
wie bei der Hochzeitsseite (siehe `doku/hochzeit.md`).

## Prüfen

```bash
cd /var/www/html/dating
WS_URL=wss://inf-zeus.de/dating/ws deno task probe   # gegen live: nur die Tuer
deno task spielprobe                                  # alle zehn Spiele
cd /root/werkzeug-screenshots && node pruefe-dating.mjs
```

Die volle Abendprobe braucht eine **eigene Fassung** mit verkürzten Zeiten und
einem eigenen `DATEN_DIR` — ein Abend verbraucht die Leute, die sich für heute
eingetragen haben, und ohne eigenen Datenordner schriebe die Probe ihnen ihre
Namen weg. Gegen live sagt `probe.js` beides ausdrücklich ab, statt es stumm zu
überspringen (dieselbe Regel wie bei Ameisen). Der Befehl steht in
`dating/README.md`.

`pruefe-dating.mjs` läuft dagegen **gegen live**, über die Übungsrunde: die
fängt sofort an und nimmt niemandem seinen Platz. Sie ist die einzige Probe,
die die iframe-Übergabe wirklich nachweist — der Server sagt nur „Raum K7QF in
Becherbluff“, ob der iframe daraufhin in genau dieser Lobby steht, sieht man
nur im Browser. Ihre Reservierung legt sie an **und sagt sie wieder ab**, damit
auf der echten Tafel kein Probename stehen bleibt.

## Was fehlt

Steht in `dating/README.md` unter „Was noch offen ist“. Das Wichtigste: es gibt
keinen Missbrauchsschutz über die Bremse hinaus — kein Melden, kein Sperren,
keine Altersprüfung. Solange die Adresse nicht kursiert, ist das vertretbar.
Vor einer Veröffentlichung ist es das nicht.
