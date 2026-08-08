# inf-zeus.de – Seitenrahmen

Alles, was auf inf-zeus.de nicht zu einem einzelnen Spiel gehört: die
Spieleübersicht, Impressum und Datenschutzerklärung, der gemeinsame Stil der
Rechtstexte und die Apache-Regeln des DocumentRoot.

Die zehn Spiele und der Bugreport liegen in eigenen Repos und werden hier
bewusst nicht mitversioniert – ein Fehler an der Startseite soll kein Spiel
mitreißen.

## Inhalt

| Pfad | Was |
|---|---|
| `spiele/index.html` | Startseite mit den zehn Spielkacheln, nach Kategorien gruppiert, Statuspunkten und dem Spendenknopf |
| `impressum/index.html` | Anbieterkennzeichnung nach § 5 DDG |
| `datenschutz/index.html` | Datenschutzerklärung |
| `recht.css` | gemeinsamer Stil der beiden Rechtstexte |
| `spiele/bilder/` | Vorschaubilder der zehn Spiele (WebP) |
| `werkzeug/aufnehmen.mjs` | erzeugt genau diese Bilder |
| `index.php` | Weiterleitung auf die Startseite |
| `.htaccess` | sperrt die interne Risikoliste, `/.git/` und `/werkzeug/` |

Kein Build-Schritt, keine Abhängigkeiten. Die Startseite trägt ihren Stil
inline, die beiden Rechtstexte teilen sich `recht.css`, damit sie nicht
auseinanderlaufen.

## Wo das liegt

Das Repo wird direkt nach `/var/www/html` ausgecheckt. Die `.gitignore` ist eine
**Freigabeliste**: erst wird alles ignoriert, dann werden die sechs Einträge
oben einzeln zugelassen. Nextcloud, die Tradingbots, die Spiel-Repos und
`RISIKEN-TODO.md` bleiben dadurch zuverlässig draußen.

## Verwandte Repos

- Keep · Card Chaos · Seconds · Lucky Reflex – die vier älteren Spiele
- Bugreport – Fehlermeldungen zu allen zehn
- Die sechs neueren Spiele – **Ich hab noch nie**, **Mäxchen**, **Wer am
  ehesten**, **Imposter**, **Reaktion** und **Kurven** – haben je ein
  **lokales** Repo, aber **noch kein `origin`**. Bis es eins gibt, liegt ihr
  Quelltext nur auf diesem Server. Deshalb fehlen sie auch in der
  Aktualisierungsschleife unten: ohne Remote gibt es nichts zu ziehen.

## Zwei Arten von Spiel

Seit Reaktion und Kurven gibt es hier zwei technisch grundverschiedene Sorten,
und der Unterschied entscheidet fast alles am Betrieb:

| | Server-Spiele | Spiele am Tisch |
|---|---|---|
| welche | Keep, Card Chaos, Seconds, Lucky Reflex, Ich hab noch nie, Mäxchen, Wer am ehesten, Imposter | **Reaktion, Kurven** |
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

Wer ein neues Spiel aufsetzt, sucht sich hier den nächsten freien. Ohne diese
Tabelle fällt eine Kollision erst im Betrieb auf – der zweite Dienst startet
dann einfach nicht.

| Port | Was | Dienst |
|---|---|---|
| 3000 | Keep | PM2 |
| 3002 | Whiteboard (Nextcloud) | Container |
| 5000 | Piper PDF Reader | – |
| 7867 | Notify Push (Nextcloud) | – |
| 8010 | Tradingbot Value | – |
| 8011 | Tradingbot Momentum | – |
| 8073 | **Imposter** | `imposter.service` |
| 8074 | **Wer am ehesten** | `amehesten.service` |
| 8075 | **Mäxchen** | `maexchen.service` |
| 8076 | Ich hab noch nie | `nochnie.service` |
| 8077 | Seconds | `seconds.service` |
| 8078 | Lucky Reflex | `luckyreflex.service` |
| 8079 | Bugreport | `bugreport.service` |
| 8080 | Talk-Signaling (Nextcloud) | Container |
| 8090 | Card Chaos | – |

Frei und der Reihe nach dran: **8072, 8071, 8070 …** abwärts. Alle Spiele
binden auf `127.0.0.1` und stehen nicht in UFW; nach außen führt
ausschließlich Apache.

## Vorschaubilder neu erzeugen

Die Bilder in `spiele/bilder/` sind **echte Bildschirmfotos laufender Partien**,
keine Zeichnungen. Von Hand waeren sie kaum zu machen: die Spiele brauchen
mindestens zwei Spieler, um etwas herzugeben. `werkzeug/aufnehmen.mjs` faehrt
deshalb mehrere Browsersitzungen gleichzeitig, macht einen echten Raum auf,
tritt bei, startet die Runde und drueckt ab. Nicht alle bekommen zwei
Sitzungen: Ich hab noch nie und Maexchen brauchen drei, Wer am ehesten vier,
Imposter fuenf – sonst haetten Aufloesungsliste, Punkteleiste, Balken bzw.
Hinweisreihe nur eine Zeile. (Imposter startet unter vier Leuten gar nicht.)
Reaktion und Kurven brauchen umgekehrt nur **eine** Sitzung: dort spielen alle
auf demselben Geraet.

```bash
cd /root/werkzeug-screenshots
node aufnehmen.mjs                 # alle zehn
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

Er öffnet **jeden** der zehn Dialoge und prüft Titel, Kurztext, Schrittzahl,
Vorschaubild (wirklich geladen, nicht nur verlinkt), den Spielen-Link, die
Überschriftenebenen und dass alle zehn Statuspunkte grün sind.

Bewusst *nicht* umgesetzt, obwohl `SPIELE-IDEEN.md` es vorschlägt: die
Spielliste als JS-Datenfeld, aus dem die Kacheln erst im Browser entstehen.
Dann zeigte die Seite ohne JavaScript gar keine Spiele mehr – und die Übersicht
ist der einzige Teil dieser Seite, der auch ohne JS etwas wert ist.

## Alles auf einmal aktualisieren

```bash
for d in /var/www/html /var/www/html/{keep,cardchaos,seconds,luckyreflex,bugreport}; do
  printf '%-34s ' "$d"; git -C "$d" pull --ff-only
done
```
