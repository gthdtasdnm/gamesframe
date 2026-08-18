# Was oben steht – und warum es dort bleibt

Auf `/spiele/` steht seit dem 18.08.2026 eine Kategorie **„Am meisten
gespielt"** ganz oben. Wer dort steht, entscheidet nicht der Geschmack des
Tages, sondern eine gezählte Zahl mit ein paar Bremsen davor.

## Die zwei Werkzeuge

| Was | Wo |
|---|---|
| Aufrufe aus den Apache-Protokollen fortschreiben, Tabelle zeigen | `werkzeug/zaehlen.mjs` |
| Daraus die Reihenfolge setzen und in die Seite schreiben | `werkzeug/rangfolge.mjs` |
| Der gezählte Stand (tageweise, **nicht im Repo**) | `werkzeug/daten/spielzahlen.json` |
| Wer seit wann oben steht (**nicht im Repo**) | `werkzeug/daten/rangstand.json` |

```bash
cd /var/www/html
node werkzeug/zaehlen.mjs              # einlesen und Tabelle zeigen
node werkzeug/zaehlen.mjs --zeigen     # nur zeigen, nichts anfassen
node werkzeug/rangfolge.mjs --probe    # was würde passieren?
node werkzeug/rangfolge.mjs --jetzt    # die Wochensperre überspringen
```

Beides läuft täglich um 03:20 aus dem Cron von root (`crontab -l`). Das
Protokoll dazu steht in `/var/log/spielzahlen.log`.

## Wie gezählt wird

Aus den Apache-Protokollen, nicht in den Spielen. Der Grund steht oben in
`zaehlen.mjs`: sechsundzwanzig Spiele, vier davon ganz ohne Server – ein
Zähler *im* Spiel müsste in sechsundzwanzig Repos gepflegt werden, ein
gemeinsamer Zähldienst wäre eine Abhängigkeit, die alle Spiele teilen. Genau
das soll es hier nicht geben.

Gezählt wird `GET /<spiel>/` mit Status 200 oder 304. Nicht gezählt werden:

- **HEAD** – das sind die Statuspunkte auf `/spiele/`, keine Leute.
- Bots, Crawler und der eigene Playwright (`HeadlessChrome`). Sonst wäre das
  meistgespielte Spiel immer das, an dem gerade gearbeitet wird.
- Der zweite, dritte, zehnte Aufruf derselben IP im selben Spiel in derselben
  **Stunde**. Wer während einer Partie neu lädt, ist eine Person.

Das ist keine Besucherstatistik und will keine sein – es ist eine
Reihenfolge. Mehr braucht `/spiele/` nicht.

**Die Protokolle halten nur vierzehn Tage vor.** Alles davor lebt nur noch in
`spielzahlen.json`. Fällt der tägliche Lauf länger als zwei Wochen aus, ist
die Lücke endgültig.

## Die Hürden

Eine Rangliste, die jeden Tag umspringt, ist keine. Deshalb steht zwischen den
Zahlen und der Seite absichtlich Reibung – alle Stellschrauben stehen oben in
`rangfolge.mjs`:

| Schraube | Wert | Wirkt so |
|---|---|---|
| `PLAETZE` | 4 | zwei Reihen zu zwei Kacheln |
| `FENSTER` | 28 Tage | ein guter Abend hebt niemanden |
| `ABSTAND` | 7 Tage | öfter wird gar nicht erst gerechnet |
| `MINDEST` | 10 Aufrufe | drei gegen zwei ist Zufall, nicht Beliebtheit |
| `VORSPRUNG` | 1,30 | wer rein will, braucht 30 % mehr als der Schwächste oben |
| `RUHE` | 21 Tage | wer gerade gewechselt hat, ist gesperrt – sonst pendelt dasselbe Paar |
| `FEST` | `keep`, `cardchaos` | gesetzt auf Platz 1 und 2 |

`FEST` ist eine **Entscheidung, keine Messung**. Die Zahlen decken sie
gerade – beide führen die Liste ohnehin an –, aber sie stünden auch dann
oben, wenn das kippt. Wer das nicht mehr will, leert `FEST`; dann rechnet das
Skript alle vier Plätze aus.

## Was das Skript an der Seite ändert

`rangfolge.mjs` schreibt **in `spiele/index.html`**, nicht in ein JSON, das
der Browser nachlädt. Die Kacheln bleiben damit statisches HTML und stehen
auch ohne JavaScript richtig (`doku/startseite.md`).

Umgezogen wird die Kachel selbst, unverändert bis auf zwei Angaben, die das
Skript ihr beim ersten Mal anheftet:

```html
<article class="game" … data-spiel="keep" data-heimat="gruppe-tempo" data-platz="4" …>
```

`data-heimat` und `data-platz` sind der Rückweg: fällt Keep aus der Liste, geht
es genau dorthin zurück, wo es herkam. **Diese beiden Angaben nie von Hand
entfernen** – ohne sie weiß das Skript nicht mehr, wohin mit der Kachel, und
bricht ab.

Die Suche liest `data-heimat` mit. Ohne das fände „tempo" Keep nicht mehr, nur
weil es gerade oben steht; `pruefe-startseite.mjs` prüft genau das.

Jeder Umbau ist abgesichert: das Skript zählt vorher und nachher die Kacheln
und schreibt gar nichts, wenn eine fehlt, doppelt wäre oder eine Kategorie leer
zurückbliebe.

## Nach einem Wechsel

Der Cron-Lauf ändert eine Datei, die im Repo liegt. Nach einem Wechsel steht
`spiele/index.html` also in `git status` – **das ist kein Fehler, das ist das
Ergebnis.** Prüfen und mitnehmen:

```bash
cd /var/www/html
git diff --stat spiele/index.html
cp werkzeug/pruefe-startseite.mjs /root/werkzeug-screenshots/
cd /root/werkzeug-screenshots && node pruefe-startseite.mjs
```

## Ein neues Spiel dazu

Nichts zu tun. Es steht ab dem ersten Aufruf in der Zählung und kann nach
`MINDEST` Aufrufen und der nächsten Wochenrechnung nach oben. Bis dahin steht
es in seiner Kategorie – und das ist auch die Kategorie, in die es
zurückfällt.
