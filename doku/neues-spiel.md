# Ein neues Server-Spiel bauen

Vorlage ist **`/var/www/html/amehesten/`** – am wenigsten Sonderfälle und das
erste Spiel auf `raum.js`. `imposter` ist das komplexeste, `nochnie` das
älteste.

Freien Port holen: `jq -r '.portsFrei[0]' spiele.json`. Danach den Port dort
aus `portsFrei` entfernen und den neuen Eintrag unter `spiele` anlegen – sonst
startet der zweite Dienst still nicht.

## Der schnelle Weg

```bash
./werkzeug/neuspiel.sh <name> <port> "<Beschreibung>" "<Titel>" \
    "<Logo1>" "<Logo2>" "<Untertitel>" "<Emoji>" <maxSpieler>
```

Das legt den Ordner an, kopiert die gemeinsamen Teile hinein, schreibt die
immer gleiche HTML-Hülle (Home, Lobby, Spiel, Endstand, Hilfe), die
systemd-Unit und den Apache-Block. Übrig bleiben drei Dateien, die wirklich
dieses Spiel sind: `server.js`, `public/app.js` und ein CSS-Anhang unter dem
Endmarker in `public/style.css`. Danach Eintrag in `spiele.json`, dann

```bash
chown -R www-data:www-data /var/www/html/<name>
systemctl daemon-reload && systemctl enable --now <name>
a2enconf <name> && apache2ctl configtest && systemctl reload apache2
```

## Wenn niemand mitspielen muss

Die Sparte „Allein spielen" (Minenfeld, Sudoku, Wortgitter, Patience) ist
**rein statisch**: kein Dienst, kein Port, kein Apache-Block – Apache liefert
den Ordner direkt aus. Gerüst dafür:

```bash
./werkzeug/neusolo.sh <name> "<Titel>" "<Logo1>" "<Logo2>" "<Untertitel>" "<Emoji>"
```

Das ist kein Widerspruch zu „nie ohne Server": der Satz meint Spiele, die
**mehrere Leute an einem Gerät** spielen. Wer allein spielt, braucht keinen
Raum – und der Server hätte nichts zu tun, was der Browser nicht selbst kann.
Eintrag in `spiele.json` mit `"art": "statisch"`, ohne `port` und `dienst`.

## Dateien

```
<spiel>/
  server.js          nur noch Rundenlogik + handle()   (~400 Zeilen)
  <inhalt>.js        Karten-, Fragen- oder Wortlisten
  probe.js           spielt eine Partie mit echten Verbindungen durch
  deno.json          tasks: dev, check, probe
  README.md
  .gitignore
  public/index.html  vier Bildschirme: home, lobby, game, final
  public/style.css   gemeinsamer Block + Eigenes
  public/app.js
  bremse.js  raum.js  statisch.js      ← nicht schreiben, verteilen lassen
  public/schale.js                     ← ebenso: Verbindung, Lobby, Bildschirme
```

## Reihenfolge, die funktioniert

```bash
# 1. Eintrag in spiele.json anlegen, dann die gemeinsamen Teile holen
cd /var/www/html
node werkzeug/verteilen.mjs --nur <spiel>

# 2. Typprüfung und Probe lokal (Port frei wählen, nicht den echten)
cd /var/www/html/<spiel>
DENO_DIR=/tmp/deno-check deno check server.js <inhalt>.js probe.js public/app.js
DENO_DIR=/tmp/deno-check PORT=8171 HOST=127.0.0.1 deno task dev &
WS_URL=ws://127.0.0.1:8171/ws deno task probe
ss -tlnp | grep ':8171 '     # dann: kill <pid>   – niemals pkill -f

# 3. Dienst (Vorlage: /etc/systemd/system/amehesten.service)
#    Wichtig: User=www-data und DENO_DIR=/tmp/deno-cache – www-data darf
#    nicht in sein Home schreiben, Deno startet sonst gar nicht.
systemctl daemon-reload && systemctl enable --now <spiel>

# 4. Apache (Vorlage: /etc/apache2/conf-available/amehesten.conf)
#    Die /ws-Regel muss VOR der allgemeinen stehen.
a2enconf <spiel> && apache2ctl configtest && systemctl reload apache2

# 5. Rechte, sonst liest der Dienst seine eigenen Dateien nicht
chown -R www-data:www-data /var/www/html/<spiel>

# 6. Gegen live prüfen – das ist der eigentliche Nachweis
WS_URL=wss://inf-zeus.de/<spiel>/ws deno task probe
```

Danach: Bild und Kachel nach `doku/startseite.md`, Repo nach `doku/betrieb.md`.

## server.js aufbauen

Der Kopf ist immer gleich: Inhalt und Bremse importieren, Konstanten,
`raumverwaltung({…})` mit den Haken des Spiels. Wie das aussieht, steht in
`doku/gemeinsam.md`; der lebende Beweis ist `amehesten/server.js`.

Danach kommt nur noch, was dieses Spiel ausmacht:

- **Rundenablauf** – `startGame`, `naechsteRunde`, `pushRunde`, `finishGame`,
  `backToLobby`. `pushRunde` schickt an **jeden einzeln**, sobald ein Spieler
  etwas sehen darf, was ein anderer nicht sieht.
- **`handle(ws, msg)`** – `ping`, `browse`, `create`, `join` sind in allen
  Spielen gleich aufgebaut; danach der spielspezifische `switch`.
- Zum Schluss `starte({ … })`.

## Zwei Dinge, die jedes Mal schiefgehen

Beide stehen in `CLAUDE.md` unter „Die drei Fallen": die Steuerzeichen-Regex
und deutsche Anführungszeichen in JS-Strings. Nach dem Schreiben prüfen, nicht
vorher darauf vertrauen.
