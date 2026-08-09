# inf-zeus.de – Seitenrahmen

Alles, was auf inf-zeus.de nicht zu einem einzelnen Spiel gehört: die
Spieleübersicht, Impressum und Datenschutzerklärung, der gemeinsame Stil der
Rechtstexte und die Apache-Regeln des DocumentRoot.

Die elf Spiele und der Bugreport liegen in eigenen Repos und werden hier
bewusst nicht mitversioniert – ein Fehler an der Startseite soll kein Spiel
mitreißen.

## Inhalt

| Pfad | Was |
|---|---|
| `spiele/index.html` | Startseite mit den elf Spielkacheln, nach Kategorien gruppiert, Statuspunkten und dem Spendenknopf |
| `impressum/index.html` | Anbieterkennzeichnung nach § 5 DDG |
| `datenschutz/index.html` | Datenschutzerklärung |
| `recht.css` | gemeinsamer Stil der beiden Rechtstexte |
| `spiele/bilder/` | Vorschaubilder der elf Spiele (WebP) |
| `werkzeug/aufnehmen.mjs` | erzeugt genau diese Bilder |
| `index.php` | Weiterleitung auf die Startseite |
| `spiele.json` | Pfade, Ports, Dienste und Repos aller Spiele – einzige Quelle |
| `gemeinsam/` | Vorlagen, die in jedes Spiel kopiert werden |
| `werkzeug/verteilen.mjs` | kopiert sie dorthin und meldet Abweichungen |
| `doku/` | Handreichungen nach Aufgabe getrennt |
| `.htaccess` | sperrt die internen Dateien, `/.git/`, `/werkzeug/`, `/gemeinsam/` und `/doku/` |

Kein Build-Schritt, keine Abhängigkeiten. Die Startseite trägt ihren Stil
inline, die beiden Rechtstexte teilen sich `recht.css`, damit sie nicht
auseinanderlaufen.

## Wo das liegt

Das Repo wird direkt nach `/var/www/html` ausgecheckt. Die `.gitignore` ist eine
**Freigabeliste**: erst wird alles ignoriert, dann werden die sechs Einträge
oben einzeln zugelassen. Nextcloud, die Tradingbots, die Spiel-Repos und
`RISIKEN-TODO.md` bleiben dadurch zuverlässig draußen.

## Verwandte Repos

Welches Spiel wohin gehört, steht in `spiele.json` unter `repo`:

```bash
jq -r '.spiele[] | "\(.titel)\t\(.repo // "– noch keins")"' spiele.json
```

Seit dem 09.08.2026 hat **jedes** Spiel ein Remote; bei den sieben neueren
heißt das Repo wie der Ordner. Kein Spiel liegt mehr ausschließlich auf diesem
Server.

## Zwei Arten von Spiel

Seit Reaktion und Kurven gibt es hier zwei technisch grundverschiedene Sorten,
und der Unterschied entscheidet fast alles am Betrieb:

| | Server-Spiele | Spiele am Tisch |
|---|---|---|
| welche | `jq -r '.spiele[]\|select(.art=="server").titel' spiele.json` | **Reaktion, Kurven** |
| Geräte | eines je Person | **eines für alle** |
| Dienst | je einer (systemd) | **keiner** |
| Port | je einer | **keiner** |
| Apache | `Location` mit Proxy und WebSocket | **nichts** – statische Dateien |
| `bremse.js` | ja | **nein**, es gibt keine Verbindung |
| Prüfung | `deno task probe` gegen den Server | `node pruefe-<name>.mjs` im Browser |

Die zweite Sorte kann nicht abstürzen, hält keinen Zustand und braucht keine
Wartung. Wer ein neues Spiel plant: falls es ohne Server geht, geht es auch
ohne alles andere in der Tabelle.

## Ports

Die Belegung steht in **`spiele.json`** – dort und nirgends sonst, damit sie
nicht auseinanderläuft. Ohne den Blick dorthin fällt eine Kollision erst im
Betrieb auf: der zweite Dienst startet dann einfach nicht.

```bash
jq -r '.spiele[] | "\(.port // "-")\t\(.titel)\t\(.dienst // "-")"' spiele.json
jq -r '.portsFrei[0]' spiele.json     # nächster freier Port
jq -r '.portsFremd' spiele.json       # belegt, aber nicht von Spielen
```

Wer einen Port nimmt, streicht ihn dort aus `portsFrei`. Alle Spiele binden auf
`127.0.0.1` und stehen nicht in UFW; nach außen führt ausschließlich Apache.

## Gemeinsame Teile

Vier Dinge sind in allen Spielen gleich: die Bremse, die Raumverwaltung, der
statische Einstieg und der obere CSS-Block. Sie liegen in `gemeinsam/` und
werden von dort in jedes Spiel **kopiert** – nicht importiert.

Der Grund ist dieselbe Linie wie bei den getrennten Repos: würden alle Spiele
zur Laufzeit dieselbe Datei laden, risse ein Fehler darin alle gleichzeitig
mit. So behält jedes Spiel eine vollständige eigene Kopie und läuft auch ohne
diesen Ordner weiter.

```bash
node werkzeug/verteilen.mjs --pruefen        # Abweichungen melden
node werkzeug/verteilen.mjs --nur imposter   # ein Spiel ausrollen
```

Ausgerollt wird Spiel für Spiel, mit `deno task probe` dazwischen.

## Vorschaubilder neu erzeugen

Die Bilder in `spiele/bilder/` sind **echte Bildschirmfotos laufender Partien**,
keine Zeichnungen. Von Hand waeren sie kaum zu machen: die Spiele brauchen
mindestens zwei Spieler, um etwas herzugeben. `werkzeug/aufnehmen.mjs` faehrt
deshalb mehrere Browsersitzungen gleichzeitig, macht einen echten Raum auf,
tritt bei, startet die Runde und drueckt ab. Nicht alle bekommen zwei
Sitzungen: Ich hab noch nie und Maexchen brauchen drei, Wer am ehesten vier,
Imposter fuenf – sonst haetten Aufloesungsliste, Punkteleiste, Balken bzw.
Hinweisreihe nur eine Zeile. (Imposter startet unter vier Leuten gar nicht.)
Flaschendrehen bekommt fuenf – der Kreis lebt davon, dass Namen darauf
verteilt sind. Reaktion und Kurven brauchen umgekehrt nur **eine** Sitzung:
dort spielen alle auf demselben Geraet.

```bash
cd /root/werkzeug-screenshots
node aufnehmen.mjs                 # alle elf
node aufnehmen.mjs cardchaos       # nur eins
```

Danach die Datei aus `/root/werkzeug-screenshots/` zurueck nach `werkzeug/`
kopieren, falls sie sich geaendert hat.

Zwei Voraussetzungen, die auf einem frischen Server fehlen:

- **Playwright samt Chromium** (`npm i playwright && npx playwright install
  chromium`). Nicht `--with-deps` benutzen, solange das kaputte MongoDB-Repo in
  den apt-Quellen steht – das laesst jedes `apt update` scheitern.
- **Eine Emoji-Schrift.** Ohne sie zeigen die Bilder leere Kaestchen statt
  Spielfiguren und Symbolen; bei Seconds waeren die Karten komplett leer.
  Liegt unter `/usr/local/share/fonts/emoji/NotoColorEmoji.ttf`.

Die Bilder werden zum Schluss nach WebP umgewandelt (rund ein Zehntel der
PNG-Groesse) und die PNG geloescht.

## Startseite prüfen

Seit dem Umbau auf Kategorien liest der Anleitungsdialog seinen Inhalt aus der
Kachel selbst (`data-kurz`, `data-bild` und ein `<template class="ablauf">`).
Damit steht jedes Spiel **einmal** in der Datei statt zweimal – vorher gab es
zusätzlich ein JS-Objekt `SPIELE`, und bei zehn Spielen laufen zwei Fassungen
unweigerlich auseinander.

Die Kehrseite: ein leerer Dialog fällt niemandem auf, weil die Seite ohne ihn
normal aussieht. Deshalb gibt es dafür einen Prüflauf:

```bash
cd /root/werkzeug-screenshots
node pruefe-startseite.mjs
```

Er öffnet **jeden** Dialog und prüft Titel, Kurztext, Schrittzahl,
Vorschaubild (wirklich geladen, nicht nur verlinkt), den Spielen-Link, die
Überschriftenebenen und dass alle Statuspunkte grün sind. Ausserdem prüft
er die Zahl im Untertitel gegen die Zahl der Kacheln – genau dieser Text
wurde beim Hinzufügen eines Spiels schon vergessen.

Bewusst *nicht* umgesetzt, obwohl `SPIELE-IDEEN.md` es vorschlägt: die
Spielliste als JS-Datenfeld, aus dem die Kacheln erst im Browser entstehen.
Dann zeigte die Seite ohne JavaScript gar keine Spiele mehr – und die Übersicht
ist der einzige Teil dieser Seite, der auch ohne JS etwas wert ist.

## Alles auf einmal aktualisieren

Seit alle Spiele ein Remote haben, kommt die Liste aus `spiele.json` statt aus
einer Aufzählung, die beim nächsten Spiel wieder vergessen wird:

```bash
cd /var/www/html
{ echo .; jq -r '.spiele[].name' spiele.json; } | while read d; do
  printf '%-14s ' "$d"; git -C "/var/www/html/$d" pull --ff-only
done
```
