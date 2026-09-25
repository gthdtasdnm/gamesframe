# Lader (`/downloader/`) – yt-dlp hinter einer Weboberfläche

Kein Spiel. Keine Kachel. `noindex`. **Passwortgeschützt** – dieselbe
`htpasswd` wie die beiden Tradingbots. Nur für den Betreiber.

Angelegt am 21.09.2026. Umgebaut am 25.09.2026: **Parken** (anschmeißen, drei
Tage später holen), eine **Kostenschätzung vor dem Druck**, eine laufend
nachgezogene **Restzeit**, Pausen und Wiederversuch gegen die Bot-Sperre – und
**kein ZIP mehr**, das war die Bremse.

## Was es tut

Eine Adresse einwerfen – es wird **von selbst** nachgesehen, was dahintersteckt.
Dann steht da, was es ist und was es kosten wird, mit einer geschätzten Größe an
jedem Formatknopf. Erst der Knopf darunter stößt etwas an. MP3 oder Video in
360p (Vorgabe), 480p, 720p oder 1080p. Erkennt YouTube-Playlists und
Kanalseiten und legt sie zum Ankreuzen vor.

Zwei Betriebsarten, und das ist der eigentliche Umbau vom 25.09.2026:

* **Parken** – anschmeißen, Seite zumachen, später wiederkommen. Nichts wird
  von selbst gespeichert, die Dateien warten **drei Tage**. Die Vorgabe bei
  allem, was länger dauert als ein Kaffee.
* **Sofort speichern** – jedes fertige Stück wird gleich angestoßen, eines nach
  dem anderen, während der Rest noch lädt.

**Kein ZIP.** Jede Datei einzeln – siehe „Warum das ZIP weg ist".

Weil darunter `yt-dlp` steckt, geht es nicht nur um YouTube – rund tausend
Seiten funktionieren genauso. Bei fremden Seiten greift die Auflösungswahl
allerdings oft nicht sauber; dann kommt, was es gibt.

## Wo was liegt

```
/var/www/html/downloader/
  server.js          HTTP, Dateien ausliefern, Schnittstelle
  warteschlange.js   ein Auftrag zur Zeit, Pause, Wiederversuch, Stapel, Aufräumen
  ytdlp.js           alles, was yt-dlp anfasst: Formate, Schalter, Fehlertexte
  schaetzung.js      was ein Stapel kosten wird - Platz, Zeit, Restzeit
  ablage.js          ein Ordner je Auftrag; Einlesen nach Neustart; Messwerte
  probe.js           Prüflauf (`deno task probe`), 25 Proben
  public/            index.html, stil.css, app.js
  ablage/            die geladenen Dateien (www-data, nicht im Repo)
    .messwerte.json  gemessene MB und Sekunden je Medienminute
  cookies.txt        optional – siehe „Wenn YouTube zumacht"
```

| Was | Wo |
|---|---|
| Dienst | `/etc/systemd/system/downloader.service`, Port 8091, nur 127.0.0.1 |
| Passwort und Weiterleitung | `<Location /downloader/>` in `/etc/apache2/sites-enabled/inf-zeus.conf` |
| yt-dlp aktuell halten | `ytdlp-aktuell.timer` → `.service`, montags 04:30 |
| Eintrag | `spiele.json` unter `still` (**nicht** unter `spiele`) |

Der Ordner liegt **nicht im Repo**: `.gitignore` ist eine Freigabeliste, und
`downloader/` steht nicht darauf. Das ist Absicht – es ist ein privates
Werkzeug, so wie Nextcloud und die Tradingbots.

## Der Passwortschutz sitzt in Apache

Nicht im Dienst. Der Unterschied ist wichtig: so kommt **keine einzige
Anfrage** bis zu `yt-dlp` durch, die nicht angemeldet ist. Der Dienst horcht
zusätzlich nur auf `127.0.0.1` und ist von außen gar nicht erreichbar.

Neuer Benutzer oder neues Passwort:

```bash
htpasswd /etc/apache2/dashboard.htpasswd <name>     # gilt auch für beide Tradingbots
```

## Ein Auftrag zur Zeit

`GLEICHZEITIG=1` in der Unit. Nicht wegen der Maschine – vier Kerne langweilen
sich dabei –, sondern aus zwei anderen Gründen:

1. Viele gleichzeitige Abrufe von derselben IP lösen bei YouTube die
   Bot-Erkennung aus. Das ist die eigentliche Grenze, nicht die CPU.
2. Eine 200-Stück-Playlist würde sonst die Leitung für die dreißig Spiele
   auf derselben Maschine zuziehen.

Höherstellen bringt deshalb wenig und kann schaden.

### Und dazwischen eine Pause

`PAUSE_MIN_MS=10000`, `PAUSE_MAX_MS=15000` – zehn bis fünfzehn Sekunden,
gewürfelt, zwischen zwei Aufträgen. Gewürfelt und nicht fest, weil ein exakter
Takt von 12,000 s genauso nach Skript aussieht wie gar keine Pause.

Das war die Lücke vom 25.09.2026: `GLEICHZEITIG=1` stand da, aber die Aufträge
liefen Stoß an Stoß. Siebzig Abrufe in Folge von einer Rechenzentrums-IP sind
genau die Signatur, auf die YouTube wartet – von siebzig Stücken kamen fünfzig
durch. Die Pause kostet bei siebzig Stücken rund eine Viertelstunde; beim
Parken ist das gleichgültig, und es ist das wirksamste Einzelmittel.

Die Pause gilt nur **zwischen** Aufträgen: eine leere Schlange läuft sofort an,
ein einzelnes Video wartet nie. Gemessen wird am Ende des letzten Auftrags
(`letztesEnde`), nicht an einem Takt.

Dazu innerhalb eines Auftrags `--sleep-requests 0.75` – das bremst die
Handvoll Anfragen, die yt-dlp an die Formatliste stellt.

**Probe G24** hält es fest: zwei Stücke, und geprüft wird der Abstand zwischen
dem Ende des ersten und dem Start des zweiten.

### Ein Fehler ist nicht gleich ein Fehler

Der zweite Teil desselben Problems, und der schwerere: ein Bot-Sperr-Fehler war
**endgültig**. `--retries 5` in `ytdlp.js` wiederholt *innerhalb* eines
yt-dlp-Laufs, also Sekunden später – gegen eine Sperre hilft das nichts. War
der Lauf durch, setzte die Warteschlange `stand = "fehler"`, warf den Ordner
weg und ging zum nächsten. Deshalb blieben die zwanzig tot, obwohl sie zehn
Minuten später problemlos gekommen wären.

`istSperre()` in `ytdlp.js` unterscheidet jetzt:

| Meldung | Urteil |
|---|---|
| „Sign in to confirm you are not a bot", 429, 403, 5xx, Zeitüberschreitung, Verbindungsabbruch | Tageslaune → zurück in die Schlange |
| „Private video", „Video unavailable", „has been removed", „members-only", Alters- oder Ländersperre | endgültig → kein zweiter Versuch |

Wiederholt wird dreimal (`VERSUCHE=3`), mit `RUECKLAUF_MS=60000,300000,900000`
– eine Minute, fünf, eine Viertelstunde. Und **zwei Sperren hintereinander
halten die ganze Schlange an** (`ABKUEHLUNG_MS=600000`, zehn Minuten):
Weiterhämmern macht es schlimmer, und ohne diese Bremse verbrennt der Lader die
restlichen Stücke im Sekundentakt und hat am Ende alle gesperrt statt nur eines.
Die Abkühlung steht in der Oberfläche, sonst sieht es aus wie ein Hänger.

Was trotzdem aufgegeben wurde, bleibt als Zeile stehen und hat einen Knopf:
**„Fehlgeschlagene nochmal"**. Die Adressen stehen ja alle noch da – das war
der Knopf, der hinter „50 von 70" gefehlt hat.

**Proben G22 und G23**: eine Quelle, die beim ersten Abruf 503 sagt und danach
liefert (muss von selbst durchlaufen), und eine, die immer 503 sagt (muss die
Abkühlung auslösen und per Knopf zurückkommen).

### Warum aus siebzig fünfzig wurden – die andere Hälfte

Nicht alles davon war die Sperre. `--flat-playlist` liefert für private,
gelöschte und regionsgesperrte Videos ein `null` in `entries`, und `erkunde()`
filterte die still weg. Aus siebzig wurden fünfzig, und **niemand erfuhr,
warum**. Jetzt meldet `erkunde()` beides – wie viele Einträge die Liste hatte
und wie viele brauchbar sind –, und in der Befundkarte steht
„20 von 70 nicht abrufbar (privat, gelöscht oder gesperrt)".

### Der Absturz vom 21.09.2026 – und warum „einer zur Zeit" nicht stimmte

Eine Playlist mit hundert Liedern hat die ganze Maschine umgelegt: kein SSH
mehr, Neustart nur noch von außen. `GLEICHZEITIG=1` stand da, aber es galt
nicht.

Der Fehler saß in `pumpe()` in `warteschlange.js`. Die Funktion zählte die
laufenden Aufträge an `laufen.size` ab – einer `Map`, die aber erst *nach*
einem `await` gefüllt wird (dazwischen wird der Ordner angelegt). In dieser
Lücke sah die Pumpe weiterhin null laufende Aufträge, startete den nächsten,
sah wieder null, startete den nächsten … Weil `queueMicrotask` vollständig
abgearbeitet wird, bevor die Platten-Ein-/Ausgabe zurückkommt, lief das in
einem Zug durch die ganze Liste. Hundert Lieder wurden zu **hundert
gleichzeitigen `yt-dlp`-Prozessen**, jeder mit `--concurrent-fragments 4`
und einem eigenen ffmpeg dahinter.

Nachgemessen im Protokoll: ab 14:46 meldete MariaDB im Minutentakt
`InnoDB: Memory pressure event`, um 14:48:23 bricht das Journal mitten im Satz
ab. Kein OOM-Kill – die Maschine kam gar nicht mehr so weit, sie steckte im
Swap fest. Deshalb war auch `sshd` nicht mehr ansprechbar.

Behoben: die Pumpe zählt jetzt an einem eigenen Zähler (`belegt`), der
**vor** dem ersten `await` erhöht und erst im `finally` wieder gesenkt wird;
der Auftrag wird im selben Atemzug synchron auf `laeuft` gesetzt, damit die
nächste Runde ihn nicht noch einmal findet. Gleich daneben lag ein zweiter,
kleinerer Fehler derselben Bauart: wer in dieser Lücke auf **Abbrechen**
drückte, fand in `laufen` noch nichts vor – der Prozess lud danach munter
weiter. Auch das ist zu.

**Probe G20** hält das fest: sechs Stücke auf einmal, und geprüft wird nicht
das Ergebnis, sondern der Verlauf – wie viele zur selben Zeit gelaufen sind.
Gegen den alten Stand schlägt sie fehl („höchste Gleichzeitigkeit 6"), gegen
den neuen nicht.

### Der Gurt in der Unit

Der Fehler ist weg, aber dass ein Werkzeug für eine Person die dreißig Spiele
mitreißen kann, war die eigentliche Lücke. Die Unit hat deshalb seit dem
21.09.2026 Grenzen – gemessener Normalbedarf sind rund 190 MB und 6 Tasks:

| Zeile | Warum |
|---|---|
| `MemoryHigh=1800M`, `MemoryMax=2G` | eine letzte Warnung knapp vor der harten Grenze – **stand bis zum 25.09.2026 auf 1G und war damit selbst die Bremse**, siehe unten |
| `MemorySwapMax=0` | das Verrecken war Thrashing, nicht der OOM-Killer; mit vollem Swap steht auch `sshd` |
| `TasksMax=192` | eine Prozesslawine läuft gegen die Wand statt gegen die Maschine |
| `CPUWeight=20`, `IOWeight=20` | wenn es eng wird, gehen die Spiele vor |

Läuft der Lader gegen `MemoryMax`, stirbt er und `Restart=always` holt ihn
zurück. Das ist unschön und allemal besser als ein Server, der nur noch von
außen neu zu starten ist.

#### Warum `MemoryHigh=1G` hochmusste

`MemoryHigh` ist **keine Wand, sondern eine Schlafstrafe**: ab dieser Grenze
legt der Kernel den Prozess bei jeder Speicherzuteilung kurz schlafen und räumt
auf. Und bei cgroup v2 zählt der **Seiten-Cache gelesener und geschriebener
Dateien mit** – für einen Dienst, der große Dateien durchschiebt, ist die
Grenze damit nicht die Ausnahme, sondern der Normalfall.

Nachgemessen am 25.09.2026:

```
/sys/fs/cgroup/system.slice/downloader.service/memory.events →  high 7056
memory.peak                                                  →  1,07 GB (= die Grenze)
pgscan / pgsteal                                             →  455.000 Seiten
```

`max 0`, `oom 0` – er ist nie gestorben, er wurde 7056-mal ausgebremst. Bei
einem gemessenen Normalbedarf von 190 MB. Das war der Hauptverdächtige für
„der Download war extrem langsam", und der Verursacher war das ZIP (Abschnitt
„Warum das ZIP weg ist"). Seit jede Datei einzeln hinausgeht, brauchte die
Grenze nicht mehr so tief zu liegen.

## Was es wirklich kostet

Gemessen am 21.09.2026 auf dieser Maschine (4 Kerne EPYC, 7,7 GB RAM):

* **Video.** Die alte Faustregel „bis 360p kommt eine fertige Datei" gilt
  nicht mehr – YouTube lieferte auch in 360p Bild und Ton getrennt, ffmpeg
  legte sie zusammen. Das ist Kopieren, kein Neuberechnen, und dauerte bei
  einem 82-Sekunden-Stück **unter einer Sekunde**. Ergebnis: 854×358, h264,
  AAC, 4,7 MB.
* **MP3** ist der einzige Fall mit echter Rechenlast, weil der Ton neu
  kodiert wird: rund 30- bis 50-fache Geschwindigkeit auf **einem** Kern.
  Ein Vier-Minuten-Lied ≈ 5–8 Sekunden.
* **Der Kostenpunkt ist Datenverkehr**, und zwar doppelt: einmal von der
  Quelle zum Server, einmal vom Server in den Browser. Eine 100-Video-Liste
  in 360p sind rund 2× 5 GB, dieselbe Liste in 1080p schnell 2× 30 GB. Dieser
  Anschluss hat kein Kontingent – sonst wäre das die Grenze.
* **RAM** ist kein Thema: ein `yt-dlp`-Prozess nimmt 100–150 MB.

## Parken, oder sofort speichern

Die Entscheidung fällt **je Stapel**, beim Starten, und steht danach im
`auftrag.json` – sie übersteht also einen Neustart des Dienstes.

### Parken

Anschmeißen, Seite zumachen, später wiederkommen. Nichts wird von selbst
angestoßen; die fertigen Dateien warten **drei Tage** (`AUFBEWAHREN_MS`).
Gerechnet wird ab dem **Ende des Stapels**, nicht ab dem Anlegen – drei Tage
heißen drei Tage, auch wenn der Stapel selbst eine Nacht gebraucht hat.

Geparkte Stapel laden **gebremst**: `PARK_TEMPO=5M` hängt yt-dlp ein
`--limit-rate 5M` an. Das ist der ganze Witz am Parken – dort wartet niemand,
also darf der Lader die Leitung für die dreißig Spiele freihalten. `CPUWeight`
und `IOWeight` deckeln Rechenzeit und Platte schon, die Leitung bisher nichts.
Leer lassen schaltet es ab.

Die Oberfläche rät von selbst zum Parken, sobald ein Stapel über `GROSS_GB=3`
oder über `LANG_MINUTEN=60` liegt – oder mehr als zehn Stücke hat.

### Sofort speichern

Jedes Stück wird angestoßen, **sobald es fertig ist** – nicht erst am Ende des
Stapels. Damit überlappen sich die beiden Strecken (Quelle → Server und Server →
Browser), was bei langsamer Leitung die Wanduhrzeit etwa halbiert.

Angestoßen wird über einen unsichtbaren Link mit `download`, der sich selbst
klickt; der Dateiname kommt aus dem `content-disposition` des Dienstes, nicht
aus der URL. Beim ersten Mal fragt Chrome einmal, ob die Seite mehrere Dateien
speichern darf.

**Eines nach dem anderen, getaktet vom Dienst.** Und das ist besser als der
feste Abstand von 1,2 s, den die erste Fassung hatte: mit `?weg=1` wechselt ein
Auftrag auf `abgeholt`, sobald der Strom vollständig hinaus ist – ein echtes
Fertig-Signal. Darauf wartet die Seite, bevor sie das nächste Stück anstößt.
Ist das Löschen abgeschaltet, gibt es kein Signal, und es bleibt beim kurzen
festen Abstand.

Was schon fertig war, **bevor** die Seite geöffnet wurde, wird nicht
nachträglich geladen – „fertig geworden" heißt: währenddessen. Und ein geparkter
Stapel merkt seine Stücke trotzdem als gesehen vor; sonst lüde ein späteres
Umschalten rückwirkend alles herunter, was herumliegt.

### Der Schalter, der geblieben ist

**„Gespeichertes vom Server löschen"**, von Haus aus an, gemerkt im
`localStorage`. Hängt `?weg=1` an den Link. Der Dienst räumt die Datei weg,
sobald er sie vollständig hinausgeschrieben hat.


### Wann genau gelöscht wird – und wann nicht

Die Entscheidung fällt im Dienst, nicht im Browser. Ein Browser, der „hab
ich" sagt, ist keine Auskunft: ein abgebrochener Download sähe genauso aus.
Stattdessen hängt `server.js` einen Strom dazwischen, dessen `flush` **nur**
läuft, wenn die Quelle regulär endet und die Gegenstelle alles davor abgeholt
hat (ein `TransformStream` hat Gegendruck). Bricht die Verbindung ab, läuft
statt dessen `cancel`, und es passiert nichts.

| Abruf | Ergebnis |
|---|---|
| vollständig, mit `?weg=1` | Datei weg, Eintrag bleibt als Verlaufszeile |
| Ausschnitt (`Range`), auch mit `?weg=1` | bleibt liegen – wer fortsetzt, will sie behalten |
| mitten im Strom abgebrochen | bleibt liegen |
| ohne `?weg=1` | bleibt liegen |

Die drei unteren Zeilen sind in `probe.js` je eine eigene Probe (G15–G17).
Das ist Absicht: sie prüfen, dass *nichts* passiert, und genau das ist der
Teil, der wehtut, wenn er falsch ist.

**Die Grenze, ehrlich gesagt:** „vollständig hinausgeschrieben" ist nicht
dasselbe wie „liegt beim Browser auf der Platte". Dazwischen liegen Puffer,
die der Dienst nicht sehen kann. Deshalb ist das Löschen abschaltbar – und
wenn doch einmal etwas schiefgeht, ist die Adresse ja noch da.

Abgeholte Aufträge bleiben als Zeile unter **Gespeichert und weggeräumt**
stehen: sie kosten keinen Platz mehr, sagen aber, was passiert ist. „Liste
leeren" wirft sie weg, ein Neustart des Dienstes auch (es gibt keinen Ordner
mehr, aus dem sie wiederkämen).

## Die Ablage räumt sich selbst – aber nicht mitten im Stapel

Fertige Dateien verschwinden nach **drei Tagen** (`AUFBEWAHREN_MS`), die Ablage
bleibt insgesamt unter **40 GB** (`MAX_ABLAGE_GB`; darüber fliegt das Älteste
zuerst). Beides sind `Environment=`-Zeilen in der Unit – ändern,
`systemctl daemon-reload`, `systemctl restart downloader`, fertig. Kein
Neuschreiben.

Ein Auftrag ist genau dann da, wenn sein Ordner da ist; daneben liegt ein
`auftrag.json` mit dem, was die Oberfläche anzeigt. Deshalb übersteht die
Liste einen Neustart des Dienstes, und es gibt nichts, was zwischen einer
Datenbank und der Platte auseinanderlaufen könnte.

### Der Fehler, der beim Parken zur Gefahr wurde

`aufraeumen()` ging über **alle** fertigen Aufträge und warf sie nach Frist oder
bei Platzmangel weg, ohne zu fragen, ob ihr Stapel schon durch ist. Solange die
Frist sechs Stunden betrug und niemand parkte, fiel das nicht auf. Mit dem
Parken ist es der Normalfall:

> Eine siebzig Stück lange Liste braucht länger als die Frist. Also löschte der
> Aufräumer (er läuft alle zehn Minuten) die Stücke 1 bis 20, während 60 bis 70
> noch liefen. Man kam wieder – und der Stapel war angeknabbert.

Jetzt gilt: **solange in einem Stapel etwas läuft oder wartet, wird an keinem
seiner Stücke etwas angefasst.** Auch nicht bei Platzmangel – dann fliegt lieber
ein anderer, vollständiger Stapel. Ist alles fertig und es ist trotzdem zu eng,
fliegt der älteste vollständige zuerst; das muss sein, sonst läuft die Platte
voll. Bleibt danach noch zu viel belegt, wird **nicht** gemetzelt, sondern ins
Journal geschrieben – die Schätzung hätte es vorher sagen müssen.

Und genau das tut sie jetzt: `/api/auftrag` weist einen Stapel mit **409** ab,
dessen geschätzte Größe nicht in den freien Platz passt. Vorher lief er einfach
los und fraß sich selbst.

**Probe G21** hält beide Hälften fest: ein Stapel, in dem eines fertig und eines
noch offen ist, übersteht die Frist auch dann, wenn alles längst überfällig ist –
und wird weggeräumt, sobald er durch ist. Gegen den alten Stand schlägt sie fehl
(„währenddessen überlebt false").

Von Hand: `POST /api/frist` wendet die Regel jetzt an, statt auf den
Zehn-Minuten-Takt zu warten. Nicht zu verwechseln mit `POST /api/aufraeumen` –
das ist der Knopf „Alle Fertigen wegräumen" und nimmt alles mit.

## Playlists, Stapel und die Schätzung

`--flat-playlist` zählt die Liste nur auf, ohne jedes Video aufzuschlagen –
135 Einträge waren so in wenigen Sekunden da. Was angekreuzt wird, wandert
**einzeln** in die Schlange und bekommt eine gemeinsame Stapel-Nummer.

**Jeder Auftrag gehört zu einem Stapel**, auch ein einzelnes Video. Vorher war
die Gruppe nur bei mehreren Stücken gesetzt und die Oberfläche musste beide
Fälle kennen; die Unterscheidung gab es nur wegen des ZIP-Knopfs, und der ist
weg. Ein Stapel hat einen Namen, einen Fortschritt, eine Restzeit und ein
Ablaufdatum – abgeleitet aus seinen Mitgliedern, ohne zweiten Datenspeicher.

Bei siebzig Einträgen ist die Auswahlliste **zugeklappt** (ab dreizehn), hat
eine Suche, feste Höhe, laufende Nummern und Bereichsauswahl per Umschalt-Klick.
Vorher waren das anderthalb Bildschirme, durch die man bis zum Knopf scrollen
musste.

### Was es kosten wird, bevor man drückt

Das ist der Sinn von `schaetzung.js`. Zwei Zahlen je Format:

* **MB je Medienminute** – wie groß wird eine Minute in diesem Format?
* **Sekunden je Medienminute** – wie lange braucht der Server dafür?

Die Startwerte kommen aus den Messungen vom 21.09.2026 (82 s in 360p ergaben
4,7 MB, also 3,4 MB/min; 1080p etwa das Zehnfache). Sie sind **nur** der
Startwert: gerechnet wird mit den eigenen Messwerten, sobald es welche gibt. Die
liegen in `ablage/.messwerte.json` als Ring der letzten sechzig Aufträge je
Format – was vor zweihundert Aufträgen galt, sagt über die heutige Leitung
nichts. Ob eine Zahl gemessen oder geraten ist, steht in der Oberfläche
(„aus eigenen Messwerten" / „Faustzahlen, noch ohne Messung").

**Geschätzt wird aus der Laufzeit, nicht aus der Stückzahl.** Das ist der ganze
Punkt: 70 Musikstücke à 4 Minuten sind 280 Minuten, 70 Vorträge à 45 Minuten
sind 52 Stunden. Dieselbe Stückzahl, Faktor elf im Ergebnis. Deshalb wird die
`dauer` aus `--flat-playlist` bis ins `auftrag.json` durchgereicht – vorher warf
`/api/auftrag` sie weg.

An jedem Formatknopf steht die Zahl für **diese** Auswahl. Für 70 Stücke à
4 Minuten:

```
MP3   ≈ 0,7 GB      360p  ≈ 1,0 GB      480p  ≈ 1,5 GB
720p  ≈ 2,8 GB      1080p ≈ 5,7 GB
```

Darunter die Zeile mit Platz, Dauer und – ab fünf Minuten – „fertig gegen
23:20". Das ist die Zahl, die man beim Parken wirklich braucht.

### Die Restzeit, die sich nachzieht

`schaetzung.restzeit()` rechnet **zuerst mit den eigenen fertigen Stücken dieses
Stapels**: die kennen die Leitung von heute besser als jeder gespeicherte
Mittelwert. Erst wenn es noch keine gibt, greift die allgemeine Messreihe, und
erst danach die Faustzahl. Der laufende Auftrag wird nicht voll gezählt, sondern
nur sein Rest – sonst springt die Anzeige bei jedem Wechsel um ein ganzes Stück
nach oben. Dazu kommt die Pause vor jedem Wartenden und eine laufende Abkühlung.

Eine Falle, im Echtlauf aufgefallen: `gestartet` wird erst **nach** der Pause
gesetzt, damit die Wartezeit nicht in die Messwerte läuft. Ohne das Feld
`pauseBis` meldete die Anzeige deshalb „noch 2 s", während zwölf Sekunden Pause
vor sich lagen. G24 prüft beides zusammen.

## Warum das ZIP weg ist (25.09.2026)

Es war die Ursache der Langsamkeit, die sich wie ein Hänger anfühlte. `zip` las
siebzig Dateien, schob sie durch eine Pipe, durch den `meldeEnde`-Strom und
durch Apache – und der Seiten-Cache von allem davon wird der cgroup
zugerechnet. Ergebnis: 7056 Bremsungen an `MemoryHigh=1G` (siehe „Der Gurt in
der Unit"). Dazu:

* **Kein `content-length`.** Ein gestreamtes ZIP kann keines haben. Also kein
  Fortschrittsbalken, keine Restzeit – es sah aus wie ein Hänger.
* **Kein Range.** Brach die Übertragung bei 90 Prozent ab, war alles weg. Und
  weil die Seite die Gruppe schon als angestoßen vermerkt hatte, versuchte das
  automatische Speichern es nicht noch einmal.
* Im Journal steht der Beleg: am 23.09.2026 um 22:09 `zip endete mit 141` –
  141 = 128+13 = SIGPIPE, die Gegenstelle war weg.

Stattdessen **jede Datei einzeln** über `/datei/<id>`. Das kann `content-length`,
beantwortet Range, löscht einzeln, hält die cgroup ruhig, und ein Abbruch kostet
ein Stück statt siebzig. Der alte Einwand („hundert einzelne Downloads wären für
jeden Browser eine Zumutung") stimmt nicht, wenn nicht hundert auf einmal
losgehen, sondern eines nach dem anderen – getaktet vom Fertig-Signal des
Dienstes.

Mit weg sind: `liefereZip()`, der Bühnen-und-Hardlink-Tanz gegen `zip -j`s
Abbruch bei gleichnamigen Dateien, `raeumeBuehnen()`, die Gruppen-Abholung – und
`/usr/bin/zip` aus `--allow-run` in der Unit. Der Dienst darf jetzt genau **ein**
Programm starten.

**Das Handy, ehrlich gesagt:** Browser frieren Hintergrund-Tabs ein. Ein
Download, der schon läuft, läuft weiter – den führt der Download-Manager des
Systems. Aber das *Anstoßen des nächsten* macht die Seite; schläft sie, bleibt
die Kette nach dem laufenden Stück stehen. Für „ich komme später wieder" ist das
kein Problem, weil man dann am Gerät ist. Wer es doch braucht: Päckchen von zehn
wären der Kompromiss, nicht das große ZIP.


## Wenn YouTube zumacht

Ein Server im Rechenzentrum bekommt „Bestätige, dass du kein Bot bist"
häufiger zu sehen als ein Rechner zu Hause. Am 21.09.2026 kam diese IP ohne
Weiteres durch – das kann sich ändern.

Gegenmittel: im eigenen Browser bei YouTube anmelden, die Cookies als
`cookies.txt` exportieren (Netscape-Format) und nach
`/var/www/html/downloader/cookies.txt` legen. `ytdlp.js` sieht bei **jedem**
Aufruf nach, ob die Datei da ist, und hängt dann `--cookies` an – kein
Neustart nötig, und ohne die Datei ändert sich nichts.

```bash
chown www-data:www-data /var/www/html/downloader/cookies.txt
chmod 600 /var/www/html/downloader/cookies.txt
```

Cookies laufen ab. Hilft es nicht mehr, ist die Datei meist alt.

**Am 25.09.2026 lag die Datei nicht da** – beschrieben war sie seit dem
21.09.2026, angelegt nie. Für eine Rechenzentrums-IP ist sie inzwischen das
erste und billigste Mittel; Pause und Wiederversuch sind die zweite Lage, nicht
die erste. Ein Wegwerf-Google-Konto nehmen, nicht das eigene: was hier passiert,
ist eine Sache zwischen dem Konto und YouTube.

Der nächste Hebel, wenn Cookies nicht mehr reichen, wäre
`--extractor-args youtube:player_client=…` in `grundArgs()`. Bisher steht dort
die Vorgabe von yt-dlp.

## yt-dlp aktuell halten

Das ist der unangenehme Teil und der Grund, warum solche Werkzeuge
verwahrlosen: YouTube ändert regelmäßig etwas, und eine `yt-dlp`-Fassung von
vor drei Monaten lädt irgendwann gar nichts mehr.

`ytdlp-aktuell.timer` erledigt das montags um 04:30 (`yt-dlp -U`, tauscht das
Programm an Ort und Stelle; der Lader startet es bei jedem Auftrag neu und
braucht keinen Neustart). Von Hand:

```bash
systemctl start ytdlp-aktuell.service && yt-dlp --version
```

Die laufende Fassung steht in der Fußzeile der Seite.

## Prüfen

```bash
cd /var/www/html/downloader
deno task check     # findet keine vergessenen Importe - siehe Falle 4
deno task probe     # 25 Proben, dauert ~90 s
```

`probe.js` läuft **nicht** gegen den laufenden Dienst und **nicht** gegen
YouTube: es baut sich mit ffmpeg eine eigene kleine Mediendatei, stellt sie
über einen eigenen Webserver bereit und startet den Lader als zweiten Prozess
mit eigenem Port und eigener Ablage. Geprüft werden URL-Abweisung, Erkunden,
Video- und MP3-Auftrag, Ausliefern samt Range-Anfragen, Stapel, Löschen,
Aufräumen, Abbrechen, die Formatliste, das Abholen mit allen vier Fällen aus der
Tabelle oben, und seit G20, dass eine Liste wirklich Stück für Stück läuft.

Seit dem 25.09.2026 dazu fünf, die die neuen Teile festhalten:

| Probe | Was sie hält |
|---|---|
| G09 | die Schätzung kommt beim Erkunden mit und rechnet mit der Laufzeit |
| G18 | ein Stapel Stück für Stück abgeholt – Platte frei, Stapel als Verlauf |
| G21 | Aufräumen lässt unvollständige Stapel in Ruhe – und räumt fertige doch |
| G22 | ein Stück an einer Tageslaune kommt von selbst wieder |
| G23 | zwei Sperren halten die Schlange an, der Knopf holt sie zurück |
| G24 | zwischen zwei Aufträgen wird gewartet, und die Restzeit weiß es |
| G25 | die Schätzung zieht sich an den eigenen Messwerten nach |

**G21 bis G24 brauchen einen zweiten Lader** auf Port 8393, mit eigener Ablage
und eigenen `Environment`-Werten: Pause, Aufbewahrungsfrist, Rücklauf und
Abkühlung werden beim Start gelesen, gegen den Hauptdienst (Pause 0, Frist
praktisch unendlich) ließen sie sich nicht prüfen. Der Prüflauf startet ihn
selbst und räumt ihn wieder ab.

Alle vier wurden gegen den alten Stand gegengeprüft und schlagen dort fehl –
G21 mit „währenddessen überlebt false", G22 mit „Versuch 0", G24 mit
„Abstand 1 ms". Eine Probe, die nicht fehlschlagen kann, hält nichts.

Die kleine Quelle im Prüflauf hat dafür zwei Sonderadressen: `/flatter.mp4`
antwortet beim **ersten** Abruf mit 503 und danach mit der Datei (für den
Wiederversuch), `/immerweg.mp4` immer mit 503 (für die Abkühlung).

Für den Abbruch-Fall (G16) baut die Probe eine zweite, absichtlich große
Datei: bei 70 kB liegt schon alles im Puffer des Betriebssystems, bevor man
abbrechen könnte. Sie entsteht mit `-qp 0` – verlustfrei ist in zwei Sekunden
kodiert und ergibt vier Megabyte. Rohe Bytes gehen dafür **nicht**:
`--embed-metadata` stößt immer einen ffmpeg-Durchlauf an, und der scheitert
an allem, was kein Medium ist (nachgemessen am 21.09.2026).

Dass der Dienst dabei wirklich gestartet wird, ist kein Zufall: `deno check`
sieht einen vergessenen Import in reinem JS nicht (Falle 4 in `CLAUDE.md`).

## Was bewusst fehlt

* **Keine gemeinsamen Teile.** Kein WebSocket, keine `bremse.js`, kein
  `lobbyCss`. Der Eintrag in `spiele.json` trägt deshalb kein `gemeinsam` –
  `verteilen.mjs` hat hier nichts zu tun.
* **Kein ZIP** – siehe oben, das war Absicht und ein Rückbau.
* **Keine Benachrichtigung, wenn ein geparkter Stapel fertig ist.** Eine
  Browser-Meldung braucht einen offenen Tab und ist damit fürs Parken nutzlos;
  alles andere wäre neue Infrastruktur für eine Person. Stattdessen sagt die
  Schätzung beim Starten „voraussichtlich fertig gegen 01:40" – und man schaut
  danach herein.
* **Nur Deutsch.** Der Rest des Hauses spricht drei Sprachen; dies hier liest
  genau eine Person.
* **Keine Kachel, kein Zählen, kein Eintrag auf `/spiele/`.**

## Rechtliches, einmal

YouTubes Nutzungsbedingungen verbieten das Herunterladen, unabhängig davon,
wie die Privatkopie im deutschen Urheberrecht steht. Hinter einem Passwort für
eine Person ist das eine Sache zwischen dem Betreiber und YouTube. Nichts
davon gehört in eine Kachel, und nichts davon wird verlinkt.
