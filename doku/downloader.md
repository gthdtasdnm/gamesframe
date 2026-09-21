# Lader (`/downloader/`) – yt-dlp hinter einer Weboberfläche

Kein Spiel. Keine Kachel. `noindex`. **Passwortgeschützt** – dieselbe
`htpasswd` wie die beiden Tradingbots. Nur für den Betreiber.

Angelegt am 21.09.2026.

## Was es tut

Eine Adresse einwerfen, Format wählen – fertig. Der Browser speichert von
selbst, der Server räumt danach weg; beides abschaltbar. MP3 oder Video
in 360p (Vorgabe), 480p, 720p oder 1080p. Erkennt YouTube-Playlists und
Kanalseiten und legt sie zum Ankreuzen vor; eine ganze Liste gibt es hinterher
als ZIP.

Weil darunter `yt-dlp` steckt, geht es nicht nur um YouTube – rund tausend
Seiten funktionieren genauso. Bei fremden Seiten greift die Auflösungswahl
allerdings oft nicht sauber; dann kommt, was es gibt.

## Wo was liegt

```
/var/www/html/downloader/
  server.js          HTTP, Dateien ausliefern, ZIP, Schnittstelle
  warteschlange.js   ein Auftrag zur Zeit, Abbrechen, Aufräumen
  ytdlp.js           alles, was yt-dlp anfasst: Formate, Schalter, Fehlertexte
  ablage.js          ein Ordner je Auftrag; Einlesen nach Neustart
  probe.js           Prüflauf (`deno task probe`)
  public/            index.html, stil.css, app.js
  ablage/            die geladenen Dateien (www-data, nicht im Repo)
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

## Fertiges speichert sich selbst

Zwei Schalter unter der Formatwahl, beide von Haus aus **an**, gemerkt im
`localStorage` des Browsers:

* **Fertiges sofort speichern.** Sobald ein Auftrag fertig ist, stößt die
  Seite den Download selbst an – ein unsichtbarer Link mit `download`, der
  sich selbst klickt. Der Dateiname kommt aus dem `content-disposition` des
  Dienstes, nicht aus der URL. Mehrere Anstöße laufen gestaffelt (1,2 s
  Abstand); beim ersten Mal fragt Chrome einmal, ob die Seite mehrere Dateien
  speichern darf.
* **Danach vom Server löschen.** Hängt `?weg=1` an den Link. Der Dienst räumt
  die Datei weg, sobald er sie vollständig hinausgeschrieben hat.

Eine **Playlist** wird nicht Stück für Stück angestoßen, sondern einmal als
ZIP der ganzen Gruppe, sobald darin nichts mehr läuft. Hundert einzelne
Downloads wären für jeden Browser eine Zumutung.

Was schon fertig war, **bevor** die Seite geöffnet wurde, wird nicht
nachträglich geladen – „fertig geworden" heißt: währenddessen. Und ein
ausgeschalteter Schalter merkt die Stücke trotzdem als gesehen vor; sonst
lüde ein späteres Einschalten rückwirkend alles herunter, was herumliegt.

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

## Die Ablage räumt sich selbst

Das gilt auch ohne den Schalter oben: fertige Dateien verschwinden nach
**6 Stunden**, die Ablage bleibt insgesamt
unter **40 GB** (darüber fliegt das Älteste zuerst). Beides sind
`Environment=`-Zeilen in der Unit – ändern, `systemctl daemon-reload`,
`systemctl restart downloader`, fertig. Kein Neuschreiben.

Ein Auftrag ist genau dann da, wenn sein Ordner da ist; daneben liegt ein
`auftrag.json` mit dem, was die Oberfläche anzeigt. Deshalb übersteht die
Liste einen Neustart des Dienstes, und es gibt nichts, was zwischen einer
Datenbank und der Platte auseinanderlaufen könnte.

## Playlists und das ZIP

`--flat-playlist` zählt die Liste nur auf, ohne jedes Video aufzuschlagen –
135 Einträge waren so in wenigen Sekunden da. Was angekreuzt wird, wandert
**einzeln** in die Schlange und bekommt eine gemeinsame Gruppen-Nummer; nur
dafür gibt es hinterher den ZIP-Knopf.

Beim ZIP steckt eine Falle, die der Prüflauf gefunden hat: `zip -j` wirft die
Ordnerpfade weg und **bricht ab**, sobald zwei Dateien danach gleich heißen
(„cannot repeat names in zip file", Exitcode 16, Archiv bleibt leer). Bei einer
Playlist ist das kein Sonderfall – zwei gleich betitelte Stücke reichen.
Deshalb bekommt jede Datei vorher einen *Bühnenplatz*: einen **harten Link**
unter einem durchnummerierten Namen. Hart, nicht kopiert – das kostet null
Bytes, weil alles im selben Dateisystem liegt –, und die Nummer stellt
zugleich die Reihenfolge der Liste wieder her, die im ZIP sonst verloren
ginge. Die Bühne heißt `.zip-*` und fällt damit aus dem Aufräumen heraus;
liegengebliebene räumt `raeumeBuehnen()` nach einer Stunde weg.

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
deno task probe     # 19 Proben, dauert ~45 s
```

`probe.js` läuft **nicht** gegen den laufenden Dienst und **nicht** gegen
YouTube: es baut sich mit ffmpeg eine eigene kleine Mediendatei, stellt sie
über einen eigenen Webserver bereit und startet den Lader als zweiten Prozess
mit eigenem Port und eigener Ablage. Geprüft werden URL-Abweisung, Erkunden,
Video- und MP3-Auftrag, Ausliefern samt Range-Anfragen, Gruppe und ZIP mit
gleichnamigen Stücken, Löschen, Aufräumen, Abbrechen, die Formatliste – und
das Abholen mit allen vier Fällen aus der Tabelle oben.

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
* **Nur Deutsch.** Der Rest des Hauses spricht drei Sprachen; dies hier liest
  genau eine Person.
* **Keine Kachel, kein Zählen, kein Eintrag auf `/spiele/`.**

## Rechtliches, einmal

YouTubes Nutzungsbedingungen verbieten das Herunterladen, unabhängig davon,
wie die Privatkopie im deutschen Urheberrecht steht. Hinter einem Passwort für
eine Person ist das eine Sache zwischen dem Betreiber und YouTube. Nichts
davon gehört in eine Kachel, und nichts davon wird verlinkt.
