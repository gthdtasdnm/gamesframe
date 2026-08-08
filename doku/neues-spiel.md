# Ein neues Server-Spiel bauen

Vorlage ist **`/var/www/html/amehesten/`** – am wenigsten Sonderfälle und das
erste Spiel auf `raum.js`. `imposter` ist das komplexeste, `nochnie` das
älteste.

Freien Port holen: `jq -r '.portsFrei[0]' spiele.json`. Danach den Port dort
aus `portsFrei` entfernen und den neuen Eintrag unter `spiele` anlegen – sonst
startet der zweite Dienst still nicht.

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

## Wann es kein Server-Spiel sein muss

Geht ein Spiel ohne Server, geht es auch ohne Dienst, Port, Apache-Block und
Bremse. Achtung: laut Richtungsentscheidung in `SPIELE-IDEEN.md` soll **jedes**
Spiel auf ein Gerät pro Person umgestellt werden – neue Spiele deshalb direkt
als Server-Spiel bauen.
