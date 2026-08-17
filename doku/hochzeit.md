# Die Hochzeitsseite

`https://inf-zeus.de/hochzeit/` – Bildergalerie, Upload für Gäste, Gästebuch.
**Kein Spiel.** Steht deshalb nicht in `spiele.json` unter `spiele`, hat keine
Kachel auf `spiele/` und wird von nirgends verlinkt. Der Port ist unter
`portsFremd` vermerkt, damit ihn niemand zweimal vergibt.

| | |
|---|---|
| Ordner | `/var/www/html/hochzeit` |
| Port | 8081 |
| Dienst | `systemctl restart hochzeit` |
| Apache | `/etc/apache2/conf-available/hochzeit.conf` |
| Probe | `BASIS=https://inf-zeus.de/hochzeit deno task probe` |
| Repo | keins, und das mit Absicht (siehe unten) |

## Texte ändern

**Alles Geschriebene steht in `texte.js`** – Grußwort auf Deutsch und
Türkisch, Namen, Datum, jede Beschriftung. Das HTML enthält nur Platzhalter
(`{{de.grusswort|absaetze}}`), die der Server beim Ausliefern einsetzt. Nach
einer Änderung:

```bash
systemctl restart hochzeit
```

Der türkische Text ist ein Entwurf und sollte von jemandem gegengelesen
werden, für den Türkisch Muttersprache ist.

## Zugang

Zwei Wörter in `daten/zugang.json`:

* **`gast`** – für die Gäste. Darf im Link stehen:
  `https://inf-zeus.de/hochzeit/?k=WORT` lässt ohne Tippen herein und setzt
  ein Cookie für ein Jahr. Genau dafür ist es da: die Gäste sind zum Teil
  älter und am Handy, und ein Anmeldefenster ist die Hürde, an der sie
  aufgeben.
* **`admin`** – für das Brautpaar. Schaltet in der Galerie das Einsortieren,
  Ausblenden und Löschen frei und erlaubt, beim Upload eine Kategorie zu
  wählen. Derselbe `?k=`-Weg.

Nach dem Ändern der Datei: Dienst neu starten.

### Die Rolle wechseln

Der `?k=`-Link wirkt **auch dann, wenn schon ein Zugang besteht** – wer als
Gast angemeldet ist und den Verwaltungslink antippt, wechselt damit die
Rolle. Cookies löschen ist nie nötig. Alternativ führt der Link im Fuß jeder
Seite („Anderes Zugangswort eingeben") auf `/hochzeit/zugang`, das auch im
angemeldeten Zustand offensteht und anzeigt, als was man gerade unterwegs
ist.

Das war anfangs falsch: die Bedingung lautete „nur wenn noch keine Rolle
gesetzt ist", wodurch der Verwaltungslink im Browser des Brautpaars
wirkungslos blieb. Der Prüflauf deckt den Wechsel seitdem ab.

Das ist bewusst keine ernsthafte Zugangskontrolle, sondern eine Tür, die zu
ist. Der eigentliche Schutz gegen Suchmaschinen ist die Kopfzeile
`X-Robots-Tag: noindex`, die auf **jeder** Antwort steht – auch auf den
Bildern selbst.

### Warum kein `Disallow` in einer robots.txt

Weil es das Gegenteil bewirkt. Ein `Disallow` verbietet das *Crawlen*, nicht
das *Indizieren*: Google darf eine so gesperrte Adresse weiterhin als
nackten Treffer listen, wenn sie irgendwo verlinkt wird – und kann die
`noindex`-Kopfzeile dann nicht einmal lesen, weil es die Seite ja nicht
abrufen darf. `noindex` ohne `Disallow` ist die schärfere Sperre. Dazu kommt,
dass eine robots.txt im Wurzelverzeichnis die Adresse überhaupt erst
öffentlich nennen würde.

## Auswahl und Archiv

Die Galerie hat zwei Ansichten desselben Bestands:

* **Unsere Auswahl** – was das Brautpaar von Hand ausgewählt hat. Das ist die
  Ansicht, in der Gäste landen.
* **Archiv – alle Bilder** – alles, was je hochgeladen wurde, auch die
  weichgerechneten WhatsApp-Bilder.

Der Grund für die Trennung: die schönen Aufnahmen sollen nicht zwischen
zweihundert Schnappschüssen untergehen, und trotzdem darf nichts verloren
gehen.

Technisch ist das ein Kennzeichen `ausgewaehlt` je Bild, **quer zu den
Kategorien** – ein Bild hat eine Kategorie *und* kann ausgewählt sein.
Hochgeladenes landet immer zuerst im Archiv.

**Solange nichts ausgewählt ist, zeigt auch die vordere Galerie alles**, und
der Umschalter erscheint gar nicht. Sonst stünden die Gäste vor einer leeren
Seite, bis jemand angefangen hat auszusortieren.

### Auswählen

Mit dem Verwaltungswort angemeldet, steht oben in der Galerie der Knopf
**„★ Bilder für die Galerie auswählen"**. Solange er aktiv ist, markiert ein
Klick auf eine Kachel das Bild, statt die Großansicht zu öffnen – bei
zweihundert Bildern ist das der Unterschied zwischen einer Viertelstunde und
einem Abend. Einzeln geht es auch jederzeit über den Stern oben rechts auf
jeder Kachel.

Sinnvoller Weg: in die Ansicht **Archiv** wechseln, dort durchgehen und die
schönen mit einem Klick nach vorne holen.

Für die Sammel-Downloads entsteht dadurch ein zusätzliches Paket
(`auswahl`), das nur die ausgewählten Bilder enthält, und es steht in der
Liste ganz oben – für die meisten Gäste ist es das, was sie eigentlich
wollen.

## Wie die Bilder liegen

```
medien/original/   unangetastet, so wie hochgeladen
medien/gross/      längste Kante 1800px – Großansicht, Handy-Sammelpaket
medien/klein/      längste Kante 500px – die Kacheln
medien/poster/     Standbild aus jedem Video
medien/video/      H.264-Fassung, die jeder Browser abspielt
daten/medien.json  der Index: was gehört wohin, welche Maße, von wem
```

Alles außer `original/` ist jederzeit neu erzeugbar. Geht bei den Ableitungen
etwas schief, können die vier Ordner gelöscht werden; die Originale bleiben.

Hochgeladenes wird **nacheinander** verarbeitet, nicht parallel – zwei
gleichzeitige ffmpeg-Läufe würden die Spiele auf demselben Server spürbar
ausbremsen.

## Sammelpakete

ZIPs werden beim ersten Klick gebaut und liegen danach unter `pakete/`.
Kommen Bilder dazu, ändert sich die Bestandsmarke im Dateinamen und das alte
Paket wird beim nächsten Abruf ersetzt und weggeräumt.

Gepackt wird mit `zip -0`, also **ohne** Kompression: JPEG und MP4 sind schon
komprimiert, ein Deflate-Lauf über mehrere hundert MB kostet Minuten und
spart unter einem Prozent. Die Dateien werden per Hardlink in einen
Bauordner gelegt – dadurch kostet das Packen keinen zusätzlichen Plattenplatz
für die Rohdaten.

## Warum kein Repo

Der Ordner enthält Hochzeitsbilder, das Gästebuch und die Zugangswörter.
Nichts davon gehört in eine Versionsverwaltung, und ein Repo, das nur den
Quelltext enthält, wäre ein zweiter Ort, an dem der Stand auseinanderlaufen
kann. Gesichert wird der Ordner über das Dateisystem.

Die `.gitignore` im Ordner schließt `medien/`, `pakete/` und `daten/` aus –
falls doch einmal ein Repo daraus wird, ist das die richtige Ausgangslage.

## Übersetzen im Gästebuch

Jeder Eintrag hat einen Knopf, der ihn in die jeweils andere Sprache
überträgt. Voreingestellt ist **MyMemory**: kein Schlüssel, kein Konto, aber
ein Tageskontingent, das an der IP des Servers hängt. Ergebnisse werden in
`daten/uebersetzungen.json` gespeichert, jeder Text also höchstens einmal
angefragt.

Wenn das Kontingent stört: einen DeepL-Schlüssel in `daten/zugang.json` unter
`deepl` eintragen, Dienst neu starten – `uebersetzer.js` nimmt ihn dann
automatisch. Fällt der Dienst aus, bleibt das Gästebuch benutzbar; nur der
Knopf meldet, dass es gerade nicht geht.

Die Texte der Seite selbst werden **nicht** maschinell übersetzt. Die stehen
von Hand in beiden Sprachen in `texte.js`.

## Was beim Upload passiert

Der Browser schneidet jede Datei in 4-MB-Stücke und schickt sie einzeln.
Bricht die Verbindung ab, fragt er den Server, wie viel angekommen ist, und
setzt dort auf. Das ist der Grund, warum ein 400-MB-Video vom Handy über
Mobilfunk überhaupt eine Chance hat – ein einzelner großer POST scheitert
genau daran und beginnt danach wieder bei null.

Grenzen: 3 GB je Datei. Gäste laden immer nach `gaeste`; nur wer mit dem
Verwaltungswort angemeldet ist, kann beim Upload eine andere Kategorie
wählen oder Bilder nachträglich umsortieren.

### Die stille Minute nach dem Auswählen

Wer im Dateimanager 150 Bilder bestätigt, wartet danach – auf dem Handy oft
minutenlang. In dieser Zeit packt das Betriebssystem HEIC aus, holt Bilder aus
der iCloud und kopiert sie; das `change`-Ereignis kommt erst ganz am Ende. Die
Seite **kann davon nichts wissen** und stand deshalb stumm da. Genau da tippt
man ein zweites Mal oder gibt auf.

Beheben lässt sich die Wartezeit nicht, nur das Schweigen. Ab dem Antippen von
„Auswählen“ läuft deshalb ein Kasten mit Uhr: *Das Gerät bereitet die Bilder
vor … (37 s)*. Nach zwanzig Sekunden kommt die Bitte, nicht noch einmal zu
tippen, nach anderthalb Minuten der Rat, abzubrechen und in Gruppen von etwa
dreißig zu arbeiten – die Liste sammelt sich über mehrere Auswahlvorgänge,
mehrmals auswählen ist also kein Umweg. Ein Knopf beendet das Warten von Hand,
falls im Dateimanager doch abgebrochen wurde und der Browser das
`cancel`-Ereignis des Datei-Feldes nicht kennt.

Drei weitere Dinge hingen an demselben Fall:

* Die Liste wird in **Riegeln zu 25** aufgebaut, nicht in einem Zug – 150
  Zeilen am Stück lassen ein älteres Handy sekundenlang stehen, und das sieht
  wieder aus wie „es passiert nichts“.
* Der Knopf **Hochladen** und der Gesamtstand stehen jetzt **über** der Liste.
  Vorher lagen sie hinter hundertfünfzig Zeilen, also außer Sicht.
* Dieselben Dateien noch einmal auszuwählen legt **keine Dubletten** an
  (Name + Größe + Änderungszeit) – das passiert zwangsläufig, wenn man beim
  ersten Mal glaubt, es habe nicht geklappt.

Während des Laufs hängt sich die Gesamtzeile an den unteren Bildschirmrand:
*Datei 12 von 150 · 340 MB von 2,1 GB*. Sonst sieht man beim Scrollen durch
die Liste nicht, wie weit das Ganze insgesamt ist.

Nachgewiesen wird das mit `werkzeug/pruefe-hochzeit-upload.mjs`: Die Probe
hält den Dateimanager absichtlich sieben Sekunden offen und liest, was in der
Zeit auf der Seite steht. Der zweite Teil lädt sechs 9-MB-Dateien wirklich
hoch, aber gegen einen abgefangenen Server – so bleibt die Galerie sauber.
