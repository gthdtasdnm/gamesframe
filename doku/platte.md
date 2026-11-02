# Platte (`/platte/`) – YouTube Music ohne Werbung

Kein Spiel. Kachel mit Schloss auf der Startseite (neben der Röhre).
`noindex`. **Passwortgeschützt** – dieselbe Anmeldung wie Röhre und Lader
(Formular, Keks ein Jahr – `doku/betrieb.md`). Nur für den Betreiber, nur
Deutsch.

Angelegt am 23.10.2026, nach dem Muster der Röhre. Anlass: Desktop-Programme
wie „Liner“ holen ihre Lieder von YouTube Music – das geht auch als eigene
Seite.

## Was es tut

Seit dem 23.10.2026 (Abend) aufgebaut wie Spotify / YouTube Music, zuerst
fürs Handy: unten vier Reiter, darüber der Mini-Spieler als Karte in der
Farbe des Covers. Am Rechner links eine Seitenleiste mit allen Playlists,
unten eine Spielerleiste mit Lautstärke.

* **Start** – Gruß, Schnellauswahl (Mag ich, Dein Mix, Neu für dich,
  Heruntergeladen und die vier Playlists, aus denen zuletzt am meisten lief),
  *Gleich im Mix*, *Neu für dich*, zuletzt gehört, deine Künstler, Playlists.
  Ist das Konto abgemeldet, steht oben ein Hinweis.
* **Erkunden** – neue Alben und Singles, Angesagt, neue Musikvideos, dazu
  Stimmungen und Genres von YouTube Music (je eine Seite mit Playlists).
* **Suche** – leer: letzte Suchen und Genre-Kacheln; beim Tippen eigene
  Vorschläge; Ergebnis mit Reitern *Alle / Titel / Künstler / Alben* und dem
  Künstler, der genau so heißt, groß oben.
* **Bibliothek** – Mag ich, Heruntergeladen, Neu für dich, Oft gehört, alle
  Playlists (eigene zuerst); Filter Playlists / Künstler / Heruntergeladen;
  gesperrte Künstler unter *Künstler*. Oben `+` legt eine Playlist an.
* **Sammlungsseiten** (Album, Playlist, Mag ich, …) – Kopf in der Farbe des
  Covers, eigene Playlists mit Mosaik aus vier Covern; *Alle herunterladen*,
  *Alle zu einer Playlist*, *Zufall*, *Abspielen*. Eigene Playlists:
  Stift = Bearbeiten (Ziehen zum Umsortieren, ✕ zum Entfernen), `⋮` =
  Umbenennen, Löschen.
* **Lied antippen** spielt es und öffnet am Handy sofort den großen Spieler
  (am Rechner nicht – dort ist die Spielerleiste unten schon groß genug).
  Künstler und Album unter einem Lied sind nur Text, keine Links – man hat
  sich zu oft verklickt; hin geht es über das Menü oder den großen Spieler.
* **Liedmenü** (`⋮` oder lange drücken) – Mag ich, *Zur Playlist hinzufügen*
  (mit *Neue Playlist*), Als Nächstes, Zur Warteschlange, *Herunterladen*,
  *Als Datei speichern*, Radio, Album, Künstler, Teilen, Aus dieser Playlist
  entfernen, Nicht mehr spielen, Künstler nicht mehr vorschlagen.
* **Spieler** – Vollbild mit Hintergrund aus der Cover-Farbe, Zufall,
  Wiederholen (aus / alle / eins), Songtext, Herunterladen, Schlaftimer
  (5–90 Min. oder Ende des Lieds), *Als Nächstes* mit Ziehen und ✕, *Leeren*.
  Wischen: Mini-Spieler seitlich = Lied wechseln, nach oben = groß; im
  Vollbild nach unten = klein, Cover seitlich = Lied wechseln. Die
  Zurück-Taste am Handy schließt Vollbild und Menüs. Sperrbildschirm und
  Kopfhörertasten über die Media Session. Die Schlange (samt Zufall und
  Wiederholen) merkt sich der Browser.
* **Einstellungen** (Zahnrad auf Start) – Konto verbinden (prüft beim Öffnen,
  ob die Kekse noch gelten), Takeout, Anteil Neues (0–80 %, Vorgabe 30 %),
  Speicher der Downloads.

**Vorladen und Überblenden** (`public/app.js`, `spieler`): zwei
`<audio>`-Spuren. Während eines spielt, lädt die andere schon das nächste
(`vorladen()`) – der Server holt dabei die Adresse von yt-dlp, der Browser die
ersten Sekunden. Weiter von Hand tauscht nur die Spuren (im Test 0,2 s bis zum
Ton). Kurz vor Schluss blendet der Spieler über (Vorgabe 6 s, 0–12 s in den
Einstellungen, je Gerät in `localStorage`): beide laufen, Kosinus raus, Sinus
rein; das neue Lied steht dann schon in der Anzeige. Nicht bei *Dieses Lied
wiederholen*, nicht beim Schlaftimer „Ende des Lieds“, nicht bei Liedern unter
dreifacher Blendlänge, und nur, wenn das nächste schon bereitliegt. **Am
iPhone gibt es kein Überblenden** – Safari lässt die Lautstärke eines
`<audio>` nicht setzen; vorgeladen wird trotzdem. Events zählen nur von der
Spur, die gerade spielt (`an()`).

**Start bleibt beim Neuladen stehen** (wie bei YouTube Music, anders als die
Röhre): *Gleich im Mix* und *Neu für dich* sind ein fester Stapel
(`festerMix()` in `server.js`, liegt als `stand.fest`), neu gewürfelt erst
nach sechs Stunden oder wenn weniger als acht übrig sind. *Dein Mix* spielt
genau diesen Stapel und geht danach endlos weiter.

**Ruhige Animationen am Handy**: kein `backdrop-filter`, kein
`content-visibility` (beides ließ in Brave/Chrome am Handy die Balken des
laufenden Lieds und den Download-Knopf flackern); Symbole werden nur getauscht,
wenn sie sich ändern (`setzeIcon()`); Laden zeigt einen Ring statt zu pulsieren.

Endet eine Playlist oder ein Album, läuft das Radio des letzten Liedes
weiter (außer bei *Alles wiederholen*). Ein Lied aus der Suche spielt mit
seinem Radio dahinter.

## Playlists

Drei Sorten in `stand.listen`, Feld `quelle`:

| Quelle | Woher | Ändern |
|---|---|---|
| `eigen` | hier angelegt (`eigen-<12 Zeichen>`) | alles: hinzu, entfernen, umsortieren, umbenennen, löschen |
| `konto` | Abgleich mit YouTube Music | nur Playlists mit `PL…`: hinzu und entfernen gehen **ans Konto** (`browse/edit_playlist`), erst danach hier. Mixe und Rückblicke (`RD…`, `LR…`) gehören YouTube. |
| `takeout` | Takeout-ZIP | nichts |

Gespeicherte Playlists öffnen **aus dem Stand**, nicht live bei YouTube –
sofort da, und auch bei abgelaufenen Keksen. Entfernen aus einer
Konto-Playlist braucht die Zeilen-Id (`playlistSetVideoId`); die merkt sich
der Abgleich als `sets`. Ein gerade hinzugefügtes Lied lässt sich deshalb
erst nach dem nächsten Abgleich wieder aus einer Konto-Playlist nehmen.
Was in einer Playlist liegt, gehört zu dir (`quellen.liste`).

**Das Schreiben ans Konto ist am 23.10.2026 nicht geprüft** – die Kekse waren
da schon abgelaufen. Scheitert es, kommt die Meldung von YouTube Music, und
hier bleibt alles, wie es war.

## Herunterladen

Zwei Wege, beide über `/api/datei/<id>`:

* **Herunterladen** (in der App, wie bei Spotify): `public/offline.js` legt
  die Datei samt Cover in IndexedDB ab. Der Spieler nimmt dann die Datei aus
  dem Browser statt den Durchreicher – geht ohne Netz und ohne Warten. Ganze
  Playlists über den Pfeil im Kopf, eins nach dem anderen, mit Leiste über dem
  Mini-Spieler. `navigator.storage.persist()` wird beim ersten Mal erbeten.
* **Als Datei speichern**: dieselbe Datei als Download aufs Gerät.

Der Server holt die ganze Spur in 2-MB-Häppchen (wie beim Abspielen), dann
schreibt **ffmpeg** Titel, Künstler, Album und Cover hinein (`-c copy`, nichts
wird neu kodiert). Angaben aus dem Stand oder von YouTube Music, nie aus dem
Browser. Gut drei Sekunden je Lied, ~5 MB für fünf Minuten. Zwischendateien in
`daten/tmp/`, danach gelöscht. Fehlt ffmpeg, kommt die Spur ohne Angaben.

**Ohne Netz**: `public/sw.js` hält die Hülle der Seite vor (immer erst das
Netz, Vorrat nur als Ersatz; `/api/` nie; umgeleitete Antworten – die
Anmeldung – nie). Ohne Netz zeigt die Seite *Ohne Netz* mit dem
Heruntergeladenen. Am Browser geprüft (Playwright, Netz aus, Seite neu laden,
Lied spielt aus dem Browser).

## Die Mischung (`mix.js`)

Reine Rechnung, in `probe.js` ohne Netz festgehalten.

| Regel | Wirkung |
|---|---|
| **Gehört zu dir**: gemocht, in einer Playlist, in der Bibliothek oder ≥ 2× gehört (hier oder laut Takeout/Konto) | nur das kommt in den „bekannten“ Teil |
| **Basis**: Like 3, Playlist/Bibliothek 1,5, sonst 0,5 + 0,25·log2(1 + gehört), höchstens 2 | |
| **Pause**: gerade gespielt × 0,05, nach drei Tagen wieder × 1 | nicht jeden Tag dieselbe Handvoll |
| **Treue**: (1 + zu Ende) / (1 + zu Ende + 1,5 × weiter), mindestens 0,1 | frühes Weiterschalten kostet |
| **Puls je Künstler** wie in der Röhre: Start +0,3, zu Ende +0,7, Like +2, früh weiter −0,4, *Nicht mehr spielen* −1; halbiert sich alle 14 Tage; −0,8 bis 8 | Interesse = 1 + Puls |
| **Abstand**: derselbe Künstler höchstens einmal in vier Liedern | erst aus dem anderen Topf, erst zuletzt ohne Abstand |
| **Neues** in festen Abständen nach dem Anteil (30 % = jedes dritte bis vierte) | nicht hinten angehängt |
| Neues gereiht nach Interesse am Künstler des Samens × am eigenen Künstler × Frische (7 Tage) | |
| bei jedem Laden gewürfelt × 0,7–1,3 | |

„Früh weiter“ heißt: unter 30 Sekunden oder unter 35 % des Liedes. Neues,
das nach unter 30 Sekunden weggeschaltet wird, kommt **nie wieder**. Ab 90 %
zählt Weiterschalten als zu Ende gehört.

## Woher die Lieder kommen

**Zwei Quellen für die Bibliothek** – so gewünscht:

1. **Google Takeout** (`takeout.js`). Dasselbe ZIP wie für die Röhre; hier
   zählt, was die Röhre wegwirft:
   * `Wiedergabeverlauf.json`, nur `header: "YouTube Music"` (beim Export vom
     20.10.2026: 977 Einträge) – je Lied gezählt (`tk`), Künstler der letzten
     60 Tage bekommen einen gedämpften Puls (0,5·log2(1 + n), höchstens 3).
   * `Playlists/*.csv` – eigene Playlists als `takeout:<name>`. „Später
     ansehen“ bleibt draußen; eine Liste, die nach *Mag ich … Musik* heißt,
     wird zu Likes.
   * eine Musikbibliothek-CSV, falls im Export.

   Der Export kennt meist nur Ids (Playlists) oder Kanalnamen wie
   „Queen - Topic“ (Verlauf). Der Sammler schlägt jedes solche Lied einmal
   nach (`nachschlagen`, eins alle 1,2 s): Titel, Künstler mit Id, Album,
   Länge, Bild. 1000 Lieder ≈ 20 Minuten. Der Stand steht unten auf *Konto*.

2. **Das YouTube-Music-Konto** (`ym.js`, Abschnitt *Konto*). Cookies von
   `music.youtube.com` (Netscape-`cookies.txt` aus einer Browser-Erweiterung
   wie „Get cookies.txt LOCALLY“, oder der rohe `Cookie:`-Kopf aus den
   Entwicklerwerkzeugen). Angemeldet wird wie im Browser: Cookie plus
   `SAPISIDHASH`. Alle 6 Stunden (und gleich nach dem Verbinden):
   * Likes (`VLLM`, mit Fortsetzungen bis 5000),
   * eigene Playlists (`FEmusic_liked_playlists`, je bis 1000 Titel),
   * Verlauf (`FEmusic_history`).

   **In die andere Richtung geht nur das Herz**: ein Like hier geht als
   `like/like` bzw. `like/removelike` ans Konto. Scheitert das, bleibt es
   hier gemerkt („Nur hier gemerkt …“). Was im Konto entliked wurde,
   verschwindet beim nächsten Abgleich auch hier (`kontoLike`).

   Liegt in `daten/konto.txt` (0600, `www-data`). *Trennen* löscht die Datei.
   Am 23.10.2026 nachmittags mit dem echten Konto verbunden (439 Likes, 22
   Playlists) – **eine Stunde später waren die Kekse abgemeldet**. Seitdem:
   * Kekse, die Google in Antworten erneuert (`Set-Cookie`: SIDCC,
     `__Secure-…PSIDTS`), werden übernommen und in `konto.txt` geschrieben.
     Ob das allein reicht, ist offen – geprüft werden konnte es nicht mehr.
   * Gespeichert werden nur die Kekse von youtube.com (als `Cookie:`-Zeile),
     nicht die ganze Ausfuhr aus dem Browser. Höchstens 2 MB werden
     angenommen (vorher 200 KB – eine Ausfuhr aller Seiten war abgeschnitten).
   * *Einstellungen* prüft beim Öffnen, ob die Kekse noch gelten
     (`?pruefen=1`); abgemeldet → Hinweis auf Start und Einstellungen.

   Tipp für haltbare Cookies: in einem privaten Fenster bei YouTube Music
   anmelden, exportieren, Fenster schließen **ohne** abzumelden. Abmelden
   macht die Cookies sofort ungültig.

**Neues** (`sammler.js`): Liegen weniger als 60 ungehörte neue Lieder bereit,
alle 15 Minuten drei Samen (Lieder, die du magst oder zu Ende hörst, gezogen
nach Interesse am Künstler, je Künstler einer), je Samen das Radio
(`next` mit `RDAMVM<id>`), davon höchstens acht Unbekannte und zwei je
Künstler, nichts unter einer oder über 15 Minuten. Wer *Radio* startet,
schiebt drei davon gleich in den Vorrat. Reicht der Vorrat beim Mix nicht,
wird sofort nachgeholt. Neues, das drei Wochen nie gespielt wurde, fliegt
wieder raus.

## YouTube Music lesen (`ym.js`)

Dieselbe InnerTube wie bei der Röhre, aber unter `music.youtube.com` und als
Client `WEB_REMIX`. Wieder kein fester Pfad durch das JSON, sondern die
Bausteine suchen: `musicResponsiveListItemRenderer` (Zeile),
`musicTwoRowItemRenderer` (Kachel), `playlistPanelVideoRenderer` (Radio).

Nachgemessen am 23.10.2026:

* **Die Suche ohne Filter taugt nicht mehr**: eine flache Liste aus 30
  `itemSectionRenderer`, ohne Regale, voller Podcastfolgen. Deshalb drei
  gefilterte Suchen nebeneinander (Titel, Künstler, Alben – `params` in
  `FILTER`), die liefern ordentliche Regale.
* **Radio** (`next` mit `playlistId: RDAMVM<id>`): das Lied selbst steht
  vorn, mit allem, was man wissen will. Deshalb dient derselbe Aufruf zum
  Nachschlagen, und er trägt auch die Id für den Songtext (`MPLYt…`).
* **Albumzeilen** haben weder Künstler noch Bild – die kommen aus dem Kopf.
* Künstlerseiten: *Top-Songs* ohne Länge.

Echte Antworten liegen in `platte/proben/` und werden im Prüflauf gelesen.
Wenn dort etwas kippt, hat sich meist ein Baustein umbenannt: neue Antwort
abholen (ein `POST` an `music.youtube.com/youtubei/v1/<pfad>` mit dem
`KONTEXT` aus `ym.js` und dem Keks `SOCS=CAI`), in `proben/` ablegen, Probe
anpassen.

## Abspielen (`strom.js`)

Wie in der Röhre, nur ohne Bild und deshalb ohne DASH und Shaka:

1. `yt-dlp -J` (gut zwei Sekunden) → die **m4a-Spur** (AAC, ~128 kbit/s).
   Die spielt jeder Browser direkt im `<audio>`, auch Safari.
2. Die Adresse gilt nur für die IP des Servers – `/api/strom/<id>` reicht
   durch, in Bereichen (offene Bereiche auf 2 MB gekappt). Am Stück wäre es
   auf ~300 KB/s gedrosselt.
3. **Immer nur ein yt-dlp zur Zeit** (Warteschlange in `strom.js`). Jeder
   Aufruf startet für YouTubes Prüfung einen eigenen Deno-Prozess; drei
   nebeneinander haben den Dienst am 23.10.2026 über sein Speicherlimit
   gedrückt, danach hing er. Was gleich spielen soll, kommt vor das Vorladen;
   von wartendem Vorladen bleiben nur die letzten zwei. Speicherlimit seitdem
   `MemoryHigh=1500M`, `MemoryMax=1800M`.
4. Damit zwischen zwei Liedern keine zwei Sekunden Stille stehen, holt die
   Oberfläche beim Start eines Liedes das nächste schon vor
   (`/api/vorbereiten/<id>`). Ergebnis hält drei Stunden, 403/410 holt einmal
   neu.

Fürs Abspielen werden **nicht** die Konto-Cookies benutzt. Wie bei Röhre und
Lader kann ein Wegwerfkonto als `daten/cookies.txt` daneben liegen, falls
YouTube einmal zumacht – am 23.10.2026 ging es ohne.

Am Browser geprüft (Playwright, 390 px als Handy mit Touch und 1300 px):
alle Seiten, Ton läuft, Menü, Playlist anlegen und füllen, Bearbeiten,
Vollbild, Schlange, Songtext, Schlaftimer, Zurück-Taste, Herunterladen,
ohne Netz neu laden und abspielen; keine JS-Fehler, keine waagerechte
Scrollleiste. Am iPhone **nicht** geprüft – Safari hält die
Hintergrundwiedergabe einer Webseite nicht immer durch.

## Wo was liegt

```
/var/www/html/platte/
  server.js      Routen, Rückmeldungen, Konto verbinden
  mix.js         die Mischung - reine Rechnung
  sammler.js     Nachschlagen, Entdecken, Konto-Abgleich (Hintergrund)
  ym.js          InnerTube von YouTube Music, Konto (SAPISIDHASH)
  strom.js       yt-dlp, Durchreichen
  takeout.js     Takeout-ZIP: Verlauf, Playlists, Bibliothek
  speicher.js    daten/stand.json, gebündelt und atomar geschrieben
  probe.js       Prüflauf
  proben/        echte Antworten von YouTube Music (23.10.2026)
  public/        index.html, stil.css, app.js, offline.js (Downloads im
                 Browser), sw.js (Hülle ohne Netz), Manifest, Symbol
  daten/         stand.json, konto.txt, optional cookies.txt, tmp/ (www-data, 0700)
```

| Was | Wo |
|---|---|
| Dienst | `/etc/systemd/system/platte.service`, Port 8097, nur 127.0.0.1; `--allow-run` yt-dlp und ffmpeg |
| Passwort und Weiterleitung | `<Location /platte/>` in `/etc/apache2/sites-available/inf-zeus.conf` |
| Warteraum | `platte` steht in der Ausnahmeliste (wie `roehre`) |
| yt-dlp aktuell halten | derselbe `ytdlp-aktuell.timer` wie Lader und Röhre |
| Eintrag | `spiele.json` unter `still` |
| Kachel | `index.html`, Stapel Werkzeuge, nach der Röhre |

Der Ordner liegt **nicht im Repo** (`.gitignore` ist eine Freigabeliste), wie
Röhre und Lader.

## Prüfen

```bash
cd /var/www/html/platte
deno task check && deno task probe     # eigener Port 8397, ohne YouTube
NETZ=1 deno task probe                 # dazu Suche, Radio, Songtext, Ton, Erkunden, Datei
systemctl restart platte && systemctl status platte --no-pager | head -5
```

## Was bewusst fehlt

* **Keine Podcasts, keine Videos** – nur der Ton.
* **Ans Konto geht nur das Herz und Hinzufügen/Entfernen in eigenen
  Konto-Playlists.** Der Verlauf bei YouTube Music bleibt unberührt; was hier
  gehört wird, weiß Google nicht. Eigene Playlists von hier bleiben hier.
* **Keine persönliche YouTube-Startseite.** `FEmusic_home` mit Konto lieferte
  am 23.10.2026 nur „Schnellauswahl“ und ein Regal „Hits von heute“ – weniger
  als der eigene Mix.
* **Kein zeitgenauer Songtext, kein Überblenden, keine Geräteauswahl.**
* **Keine gemeinsamen Teile**, keine Spielkachel, nur Deutsch.

## Rechtliches, einmal

Wie bei Lader und Röhre: YouTubes Nutzungsbedingungen sehen das nicht vor.
Hinter einem Passwort für eine Person ist das eine Sache zwischen dem
Betreiber und YouTube. Das Konto, dessen Cookies hier liegen, kann Google
im schlimmsten Fall sperren – deshalb geht davon nur Lesen und das Herz aus,
und abgespielt wird ohne es.
