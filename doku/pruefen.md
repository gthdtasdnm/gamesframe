# Prüfen

**Ohne grünen Lauf gilt nichts als fertig.**

```bash
# Server-Spiele: gegen die Live-Fassung
cd /var/www/html/<spiel>
DENO_DIR=/tmp/deno-check WS_URL=wss://inf-zeus.de/<spiel>/ws deno task probe

# Spiele ohne Server: reine Rechenprobe, kein Browser
cd /var/www/html/<minenfeld|sudoku|patience> && deno task probe

# Und dann doch im Browser, weil eine Rechenprobe keine Seite aufbaut
cd /root/werkzeug-screenshots && node pruefe-statisch.mjs

# Gemeinsame Teile noch überall gleich?
cd /var/www/html && node werkzeug/verteilen.mjs --pruefen

# Startseite und Einzelheiten, die man sehen muss: im echten Browser
cd /root/werkzeug-screenshots
node pruefe-startseite.mjs     # alle Kacheln, alle Dialoge, alle Bilder
node pruefe-flasche.mjs        # zeigt die Flasche wirklich auf die Person?
node pruefe-cubes.mjs          # steht in jedem Quadrat die richtige Zahl?
node pruefe-wortleger.mjs      # trifft man 13 Spalten auf einem Handy?
node pruefe-statisch.mjs       # bauen sich die vier Spiele ohne Server auf?
```

Ausgeführt werden sie in `/root/werkzeug-screenshots/` – dort liegen
`node_modules` mit Playwright. **Versioniert sind bisher nur `pruefe-wortleger.mjs` und
`pruefe-statisch.mjs`** (in `werkzeug/`, wie `aufnehmen.mjs`); die drei
älteren liegen ausschließlich in `/root` und wären bei einem Plattenschaden
weg. Steht in `RISIKEN-TODO.md`. Wer eine ändert, kopiert sie wie
`aufnehmen.mjs` nach `werkzeug/` zurück:

```bash
cp /root/werkzeug-screenshots/pruefe-wortleger.mjs /var/www/html/werkzeug/
```

`probe.js` ist kein Testrahmen: ein Skript, das wirft, wenn etwas nicht stimmt,
und sonst mitschreibt, was passiert ist. Es prüft Geheimhaltung (wer darf was
sehen), Rechte (wer darf was auslösen), Zähler und den Ausfall einzelner
Spieler. Der letzte Punkt ist seit `raum.js` besonders wichtig: er läuft durch
`beimVerlassen`, `nachVerlassen` und `beimPlatzfrei`.

**Wortleger** geht einen Schritt weiter: weil die Steine zufällig sind, kann
die Probe keinen bestimmten Zug ansagen. Sie sucht sich mit derselben `zug.js`,
die auch der Server benutzt, einen gültigen Zug – und prüft damit genau das,
worauf es ankommt: was die gemeinsame Logik erlaubt, muss der Server annehmen,
und was sie verbietet, muss er ablehnen. Der erste Teil der Probe läuft ganz
ohne Server und rechnet jede Punktzahl von Hand nach.

Kein `probe.js` haben **Seconds** und **Lucky Reflex**. Solange das so ist,
werden die beiden nicht umgebaut – es fehlt der Nachweis.

## Die zwölf vom 09.08. haben jetzt auch eine

Nachgezogen am 09.08.2026 abends. Bei allen acht Server-Spielen nach demselben
Muster, und bei allen mit demselben Trick gegen den Zufall: **was der Server
rechnet, rechnet die Probe mit derselben Datei nach.** Dafür sind aus den
Servern eigene Regeldateien herausgelöst worden – `karten.js` (Schwimmen),
`regeln.js` (Mau-Mau, Kings Cup hatte schon eine), `blatt.js` (Lügen),
`gebote.js` (Becherbluff). Der erste Teil jeder Probe läuft dadurch ganz ohne
Server.

Die vier Spiele ohne Server prüfen dasselbe eine Stufe tiefer: `raetsel.js`
(Sudoku), `feld.js` (Minenfeld), `regeln.js` (Patience) sind aus `app.js`
herausgelöst, damit `deno task probe` sie ohne Browser rechnen lassen kann.
Wortgitter hat keine Probe – dort ist die Wortliste erzeugt und wird von
`pruefe-wortleger.mjs` mitgeprüft.

Sechs echte Fehler hat das Schreiben der Proben gefunden, alle behoben:

- **Nachtwache:** endete die Partie in der Nacht, ging der Bericht dieser Nacht
  verloren – wer gestorben war und woran, erfuhr niemand.
- **Lügen:** eine leergespielte Partie endete nie. Der Letzte legte sich selbst
  weiter zu, und niemand konnte ihn stoppen.
- **Becherbluff:** die Aufdeckung wurde erst gebaut, nachdem dem Verlierer der
  Würfel genommen war – die Zahl daneben passte nicht zum Bild.
- **Paare:** abgeräumte Karten galten weiter als offen.
- **Kings Cup:** zweimal auf Ziehen tippen zog zwei Karten, die erste sah
  niemand.
- **Patience:** `neu()` hielt die alte Uhr erst an, als sie schon nicht mehr
  erreichbar war.

**Snake misst mit.** Bei sechs Spielern – der vollen Besetzung und damit dem
teuersten Fall – sind es rund 7 KB/s je Spieler bei 7,7 Nachrichten/s. Die
Probe wirft ab 25 KB/s. Das ist die Lehre aus Cubes, wo 148 KB/s je Spieler
erst im Betrieb aufgefallen sind.

**Bedenkzeit prüfen dauert sonst zu lange.** Paare und Kings Cup haben seit dem
09.08. eine Frist je Zug. Ihre Proben starten dafür einen eigenen Server auf
einem freien Port mit `ZUG_MS=1500` und sehen dem Ablauf wirklich zu. Gegen
live (`WS_URL` gesetzt) fällt dieser Teil aus – dort steht die Frist auf ihrem
echten Wert.

## Der Browserlauf ist kein Luxus

Vier echte Fehler sind nur dort aufgefallen, nie in der Probe. Zwei davon
stammen aus Reaktion und Kurven, die es seit dem 09.08.2026 nicht mehr gibt –
sie stehen trotzdem hier, denn der Grund für den Browserlauf gilt unverändert:

- **Reaktion:** verpasste niemand das grüne Signal, endete die Runde nie.
- **Flaschendrehen:** der Client hatte einen `-90`-Versatz; Namen, Markierung
  und Probe waren richtig, und die Flasche zeigte trotzdem eine Vierteldrehung
  daneben.
- **Kurven:** der gemeinsame Punktestand überlappte die Steuerleiste.
- **Wortleger:** die Zahl im Bonusfeld war auf einem 390-Pixel-Handy 8,7 px
  groß. Server und Probe waren grün – Schriftgrößen kommen dort schlicht nicht
  vor. Gefunden hat es `pruefe-wortleger.mjs`, das absichtlich in Handygröße
  läuft und Untergrenzen für Feldbreite und Schriftgröße misst, statt nur zu
  fragen, ob etwas da ist.
- **Cubes:** ein `+1` in Runde 3 wurde ohne Zahl gezeichnet. Die Beschriftung
  hing am Wert („1 zeigt nichts") statt an der Rundenart. In Runde 3 ist die
  Zahl aber das Einzige, was ein Plus- von einem Minusfeld unterscheidet – die
  beiden sehen absichtlich gleich aus. Server und Probe waren die ganze Zeit
  grün.

Vorsicht bei eigenen Prüfskripten: `.overlay` ohne `.an` ist `display:none` –
auf „sichtbar" zu warten geht nie auf. Stattdessen `{ state: 'hidden' }`. Und
Ergebnisse nicht durch `| tail` schicken, sonst maskiert der Exitcode von
`tail` einen Fehlschlag.

## Vorschaubilder

Echte Bildschirmfotos laufender Partien, keine Zeichnungen.

```bash
cp /var/www/html/werkzeug/aufnehmen.mjs /root/werkzeug-screenshots/
cd /root/werkzeug-screenshots
node aufnehmen.mjs <spiel>     # ohne Argument: alle
```

Danach die Datei aus `/root/werkzeug-screenshots/` **zurück** nach `werkzeug/`
kopieren, wenn sie sich geändert hat – nur dort ist sie versioniert.

Ein Bild muss die Mechanik **zeigen**. Beispiele, wo das Arbeit war: bei
Mäxchen wird so lange weitergewürfelt, bis ein gemischter Wurf fällt (bei einem
Mäxchen ist alles grün und die Bildunterschrift widerlegt sich selbst); bei
Wer am ehesten werden die Stimmen absichtlich ungleich verteilt; bei Imposter
wird die Seite eines **Nicht**-Imposters geknipst.

Die Bilder landen als WebP in `spiele/bilder/`. Voraussetzungen auf dem Server:
Playwright samt Chromium (**nicht** `--with-deps`, das kaputte MongoDB-Repo
lässt jedes `apt update` scheitern) und die Emoji-Schrift unter
`/usr/local/share/fonts/emoji/`.
