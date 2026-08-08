# inf-zeus.de – Seitenrahmen

Alles, was auf inf-zeus.de nicht zu einem einzelnen Spiel gehört: die
Spieleübersicht, Impressum und Datenschutzerklärung, der gemeinsame Stil der
Rechtstexte und die Apache-Regeln des DocumentRoot.

Die sechs Spiele und der Bugreport liegen in eigenen Repos und werden hier
bewusst nicht mitversioniert – ein Fehler an der Startseite soll kein Spiel
mitreißen.

## Inhalt

| Pfad | Was |
|---|---|
| `spiele/index.html` | Startseite mit den sechs Spielkacheln, Statuspunkten und dem Spendenknopf |
| `impressum/index.html` | Anbieterkennzeichnung nach § 5 DDG |
| `datenschutz/index.html` | Datenschutzerklärung |
| `recht.css` | gemeinsamer Stil der beiden Rechtstexte |
| `spiele/bilder/` | Vorschaubilder der sechs Spiele (WebP) |
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
- Bugreport – Fehlermeldungen zu allen sechsen
- **Ich hab noch nie** (`/var/www/html/nochnie/`) ist live, hat aber **noch
  kein Repo** – deshalb fehlt es in der Aktualisierungsschleife unten.
- **Mäxchen** (`/var/www/html/maexchen/`) hat ein lokales Repo, aber **noch
  kein `origin`**. Bis es eins gibt, liegt der Quelltext nur auf diesem Server.

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
| 8075 | **Mäxchen** | `maexchen.service` |
| 8076 | Ich hab noch nie | `nochnie.service` |
| 8077 | Seconds | `seconds.service` |
| 8078 | Lucky Reflex | `luckyreflex.service` |
| 8079 | Bugreport | `bugreport.service` |
| 8080 | Talk-Signaling (Nextcloud) | Container |
| 8090 | Card Chaos | – |

Frei und der Reihe nach dran: **8074, 8073, 8072 …** abwärts. Alle Spiele
binden auf `127.0.0.1` und stehen nicht in UFW; nach außen führt
ausschließlich Apache.

## Vorschaubilder neu erzeugen

Die Bilder in `spiele/bilder/` sind **echte Bildschirmfotos laufender Partien**,
keine Zeichnungen. Von Hand waeren sie kaum zu machen: die Spiele brauchen
mindestens zwei Spieler, um etwas herzugeben. `werkzeug/aufnehmen.mjs` faehrt
deshalb mehrere Browsersitzungen gleichzeitig, macht einen echten Raum auf,
tritt bei, startet die Runde und drueckt ab. (Ich hab noch nie und Maexchen
bekommen drei Sitzungen: die Aufloesungsliste bzw. die Punkteleiste haette
sonst nur eine Zeile.)

```bash
cd /root/werkzeug-screenshots
node aufnehmen.mjs                 # alle sechs
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

## Alles auf einmal aktualisieren

```bash
for d in /var/www/html /var/www/html/{keep,cardchaos,seconds,luckyreflex,bugreport}; do
  printf '%-34s ' "$d"; git -C "$d" pull --ff-only
done
```
