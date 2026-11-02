# Röhre (`/roehre/`) – ein eigener YouTube-Feed

Kein Spiel. Keine Spielkachel – nur eine kleine mit Schloss auf der Startseite. `noindex`. **Passwortgeschützt** – dieselbe
`htpasswd` wie Lader und Tradingbots, dieselbe Anmeldung (Formular, Keks ein
Jahr – `doku/betrieb.md`). Nur für den Betreiber, nur Deutsch.

Angelegt am 21.10.2026.

## Warum es das gibt

Der Abo-Feed von YouTube sortiert nur nach der Zeit: wer zehnmal am Tag
hochlädt, schiebt alle anderen hinaus. Die Startseite ist auf Watchtime
optimiert und zeigt immer wieder dasselbe. Gewünscht war das Gefühl von
YouTube um 2015 – die eigenen Abos **mit Maß**, dazu Neues, das passt, und
keine Werbung.

## Was es tut

* **Für dich** – Abos und Neues gemischt, Vorgabe 30 % Neues (einstellbar
  0–80 % unter *Kanäle*), in festen Abständen einsortiert.
* **Abos** – nur Abos, aber nach denselben Regeln.
* **Neu** – nur Entdecktes.
* **Später** – Gemerktes.
* **Kanäle** – Abos importieren, Gewichte von Hand ±, Themen, Vorschläge zum
  Abonnieren, gesperrte Kanäle.
* Oben: **Suche**, auch eine eingeworfene YouTube-Adresse öffnet direkt.

Am Handy: Wischen nach links = *Kein Interesse* (mit Rückgängig), nach
rechts = *Später*. Als App installierbar (Manifest, Symbol), am Rechner
Leiste links, am Handy unten – wie der Rest des Hauses.

## Die Mischung (`feed.js`)

Reine Rechnung, deshalb in `probe.js` ohne Netz festgehalten.

| Regel | Wirkung |
|---|---|
| **Interesse = Gewicht × (1 + Puls)** | der Puls je Kanal steigt beim Antippen (+1) und Zu-Ende-Schauen (+1,5), fällt beim Wegwischen (−1) und im Bild ohne Tippen (−0,05), halbiert sich alle 14 Tage, liegt zwischen −0,8 und 12. Was du gerade schaust, schlägt hunderte nie geschaute Abos (seit 21.10.2026, siehe unten) |
| höchstens **2 Videos je Kanal** gleichzeitig, das zweite mit halbem Gewicht | Vielposter verschwinden nicht, dominieren aber nicht |
| **Seltenheit**: × 1/√(Uploads je Woche) | wer einmal im Monat kommt, wiegt mehr |
| **Frische**: × e^(−Alter/7 Tage), nur die letzten 30 Tage | |
| **Gesehen ist gesehen**: jedes Mal „im Bild ohne Tippen" × 0,5, ab 4 Mal weg, dazu −0,01 für den Kanal | Neuladen zeigt eine neue Seite: was oben stand und nicht angetippt wurde, hat nicht angesprochen (seit 21.10.2026; vorher × 0,75 / 5 Mal) |
| angetippt = raus aus dem Feed, nicht zu Ende = *Weiterschauen* | |
| **Neues nach Nähe**: × Interesse am Kanal des Samens | was über Sola gefunden wurde, steht vor dem, was über ein einmal angetipptes Golfvideo kam (`samen` am Video) |
| **Katalog** (`quelle: "katalog"`): × 0,35, verblasst mit 90 statt 7 Tagen | ältere Videos der Lieblingskanäle, auch ohne Abo |
| Kanal-Gewicht 0,1–4: Tippen +0,1, ≥70 % geschaut +0,25, *Kein Interesse* −0,3 | stellt sich von selbst ein |
| bei jedem Laden gewürfelt ×0,8–1,2 | gleich Starke stehen nie zweimal gleich |

**Warum Puls, Katalog und Nähe** (21.10.2026, gemeldet: „ich klicke dauernd
auf Sola, und weder er noch League of Legends erscheint“). Befund im Stand:
Sola stand schon auf Gewicht 4, aber mit genau einem ungesehenen Video – von
seinen letzten 30 langen waren 26 geschaut. 425 der 514 Abos lagen bei ~0,6
und füllten den Feed; „Neu“ zog seinen Samen gleichmäßig aus den letzten 120
Klicks, deshalb oben Golf und Camper. Jetzt: Samen nach Interesse gezogen
(dazu Videos der zehn Kanäle mit dem höchsten Interesse im Topf), Neues nach
dem Samen-Kanal gereiht, und der Katalog füllt auf, was RSS nicht hat. Beim
ersten Start wird der Puls aus dem Verlauf der letzten 60 Tage nachgerechnet
(`pulsNachholen()`, einmal, `stand.pulsSeit`).

**Endlos scrollen** (`/api/mehr`): Ist die geladene Liste aufgebraucht,
schickt die Seite alle schon gezeigten Ids mit und bekommt die nächsten 40.
Je tiefer, desto mehr Videos je Kanal (`tiefe`: 2 → bis 6) und Abo-Videos
bis 45 statt 30 Tage alt. Reicht das nicht, holt `nachfuellen()` sofort
„Ähnlich" zu drei Samen (je bis zu zehn). „Alles gesehen." erst, wenn nichts
mehr da ist **und** der Nachschub nichts brachte (`ende`) – eine leere
Antwort allein hieß früher schon Ende, und das schnitt bei 377 Videos ab.
Im Test mit einer Kopie des echten Stands: 734 Videos, keines doppelt.

„Im Bild" heißt: 60 % sichtbar, eine Sekunde lang (`IntersectionObserver` in
`app.js`, gebündelt alle fünf Sekunden an `/api/gezeigt`).

## Woher die Videos kommen (`sammler.js`, `yt.js`)

* **Abos über RSS** (`/feeds/videos.xml?channel_id=`): ein Kanal alle 2,5 s,
  jeder alle zwei Stunden. Offiziell, stabil, wird nicht gesperrt. Die Rate
  (Uploads je Woche) kommt aus den Zeitstempeln derselben 15 Einträge.
* **Länge und Aufrufe**: RSS hat Aufrufe, aber keine Länge. Die Länge kommt
  aus dem Reiter *Videos* des Kanals (InnerTube `browse`, `EgZ2aWRlb3PyBgQKAjoA`,
  30 lange Videos mit Länge und Aufrufen in einer Anfrage) – je Kanal höchstens
  einmal pro Stunde und nur, wenn einem Video die Länge fehlt.
* **Shorts** stehen im RSS ohne Kennzeichen. `HEAD /shorts/<id>`: 200 = Short,
  303 = normales Video. Bis das geprüft ist (`kurz === null`), steht ein Video
  **nicht** im Feed.
* **Neues** über InnerTube `next` (ähnliche Videos): Samen ist zuletzt
  Geschautes oder ein Video der Kanäle mit dem höchsten Interesse, gezogen
  nach dem Interesse an seinem Kanal (zu Ende Geschautes doppelt), ohne
  Verlauf die frischesten Videos der stärksten Abos. Je Samen höchstens sechs,
  je Kanal eins, nichts unter zwei Minuten, keine Abos, keine Kanäle mit
  Interesse unter 0,3. Alle 15 Minuten, solange
  weniger als 60 ungesehene bereitliegen. Dazu: wer ein Video öffnet, holt
  sich dessen „Ähnlich"-Liste, und drei davon wandern gleich in den Vorrat.
* **Katalog** (`katalog()` in `sammler.js`): für die 15 Kanäle mit dem
  höchsten Interesse und Puls > 0,5 der Reiter *Videos* (30 lange), je Kanal
  höchstens alle 12 Stunden, einer pro Minute. Wer ein Video antippt, stößt das
  für dessen Kanal sofort an (`katalogBald()`). Ungesehenes kommt als
  `katalog` in den Stand und fliegt nach drei Wochen wieder raus; viermal
  übergangen heißt dann erledigt.
* **Themen** über InnerTube `search` mit „diese Woche" (`EgQIAxAB`), je Thema
  alle sechs Stunden vier Stück.
* **Vorschlag zum Abonnieren**: ein nicht abonnierter Kanal, von dem zwei
  Videos zu ≥70 % geschaut wurden.

InnerTube ist nicht dokumentiert. `yt.js` läuft deshalb keinen festen Pfad
durch das JSON, sondern sucht die Bausteine (`lockupViewModel`,
`videoRenderer`), wo immer sie liegen. Wenn „Neu" leer bleibt: in der
Fußzeile steht der letzte Fehler, und meist hat sich ein Baustein umbenannt.

## Google-Takeout einlesen (`verlauf.js`)

*Kanäle* → *Datei wählen* nimmt das Takeout-ZIP so, wie es ist; entpackt wird
im Dienst (ohne Fremdbibliothek: Inhaltsverzeichnis am Ende, je Datei ein
`deflate-raw`-Strom). Ordnernamen deutsch und englisch. Beim Export: unter
YouTube nur **Abos, Playlists, Verlauf**, Verlauf als **JSON**.

Was der erste echte Export (20.10.2026) enthielt, und was daraus folgt:

| Teil | Befund | Folge |
|---|---|---|
| Abos | 519 Zeilen | Abos |
| Wiedergabeverlauf | 27.100 Einträge, **nur ab Juni**, Spitzentage über 1000 | Shorts und Autoplay sehen dort aus wie jedes Video – siehe unten |
| davon Werbung | 941, erkennbar an `details` („Von Google Anzeigen") | fliegt raus |
| davon YouTube Music | 977 (`header`) | fliegt raus |
| Beiträge, Links | `titleUrl` ohne `watch?v=` | fliegt raus |
| Abos im Verlauf | 313 von 519 nie geschaut, nur 17 % der Aufrufe von Abos | |
| „Watch later" | 191 Ids, **ohne Titel** | nach *Später*; Titel und Kanal per oEmbed nachgeschlagen |
| Likes | **nicht im Export** | – |
| eigene Playlists | 26, fast nur Musik | bewusst nicht übernommen |
| Suchverlauf | 9180 Suchen, meist Liednamen | nicht übernommen |

**Der Verlauf ist voller Shorts.** Gezählt wird deshalb je Kanal, aber an
**drei Stichproben** (`HEAD /shorts/`) gemessen, welcher Anteil Shorts war.
Erst die *langen* Aufrufe zählen, gedämpft: `1 + 0,35·log2(1 + lang)`, höchstens
3 (`gewichtAus()`). Daraus:

* **Abo, oft geschaut** → Gewicht nach der Formel.
* **Abo, im ganzen Verlauf nie** (oder nur Shorts) → 0,6: leiser, nicht weg.
  Nur wenn der Verlauf über 60 Tage reicht – sonst wäre „nie" geraten.
* **kein Abo, ≥ 5 lange Aufrufe** → *Vorschläge* unter *Kanäle*, mit Zahl.
* **lange Stichproben-Videos** von Kanälen mit ≥ 3 langen Aufrufen → Samen
  fürs Entdecken (`verlauf` im Stand, hinten angehängt).
* alle geschauten Ids → `erledigt`, kommen nie als Vorschlag.

Die Prüfung läuft im Hintergrund (ein HEAD alle 0,8 s); beim ersten Import
waren es 709 Kanäle, also rund eine halbe Stunde. Der Stand steht in der
Fußzeile. Was von Hand mit −/+ gestellt wurde (`vonHand`), überschreibt ein
späterer Import nicht.

## Abspielen (`strom.js`) – und warum so

Nachgemessen am 21.10.2026 von dieser Maschine:

1. **Kein fertiges Format mit Bild und Ton mehr**, auch nicht in 360p (itag 18
   fehlte). Also getrennt: avc1/mp4 fürs Bild (360/480/720/1080), m4a für den
   Ton, und zwar in der Originalsprache (`language_preference`), ohne DRC.
2. **Die Adressen sind an die IP des Servers gebunden** (`ip=` in der URL).
   Der Browser kann sie nicht selbst abrufen – der Server reicht durch.
3. **Am Stück drosselt googlevideo auf ~300 KB/s**, mit `&range=` in
   Häppchen kamen **70 MB/s**. Deshalb kein ffmpeg-Strom (der läse am Stück),
   sondern DASH: **Shaka** im Browser fragt kleine Bereiche ab, jeder geht
   einzeln durch `/api/strom/<id>/<itag>`. Spulen und Qualitätswechsel
   kosten damit nichts, und es läuft kein Prozess je Zuschauer.
4. Für die MPD braucht es je Spur Kopf (`ftyp`+`moov`) und
   Inhaltsverzeichnis (`sidx`). Die stehen in den ersten paar Kilobyte;
   `leseBoxen()` liest sie, `mpd()` schreibt `SegmentBase` mit `indexRange`.
5. `yt-dlp -J` braucht gut zwei Sekunden; das Ergebnis hält drei Stunden
   (die Adressen sechs). Kommt trotzdem 403/410, wird einmal neu geholt.

Offene Bereiche (`bytes=123-`) werden auf 4 MB gekappt. Shaka fragt ohnehin
genaue Bereiche.

Mit Probe geprüft: ffmpeg liest die erzeugte MPD und baut daraus ein
sauberes 360p-Video mit Ton. Im Browser ist es **nicht** automatisch geprüft
– auf dem Server gibt es keinen.

**Bedienung** (`public/bedienung.js`): eigene, im Aufbau wie bei YouTube –
Titel und Kanal oben, Zeitleiste (Puffer, SponsorBlock-Abschnitte gelb,
Zeit beim Überfahren) und Knöpfe unten, alles blendet nach 2,6 s Ruhe aus.
Klick = Pause, Doppelklick = Vollbild; am Handy Tippen zeigt/versteckt,
doppelt links/rechts ±10 s. Zahnrad: Geschwindigkeit und Qualität.
Lautstärke, Tempo und Qualität merkt sich der Browser. **Drehen = Vollbild** (nur
Touch, im Zahnrad abschaltbar): quer gedreht geht der Spieler ins Vollbild,
hochkant wieder heraus. Echtes Vollbild erlaubt Chrome nur kurz nach einem
Tippen; wird es verweigert, nimmt der Spieler per CSS (`.quer`) den ganzen
Bildschirm ein und Kopf und Leiste verschwinden – als installierte App ohne
Adresszeile dasselbe. Das **erste Tippen** in dieser Ersatzansicht
holt das echte Vollbild nach (das Tippen ist die Erlaubnis, die beim Drehen
fehlte) – Benachrichtigungsleiste und Adresszeile verschwinden dann auch. So
gemeldet aus Brave am Handy, 21.10.2026. Tasten: Leertaste/k,
j/l, Pfeile, m, f. Direkt über die Adresse geöffnet, startet ein Video nicht
von selbst – das blockiert der Browser ohne Klick (mit Ton); aus dem Feed
heraus ist das Antippen der Klick.

**SponsorBlock**: `/api/sponsor/<id>` fragt `sponsor.ajay.app` (Sponsor,
Eigenwerbung, Abo-Aufruf, Intro, Abspann) und springt darüber, mit einer
kurzen Meldung.

**NewPipe**: Am Android-Handy steht im Spieler ein Knopf, der das Video in
NewPipe öffnet – für Hintergrundwiedergabe, und falls der Server einmal
gesperrt ist.

**Lader**: „Im Lader öffnen" kopiert die Adresse und öffnet `/downloader/`.
Der Lader nimmt (noch) keine Adresse über den Link an.

## Wo was liegt

```
/var/www/html/roehre/
  server.js      Routen, Rückmeldungen, Import
  feed.js        die Mischung - reine Rechnung
  sammler.js     RSS, Shorts-Prüfung, Entdecken (Hintergrund)
  yt.js          RSS, InnerTube, /shorts/
  strom.js       yt-dlp, MPD, Durchreichen
  verlauf.js     Takeout-ZIP: entpacken, Verlauf auswerten, Stichproben
  speicher.js    daten/stand.json, gebündelt und atomar geschrieben
  probe.js       Prüflauf
  public/        index.html, stil.css, app.js, Shaka 4.12.6, Manifest, Symbol
  daten/         stand.json, optional cookies.txt (www-data, nicht im Repo)
```

| Was | Wo |
|---|---|
| Dienst | `/etc/systemd/system/roehre.service`, Port 8095, nur 127.0.0.1 |
| Passwort und Weiterleitung | `<Location /roehre/>` in `/etc/apache2/sites-available/inf-zeus.conf` |
| yt-dlp aktuell halten | derselbe `ytdlp-aktuell.timer` wie beim Lader |
| Eintrag | `spiele.json` unter `still` |

Der Ordner liegt **nicht im Repo** (`.gitignore` ist eine Freigabeliste), wie
beim Lader.

## Wenn YouTube zumacht

Wie beim Lader: `daten/cookies.txt` (Netscape-Format, Wegwerfkonto) wird bei
jedem `yt-dlp`-Aufruf angehängt, wenn sie da ist. Liegt **nicht** vor –
am 21.10.2026 ging es ohne. Betroffen wäre nur das Abspielen; RSS und
InnerTube hängen nicht an Cookies.

## Prüfen

```bash
cd /var/www/html/roehre
deno task check && deno task probe     # 50 Proben, eigener Port 8396, ohne YouTube
systemctl restart roehre && systemctl status roehre --no-pager | head -5
```

## Was bewusst fehlt

* **Kein Konto bei YouTube.** Abos kommen über das Takeout-ZIP, einen
  NewPipe-/FreeTube-Export oder `@namen` von Hand – `kanaeleAusText()` nimmt
  alles, was nach Kanal-Id oder `@name` aussieht.
* **Keine Likes** – Google liefert sie nicht mit. Stattdessen zählt „zu 70 %
  geschaut".
* **Keine Kommentare, keine Playlists, kein Live.**
* **Keine „empfohlenen Kanäle" der Lieblingskanäle** – der nächste Hebel
  fürs Entdecken, falls „Ähnlich" zu eng wird (InnerTube `browse`, Reiter
  *Kanäle*).
* **Keine gemeinsamen Teile**, keine Spielkachel, nur Deutsch.

## Rechtliches, einmal

Wie beim Lader: YouTubes Nutzungsbedingungen sehen das nicht vor. Hinter
einem Passwort für eine Person ist das eine Sache zwischen dem Betreiber und
YouTube. Nichts davon wird verlinkt.
