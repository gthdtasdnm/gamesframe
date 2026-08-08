# inf-zeus.de – Handreichung

Für die nächste Sitzung. Was hier steht, ist der Stand vom **08.08.2026** und
lässt sich am Server nachprüfen; wo etwas offen ist, steht das ausdrücklich da.

---

## Worum es geht

`/var/www/html` ist der DocumentRoot von **inf-zeus.de**. Darin liegen elf
Browserspiele, eine Spieleübersicht, ein Bugreport-Werkzeug, zwei Rechtstexte –
und, damit nicht verwechselt, auch Nextcloud und zwei Tradingbots, die mit den
Spielen nichts zu tun haben.

**Die Spiele sind der Arbeitsbereich. Nextcloud, `tradingbot_value`,
`tradingbot_momentum`, `/reader/` und `_alt-tot-20260807` nicht** – die nur
anfassen, wenn ausdrücklich danach gefragt wird.

## Wie hier gearbeitet wird

Der Nutzer will, dass Arbeit **autonom durchläuft**: eigene Entscheidungen
treffen, keine Zwischenfragen, und **direkt auf den Live-Server ausliefern**
statt nur vorzubereiten. Wörtlich: *„treff deine eigenen entscheidungen und
stell keine fragen … wenn etwas mit dem spiel nicht gefällt ändere ich es
später."*

Der Server hat derzeit keine echten Nutzer – ein Fehler im Betrieb ist billig,
eine Rückfrage teuer.

Trotzdem gilt:

- **Nichts abhaken, was nicht nachweislich läuft.** Zu jedem Spiel gehört ein
  Prüflauf, und der muss gegen die **Live-Adresse** grün sein.
- **Offene Punkte werden geschrieben, nicht gefragt** – in `RISIKEN-TODO.md`
  (Sicherheit/Betrieb) oder `SPIELE-IDEEN.md` (Spielideen und Struktur).
- **Ausnahme von „keine Fragen": Schritte nach außen.** Ein GitHub-Repo
  anlegen, etwas veröffentlichen, Geld berühren – das dokumentieren statt
  eigenmächtig tun.

## Die Arbeitsliste

**`SPIELE-IDEEN.md` ist der Vorrat.** Wenn es heißt „bau die Spiele aus meiner
Datei", ist diese gemeint. Sie enthält Kandidaten mit Aufwandsschätzung
(S/M/L), eine empfohlene Reihenfolge und ganz oben die **offene Umstellung**
(siehe unten).

Achtung: Die Datei ist per `.htaccess` auf 403 gesperrt und per `.gitignore`
**nicht** im Repo – sie taucht in keinem `git log` auf. Gleiches gilt für
`RISIKEN-TODO.md`. Erledigtes **in der Datei selbst** von `- [ ]` auf `- [x]`
setzen und dazuschreiben, was anders kam als geplant; der Nutzer liest das als
Fortschrittsbericht.

---

## ⚠ Die eine offene Richtungsentscheidung

**Alle Spiele sollen auf ein Gerät pro Person umgestellt werden.** Jeder spielt
auf seinem eigenen Handy, mit Raum und Code – so wie neun der elf Spiele schon
laufen.

Betroffen sind die beiden Ausnahmen: **Reaktion** (`/reaktion/`) und **Kurven**
(`/kurven/`). Sie sind genau andersherum gebaut – ein Gerät, alle drumherum.

**Der Nutzer hat ausdrücklich gesagt, das soll vorerst nur notiert werden.**
Also: nicht umbauen, solange nicht danach gefragt wird. Die vollständige
Aufgabenbeschreibung samt Fallstricken steht ganz oben in `SPIELE-IDEEN.md`.
Der Kern in drei Sätzen:

- Beide brauchen dann Dienst, Port, Apache-Block und `bremse.js` – haben sie
  bisher alles nicht.
- **Kurven** ist der eigentliche Aufwand: die Fahrphysik muss auf den Server
  oder in eine Vorhersage, sonst sehen zwei Geräte verschiedene Kollisionen.
- Auf der Startseite verschwindet dann die Kategorie „Am Tisch, ein Gerät";
  der Fußtext erwähnt die Ausnahme ebenfalls und muss mit.

---

## Die elf Spiele

| Spiel | Pfad | Port | Leute | Was |
|---|---|---|---|---|
| Keep | `/keep/` | 3000 | 2–4 | Walzen drehen und halten (PM2, Socket.IO) |
| Card Chaos | `/cardchaos/` | 8090 | 2–4 | Kartenpyramiden abräumen |
| Seconds | `/seconds/` | 8077 | 2–4 | gemeinsames Symbol finden |
| Lucky Reflex | `/luckyreflex/` | 8078 | 2–4 | reagieren, aber nur beim richtigen Reiz |
| Ich hab noch nie | `/nochnie/` | 8076 | 2–8 | gestehen per Knopfdruck |
| Mäxchen | `/maexchen/` | 8075 | 2–8 | Würfel verdeckt, Ansage überbieten |
| Wer am ehesten? | `/amehesten/` | 8074 | 3–10 | alle zeigen gleichzeitig auf eine Person |
| Imposter | `/imposter/` | 8073 | 4–10 | einer kennt das Wort nicht |
| Flaschendrehen | `/flasche/` | 8072 | 3–10 | Flasche + Wahrheit oder Pflicht |
| **Reaktion** | `/reaktion/` | – | 2–4 | vier Kanten auf **einem** Gerät |
| **Kurven** | `/kurven/` | – | 2–4 | vier Linien auf **einem** Gerät |

Freie Ports: **8071, 8070, 8069** abwärts. Die vollständige Belegung steht im
`README.md` – **vor jedem neuen Spiel dort nachsehen**, sonst startet der
zweite Dienst still nicht.

## Zwei Bauarten

| | Server-Spiel | Spiel am Tisch |
|---|---|---|
| Geräte | eines je Person | eines für alle |
| Dienst | systemd (Keep: PM2) | keiner |
| Port, Apache | je einer | keiner, statische Dateien |
| `bremse.js` | ja | nein, es gibt keine Verbindung |
| Prüfung | `deno task probe` | `node pruefe-<name>.mjs` |

Die zweite Bauart kann nicht abstürzen und braucht keine Wartung. Sie ist
allerdings genau das, was laut Richtungsentscheidung oben verschwinden soll.

---

## Ein neues Server-Spiel bauen

Alle neun Server-Spiele sind nach demselben Muster gebaut. **Die beste Vorlage
ist `/var/www/html/amehesten/`** – am wenigsten Sonderfälle. `nochnie` ist das
Original, `imposter` das komplexeste.

### Dateien

```
<spiel>/
  server.js          Räume, WebSocket, Rundenlogik
  <inhalt>.js        Karten-, Fragen- oder Wortlisten
  bremse.js          UNVERÄNDERT kopieren (siehe unten)
  probe.js           spielt eine Partie mit echten Verbindungen durch
  deno.json          tasks: dev, check, probe
  README.md
  .gitignore
  public/index.html  vier Bildschirme: home, lobby, game, final
  public/style.css   gemeinsamer Block + Eigenes
  public/app.js
```

### Ausliefern – die Reihenfolge, die funktioniert

```bash
# 1. Typprüfung und Probe lokal
cd /var/www/html/<spiel>
DENO_DIR=/tmp/deno-check deno check server.js <inhalt>.js probe.js public/app.js
deno task dev &        # in einer zweiten Sitzung
deno task probe

# 2. Dienst (Vorlage: /etc/systemd/system/amehesten.service)
#    Wichtig: User=www-data und DENO_DIR=/tmp/deno-cache – www-data darf
#    nicht in sein Home schreiben, Deno startet sonst gar nicht.
systemctl daemon-reload && systemctl enable --now <spiel>

# 3. Apache (Vorlage: /etc/apache2/conf-available/amehesten.conf)
#    Die /ws-Regel muss VOR der allgemeinen stehen.
a2enconf <spiel> && apache2ctl configtest && systemctl reload apache2

# 4. Rechte, sonst liest der Dienst seine eigenen Dateien nicht
chown -R www-data:www-data /var/www/html/<spiel>

# 5. Gegen live prüfen – das ist der eigentliche Nachweis
WS_URL=wss://inf-zeus.de/<spiel>/ws deno task probe

# 6. Bild, Kachel, Repo (siehe unten)
```

### Zwei Fallen, die jedes Mal zuschlagen

- **`cleanName`** enthält eine Steuerzeichen-Regex. Wird sie als Literal
  geschrieben, landen echte Steuerzeichen in der Datei. Immer als
  `/[\u0000-\u001f\u007f]/g` schreiben – also mit `\u`-Escapes, nicht mit den
  Zeichen selbst. Danach `grep -n 'u0000' server.js` prüfen; findet das
  nichts, stehen die rohen Bytes in der Datei.
  (Genau das ist dieser Datei beim Schreiben auch passiert.)
- **Deutsche Anführungszeichen in JS-Strings.** `"… „Nur drehen" …"` beendet
  den String beim schließenden `"`. In `console.log`/`throw` entweder
  Backticks nehmen oder die Anführungszeichen weglassen. Danach:
  `grep -n '„[^“`]*"' *.js`

---

## Was in allen Spielen gleich ist

Zwei Dinge werden **von Hand** synchron gehalten – es gibt bewusst keinen
Build-Schritt:

- **`bremse.js`** – identisch in **neun** Dateien. Sieben liegen im
  Spielordner (`nochnie`, `maexchen`, `amehesten`, `imposter`, `flasche`,
  `seconds`, `luckyreflex`), zwei unter `server/` (`keep`, `cardchaos`).
  Reaktion und Kurven haben keine – sie haben keine Verbindung.
- **Der CSS-Block** bis `══ Gemeinsame Lobby-Basis ══ Ende ══` – identisch in
  **zwölf** Dateien (elf Spiele + Bugreport).

Vor jeder Änderung daran prüfen, dass sie noch gleich sind:

```bash
cd /var/www/html
md5sum */bremse.js */server/bremse.js 2>/dev/null | awk '{print $1}' | sort -u | wc -l
# muss 1 sein
```

**Wer eine Kopie ändert, muss alle ändern.** Deshalb ist der veraltete
Kopfkommentar in `bremse.js` („Identisch in Keep, Card Chaos, Lucky Reflex und
Seconds") absichtlich stehen geblieben – ihn in nur einer Datei zu korrigieren
bräche genau die Gleichheit, um die es geht. `SPIELE-IDEEN.md` fordert seit
längerem, das Ganze in ein gemeinsames Modul zu ziehen; das ist die richtige
Lösung und noch offen.

Weiteres Gemeinsames: die Avatar-Liste `["🦊","🐙","🦅","🐺","🦁","🐉"]` mit
derselben Ableitung aus der Spieler-Id, und `localStorage["spiele_name"]` –
wer bei einem Spiel seinen Namen eintippt, findet ihn beim nächsten vor.

---

## Die Startseite

`spiele/index.html` ist eine einzelne Datei mit Inline-CSS. Drei Kategorien,
danach je ein `<main class="raster">`.

**Jedes Spiel steht genau einmal in der Datei.** Die Kachel trägt ihre
Anleitung selbst:

```html
<article class="game" style="--accent:…; --accent2:…;"
         data-spiel="kurzname" data-bild="bilder/<spiel>-spiel.webp"
         data-kurz="Ein Satz für den Dialog.">
  …
  <template class="ablauf"><li>Schritt</li>…</template>
</article>
```

Der Anleitungsdialog liest daraus. Früher gab es zusätzlich ein JS-Objekt
`SPIELE` – zwei Fassungen desselben Spiels, die auseinanderliefen.

**Nicht rückgängig machen:** Die Kacheln bleiben statisches HTML. Die
Ideendatei schlägt vor, die Liste als JS-Datenfeld zu führen; dann zeigte die
Seite ohne JavaScript gar keine Spiele mehr, und die Übersicht ist der einzige
Teil dieser Seite, der auch ohne JS etwas wert ist.

Beim Hinzufügen mitziehen: die **Kategorie** wählen, das **Zahlwort** im
Untertitel und in `<meta name="description">` (zweimal „Elf Browserspiele"),
und den **Statuspunkt** (kommt automatisch aus dem Link).

---

## Prüfen

Jedes Spiel hat einen Nachweis. **Ohne grünen Lauf gilt nichts als fertig.**

```bash
# Server-Spiele: gegen die Live-Fassung
cd /var/www/html/<spiel>
WS_URL=wss://inf-zeus.de/<spiel>/ws deno task probe

# Spiele am Tisch und die Startseite: im echten Browser
cd /root/werkzeug-screenshots
node pruefe-startseite.mjs     # alle Kacheln, alle Dialoge, alle Bilder
node pruefe-reaktion.mjs
node pruefe-kurven.mjs
node pruefe-flasche.mjs        # zeigt die Flasche wirklich auf die Person?
```

`probe.js` ist kein Testrahmen: ein Skript, das wirft, wenn etwas nicht stimmt,
und sonst mitschreibt, was passiert ist. Es prüft Geheimhaltung (wer darf was
sehen), Rechte (wer darf was auslösen), Zähler und den Ausfall einzelner
Spieler.

**Der Browserlauf ist kein Luxus.** Drei echte Fehler sind nur dort
aufgefallen, nie in der Probe:

- **Reaktion:** verpasste niemand das grüne Signal, endete die Runde nie.
- **Flaschendrehen:** der Client hatte einen `-90`-Versatz; Namen, Markierung
  und Probe waren richtig, und die Flasche zeigte trotzdem eine Vierteldrehung
  daneben.
- **Kurven:** der gemeinsame Punktestand überlappte die Steuerleiste.

Vorsicht bei eigenen Prüfskripten: `.overlay` ohne `.an` ist `display:none` –
auf „sichtbar" zu warten geht nie auf. Stattdessen `{ state: 'hidden' }`. Und
Ergebnisse nicht durch `| tail` schicken, sonst maskiert der Exitcode von
`tail` einen Fehlschlag.

## Vorschaubilder

Echte Bildschirmfotos laufender Partien, keine Zeichnungen.

```bash
cp /var/www/html/werkzeug/aufnehmen.mjs /root/werkzeug-screenshots/
cd /root/werkzeug-screenshots
node aufnehmen.mjs <spiel>     # ohne Argument: alle elf
```

Danach die Datei aus `/root/werkzeug-screenshots/` **zurück** nach
`werkzeug/` kopieren, wenn sie sich geändert hat – nur dort ist sie versioniert.

Ein Bild muss die Mechanik **zeigen**. Beispiele, wo das Arbeit war: bei
Mäxchen wird so lange weitergewürfelt, bis ein gemischter Wurf fällt (bei einem
Mäxchen ist alles grün und die Bildunterschrift widerlegt sich selbst); bei
Wer am ehesten werden die Stimmen absichtlich ungleich verteilt; bei Imposter
wird die Seite eines **Nicht**-Imposters geknipst.

Die Bilder landen als WebP in `spiele/bilder/`. Voraussetzungen auf dem Server:
Playwright samt Chromium (**nicht** `--with-deps`, das kaputte MongoDB-Repo
lässt jedes `apt update` scheitern) und die Emoji-Schrift unter
`/usr/local/share/fonts/emoji/`.

---

## Versionsverwaltung

**Vier getrennte Ebenen, nicht vermischen:**

1. **Der Seitenrahmen** (`/var/www/html`, Remote vorhanden). Seine
   `.gitignore` ist eine **Freigabeliste**: erst alles ignorieren, dann
   einzeln zulassen. Neue Spielordner sind dadurch automatisch draußen –
   das ist beabsichtigt und soll so bleiben.
2. **Die vier alten Spiele** und der Bugreport: eigene GitHub-Repos.
3. **Die sieben neueren Spiele**: eigenes **lokales** Repo, **kein `origin`**.
   Auf der Maschine fehlen `gh` und ein Schlüssel mit Schreibrecht. Steht als
   offener Punkt in `RISIKEN-TODO.md`; anlegen ist Sache des Nutzers.
4. **`RISIKEN-TODO.md` und `SPIELE-IDEEN.md`**: in **keinem** Repo.

Commit-Nachrichten sind hier ausführlich und begründen **warum**, nicht was.
Am Ende:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

`git config --global --add safe.directory <pfad>` ist für jedes Repo nötig
(die Ordner gehören `www-data`, git läuft als root).

---

## Inhalte: was nicht auf die Seite darf

Spielregeln sind frei, **Namen, Grafiken und Anleitungstexte nicht**.

- **Alle Wort-, Fragen- und Kartenlisten selbst schreiben.** Nichts aus einer
  Anleitung oder App abtippen.
- **Geschützte Titel meiden.** Die Praxis hier: Seconds statt Dobble, Card
  Chaos statt des Solitaire-Klons, Imposter statt Spyfall. Die vollständige
  Liste steht am Ende von `SPIELE-IDEEN.md` (UNO, Dobble, Spyfall, Werwölfe von
  Düsterwald, Codenames, Wizard, Kniffel, Tetris, Wordle, Monopoly, Scrabble,
  Skip-Bo, Perudo). Tetris-Klone sind ausdrücklich **nicht empfohlen**.
- **Texte geschlechtsneutral formulieren.** Die Fragen zeigen auf echte
  Personen; „zuerst" statt „als Erster", Umschreibungen statt Pronomen.

### Jugendschutz

Nur **ein** Spiel hat 18+-Inhalte: `/nochnie/`. Dort gibt es einen
Kartenstapel mit Alkohol- und Sexbezug, eine Abfrage vor dem Umschalten (auch
für Gäste) und „harmlos" als Voreinstellung. Ob das reicht (JMStG), steht als
offene Frage in `RISIKEN-TODO.md`.

**Wer am ehesten** und **Flaschendrehen** umgehen das bewusst: ihre Karten
kommen ohne Alkohol, Sex und Körperkontakt aus, „frech" heißt peinlich. Bei
Flaschendrehen prüft `probe.js` jede Karte gegen eine Wortliste und schlägt an,
sobald jemand die Grenze verschiebt.

**Wer einen dieser Stapel erweitert, holt sich die ganze Jugendschutz-Abwägung
mit dazu** – dann gilt, was `SPIELE-IDEEN.md` für die Trinkspiel-Sparte
verlangt: eigener Bereich, 18-plus-Hinweis, trinkfreie Voreinstellung.

Poker o. ä.: **nur Spielgeld, keine Verbindung zum Spendenknopf.** Sobald Geld
hineingeht, ist es Glücksspiel (§ 284 StGB / GlüStV) und erlaubnispflichtig.

---

## Kleinigkeiten, die Zeit kosten

- **`pkill -f "<name>"` trifft die eigene Shell**, wenn der Name in der
  Kommandozeile steht. Testserver über den Port beenden:
  `ss -tlnp | grep ':PORT '` → `kill <pid>`.
- **Keep und Card Chaos laufen unter PM2**, nicht systemd. `systemctl is-active
  keep` sagt „inactive", obwohl das Spiel läuft.
- **`git checkout -- <datei>` stellt aus dem Index wieder her**, nicht aus
  HEAD. Nach einem `git add` ist das nicht das, was man will – `git checkout
  HEAD -- <datei>` nehmen.
- **`.htaccess` sperrt** `RISIKEN-TODO.md`, `SPIELE-IDEEN.md`, **diese Datei**,
  `/werkzeug/` und `/.git/` – alles 403. Nach dem Anlegen neuer interner
  Dateien dort nachsehen.
  Sonderfall CLAUDE.md: sie ist **im Repo** (sie beschreibt den Seitenrahmen),
  aber **nicht im Netz** – sie nennt Serverpfade und verweist auf die
  Risikoliste. `README.md` ist dagegen bewusst öffentlich.
- **Kein Build-Schritt, keine Abhängigkeiten.** Das ist kein Zufall, sondern
  die Linie des Projekts. Kein npm-Paket in ein Spiel ziehen.

## Zum Schluss immer

```bash
# Läuft alles?
for p in spiele keep cardchaos seconds luckyreflex nochnie maexchen \
         amehesten imposter reaktion kurven flasche bugreport; do
  printf "  /%-12s %s\n" "$p/" "$(curl -s -o /dev/null -w '%{http_code}' https://inf-zeus.de/$p/)"
done

# Interne Notizen dicht?
for f in RISIKEN-TODO.md SPIELE-IDEEN.md; do
  printf "  %-18s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' https://inf-zeus.de/$f)"
done   # beide müssen 403 sein
```
