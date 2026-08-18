# Prüfen

**Ohne grünen Lauf gilt nichts als fertig.**

```bash
# Server-Spiele: gegen die Live-Fassung
cd /var/www/html/<spiel>
DENO_DIR=/tmp/deno-check WS_URL=wss://inf-zeus.de/<spiel>/ws deno task probe

# Spiele ohne Server: reine Rechenprobe, kein Browser
cd /var/www/html/<minenfeld|sudoku|patience> && deno task probe

# Und dann doch im Browser, weil eine Rechenprobe keine Seite aufbaut
cd /root/werkzeug-screenshots && node pruefe-statisch.mjs

# Gemeinsame Teile noch überall gleich?
cd /var/www/html && node werkzeug/verteilen.mjs --pruefen

# Startseite und Einzelheiten, die man sehen muss: im echten Browser
cd /root/werkzeug-screenshots
node pruefe-startseite.mjs     # alle Kacheln, alle Dialoge, alle Bilder
node pruefe-flasche.mjs        # zeigt die Flasche wirklich auf die Person?
node pruefe-cubes.mjs          # steht in jedem Quadrat die richtige Zahl?
node pruefe-wortleger.mjs      # trifft man 13 Spalten auf einem Handy?
node pruefe-statisch.mjs       # bauen sich die vier Spiele ohne Server auf?
node pruefe-statisch-tief.mjs  # … und was danach kommt: Neuladen, Uhr, Wortlisten
node pruefe-bugreport.mjs      # kennt der Bugreport jedes Spiel aus spiele.json?
node pruefe-rahmen.mjs         # jede Seite: 200, Konsole still, Handy ohne Ueberlauf
node pruefe-revier.mjs         # kommt der unsichtbare Joystick an, bewegt sich die Leinwand?
node pruefe-wurm.mjs           # dasselbe fuer Wurm, dazu die drei Wege zum Turbo
node pruefe-ameisen.mjs        # Ameisen: Tippen, Laden, zweiter Ausgang, derselbe Bau nach dem Neuladen
node pruefe-hochzeit.mjs       # Grossansicht: passt das Bild ins Fenster? (misst, statt zu zeigen)
GAST=<wort> node pruefe-hochzeit-upload.mjs   # 150 Bilder am Handy auswaehlen: kommt Rueckmeldung?
node pruefe-durchlauf.mjs      # zwei Handys: Startseite -> Lobby -> Runde -> Endstand
node pruefe-ausgang.mjs        # fuehrt aus jedem Spiel ein Weg zurueck?
node pruefe-cardchaos-tippen.mjs  # Karten mit dem Finger, schnell hintereinander
node pruefe-cardchaos-ende.mjs    # Wartebildschirm: Fahne ruhig, Muenze vor dem Gewinn
node pruefe-cardchaos-ablage.mjs  # Jubelmeldungen ueber der Pyramide, nie auf den Karten
node pruefe-cardchaos-bestenliste.mjs  # eine Liste statt zwei: Woche/Ewig x 3/5/10 Runden
```

Eine eigene Fassung braucht nur diese hier – sie verbraucht Raeume und Zuege:

```bash
cd /var/www/html/paare
PORT=8456 HOST=127.0.0.1 deno run --allow-net --allow-read --allow-env --allow-sys server.js &
cd /root/werkzeug-screenshots && node pruefe-paare-tippen.mjs   # Tipp bricht die Wartezeit ab
ss -tlnp | grep ':8456 '   # danach ueber den Port beenden, nie per pkill
```

Ohne Browser, aus `/var/www/html` heraus:

```bash
node werkzeug/grenzprobe.mjs       # Abschnitt G: die Bremse und was der Client daraus macht
node werkzeug/pruefe-seconds.mjs   # ganze Partie Seconds
node werkzeug/pruefe-cardchaos.mjs # ganze Partie Card Chaos
node werkzeug/pruefe-keep.mjs      # ganze Partie Keep
node werkzeug/pruefe-solo.mjs      # Keep, Card Chaos und Snake starten allein
```

`pruefe-solo.mjs` ist die kurze davon: die drei Spiele haben seit dem
18.08.2026 `minPlayers = 1`, und diese Probe weist nur nach, dass ein
einzelner Host wirklich losdrücken kann und die Partie allein bis zum
Endstand läuft. Card Chaos braucht darin seit dem 19.08.2026 rund drei
Minuten – der Server nimmt nur noch 3, 5 oder 10 Runden an, und drei
unabgeräumte Runden laufen ihre Uhr voll aus. Eigene Fassungen auf 8106/8107/8108, `--nur snake` prüft
einzeln.

Die drei letzten sind die Spiele der **Gruppe D**: eigenes Protokoll, kein
`probe.js`, und sie fallen auch aus `lobbyprobe.mjs` heraus. Seit dem
10.08.2026 spielt jede von ihnen eine ganze Partie bis zum Endstand durch.
Sie starten dafuer immer eine **eigene Fassung** auf einem freien Port
(8103/8104/8105): eine Partie kostet viele Zuege und Raeume, und bei Keep
schreibt sie in die Bestenliste - die der Live-Fassung gehoert den Leuten,
die dort spielen.

Zwei Kniffe, die man kennen muss, wenn man sie aendert:

- **Card Chaos** kann mitgespielt werden, weil das Brett deterministisch aus
  dem `seed` entsteht: die Probe baut es mit der echten `shared/engine.js`
  nach, statt eine zweite Fassung der Regeln zu erfinden.
- **Keep** spricht als einziges Spiel Socket.IO, und `socket.io-client` liegt
  nicht in seinem `node_modules`. Statt eine Abhaengigkeit in ein laufendes
  Spiel zu legen, spricht die Probe Engine.IO ueber eine gewoehnliche
  WebSocket-Verbindung - vier Rahmentypen genuegen (`0`, `40`, `42[...]`,
  Ping `2`/Pong `3`).

`pruefe-rahmen.mjs` (10.08.2026) ist die einzige Probe, die **jede** Seite
einmal im Browser öffnet – auch die zwanzig, für die es sonst nur eine
WebSocket-Probe gibt. Sie hört der Konsole zu, zählt Anfragen mit, die nicht
ankommen, und misst bei 390 px nach, ob etwas seitlich herausläuft. Ein
fehlendes Bild oder ein 404 auf eine JS-Datei fällt sonst nirgends auf: die
Seite steht ja trotzdem da, nur eben halb.

`pruefe-statisch-tief.mjs` (10.08.2026) setzt fort, wo `pruefe-statisch.mjs`
aufhört. Ihr wichtigster Griff ist der **Uhrentest**: nach viermal „Neues
Spiel" muss die Anzeige in drei Sekunden um drei Sekunden weiterlaufen. Ein
vergessener `clearInterval` ließe sie doppelt so schnell laufen – von außen
unsichtbar, aber jede Bestzeit wäre verdorben. Für Wortgitter, das einzige
Spiel ohne `probe.js`, prüft sie zusätzlich die Wortlisten, den Tageswechsel,
einen kaputten Speichereintrag und die Bewertung doppelter Buchstaben gegen
eine zweite, unabhängig geschriebene Fassung derselben Regel.

## Was am 17.08.2026 dazugekommen ist

Aus den Bugreports 4, 7, 8, 9, 10 und 13:

- **`lobbyprobe.mjs` L17** – der Geist auf dem Hostplatz: ein Socket, der offen
  bleibt und stumm wird. Kein anderer Test trifft ihn, weil alle anderen die
  Verbindung sauber schließen. Braucht `GEIST_MS=3000` und läuft deshalb nur
  gegen eine eigene Fassung; die Probe setzt das selbst (`t.env`).
- **`pruefe-durchlauf.mjs` B09** – der Weg hinaus von jedem Bildschirm, für die
  sieben Schalenspiele durchgeklickt.
- **`pruefe-ausgang.mjs`** – dasselbe für alle sechzehn Lobbyspiele, aber nur
  die Verdrahtung: Endstand einblenden, Knopf drücken, steht die Startseite da?
  Ohne Partie, deshalb in einer Minute durch.
- **`pruefe-statisch-tief.mjs` E05** – Wortgitter: die Kästchengröße **auf
  leerem Brett** (der Fehler verschwand, sobald man tippte) und die
  Übungswörter, die die Serie in Ruhe lassen müssen.
- **`pruefe-cardchaos-tippen.mjs`** – Karten mit dem Finger antippen, schneller
  als ein Doppeltipp-Fenster. Gezählt wird die Rückmeldung über der Karte, nicht
  der Punktestand: auf frischem Brett steht der auf null, und ein Fehlgriff
  drückt ihn nicht darunter. Diese Falle hat die Probe beim Schreiben zuerst
  selbst gestellt und rot geleuchtet, obwohl alles stimmte.

## Die Lobby-Probe

`werkzeug/lobbyprobe.mjs` (10.08.2026) prüft nicht das Spiel, sondern den Weg
**hinein und wieder hinaus** – das, was kein `probe.js` tut: neu laden, das
Netz verlieren, einen zweiten Tab aufmachen, einer laufenden Runde beitreten,
Müll schicken. Siebzehn Tests (L01–L17) gegen die sechzehn Spiele mit
gemeinsamem Lobby-Protokoll.

**Revier, Wurm und Ameisen fallen heraus** – sie haben keine Lobby, kein
`raum.js` und keinen Raumcode, weil ihre Welt durchläuft. Ihr Weg hinein und
hinaus steckt deshalb in der eigenen `probe.js` (Beitritt, Abschuss, Müll) und
in `pruefe-revier.mjs` bzw. `pruefe-wurm.mjs` (der Joystick, den man nicht
sieht, und bei Wurm der Turbo, den kein Serverprotokoll kennt).

**Ameisen ist der erste Fall, in dem eine Probe eine eigene Fassung braucht,
ohne dass es um Räume oder Züge ginge** (18.08.2026): jeder Bau gehört einem
Menschen und fängt bei drei Ameisen und null Münzen an. Ein Kauf ließe sich
gegen live erst nach Minuten prüfen, ein Umzug erst nach Stunden, und die Datei
auf der Platte gar nicht, solange der Bau noch im Speicher liegt. Die Probe
setzt dafür `START_MUENZEN`, `RUHE_MS` und `WELTEN_DIR` – und **sagt jeden
dieser Teile ausdrücklich ab**, wenn sie gegen live läuft, statt ihn stumm zu
überspringen. `WELTEN_DIR` ist dabei so wichtig wie die anderen beiden: ohne
den Griff schriebe jede Probe in die echten Baue.

Dasselbe gilt für das Vorschaubild: `aufnehmen.mjs` startet sich für Ameisen
als einziges Spiel eine eigene Fassung. Ein ehrliches Bild eines frischen Baus
wäre ein leerer Hang mit drei Punkten darauf.

```bash
cd /var/www/html
node werkzeug/lobbyprobe.mjs                     # alle sechzehn
node werkzeug/lobbyprobe.mjs --nur paare
node werkzeug/lobbyprobe.mjs --nur paare --test L07
node werkzeug/lobbyprobe.mjs --lang              # auch der 60-s-Test (L08)
node werkzeug/lobbyprobe.mjs --live              # gegen die Live-Fassung
```

**Sie startet sich pro Test eine eigene Fassung** auf Port 8101 – anders als
alle anderen Proben, und mit Grund: die Bremse lässt je IP zwölf neue Räume in
zehn Minuten zu, und die Probe macht rund vierzehn je Spiel auf. Gegen live
fiel sie deshalb ab dem zwölften Test aus dem falschen Grund durch und brauchte
nebenbei das Kontingent echter Leute auf. Ein frischer Dienst je Test setzt
Raum- und Verbindungszähler zurück; dass der Weg durch Apache und TLS stimmt,
weisen die `probe.js` nach, die gegen live laufen.

Node braucht dafür kein Paket – `WebSocket` ist seit Node 21 eingebaut.

Was sie gefunden hat, steht in `PRUEFPLAN.md` (nicht im Repo, 403). Der
schwerste Fund war nicht in der Lobby, sondern daneben: bei `seconds` und
`cardchaos` reichte die öffentliche Spieler-Id, um den Platz eines
Mitspielers zu übernehmen. Die Lehre für jede neue Stelle mit Wiedereinstieg:
**was im Spielstand steht, ist kein Ausweis.**

Ausgeführt werden sie in `/root/werkzeug-screenshots/` – dort liegen
`node_modules` mit Playwright. **Seit dem 09.08.2026 sind sie alle versioniert** – sie liegen in `werkzeug/`,
wie `aufnehmen.mjs`. Wer eine ändert, kopiert sie zurück:

```bash
cp /root/werkzeug-screenshots/pruefe-startseite.mjs /var/www/html/werkzeug/
```

Nicht versioniert sind `probe.mjs` und `pruefen.mjs`: Wegwerf-Skripte aus
einzelnen Sitzungen, kein Werkzeug.

`probe.js` ist kein Testrahmen: ein Skript, das wirft, wenn etwas nicht stimmt,
und sonst mitschreibt, was passiert ist. Es prüft Geheimhaltung (wer darf was
sehen), Rechte (wer darf was auslösen), Zähler und den Ausfall einzelner
Spieler. Der letzte Punkt ist seit `raum.js` besonders wichtig: er läuft durch
`beimVerlassen`, `nachVerlassen` und `beimPlatzfrei`.

**Wortleger** geht einen Schritt weiter: weil die Steine zufällig sind, kann
die Probe keinen bestimmten Zug ansagen. Sie sucht sich mit derselben `zug.js`,
die auch der Server benutzt, einen gültigen Zug – und prüft damit genau das,
worauf es ankommt: was die gemeinsame Logik erlaubt, muss der Server annehmen,
und was sie verbietet, muss er ablehnen. Der erste Teil der Probe läuft ganz
ohne Server und rechnet jede Punktzahl von Hand nach.

**Stand 18.08.2026: jedes der 26 Spiele hat einen Nachweis** – Wurm mit
`probe.js` (P0–P10) und `pruefe-wurm.mjs` (W01–W08), Ameisen mit `probe.js`
(P0–P13) und `pruefe-ameisen.mjs` (A01–A09). Der Absatz darunter ist
ueberholt und bleibt nur als Verlauf stehen.

Kein `probe.js` haben **Seconds** und **Lucky Reflex**. Solange das so ist,
werden die beiden nicht umgebaut – es fehlt der Nachweis. **Lucky Reflex** wird
inzwischen wenigstens von `lobbyprobe.mjs` abgedeckt (Lobby und Rückkehr, nicht
die Spiellogik); **Seconds** spricht ein eigenes Protokoll und fällt auch dort
heraus. Am 10.08.2026 ist bei Seconds von Hand ein Loch im Wiedereinstieg
gefunden und geschlossen worden – genau die Sorte Fund, die eine Probe
verhindert hätte.

## Die zwölf vom 09.08. haben jetzt auch eine

Nachgezogen am 09.08.2026 abends. Bei allen acht Server-Spielen nach demselben
Muster, und bei allen mit demselben Trick gegen den Zufall: **was der Server
rechnet, rechnet die Probe mit derselben Datei nach.** Dafür sind aus den
Servern eigene Regeldateien herausgelöst worden – `karten.js` (Schwimmen),
`regeln.js` (Mau-Mau, Kings Cup hatte schon eine), `blatt.js` (Lügen),
`gebote.js` (Becherbluff). Der erste Teil jeder Probe läuft dadurch ganz ohne
Server.

Die vier Spiele ohne Server prüfen dasselbe eine Stufe tiefer: `raetsel.js`
(Sudoku), `feld.js` (Minenfeld), `regeln.js` (Patience) sind aus `app.js`
herausgelöst, damit `deno task probe` sie ohne Browser rechnen lassen kann.
Wortgitter hat keine Probe – dort ist die Wortliste erzeugt und wird von
`pruefe-wortleger.mjs` mitgeprüft.

Sechs echte Fehler hat das Schreiben der Proben gefunden, alle behoben:

- **Nachtwache:** endete die Partie in der Nacht, ging der Bericht dieser Nacht
  verloren – wer gestorben war und woran, erfuhr niemand.
- **Lügen:** eine leergespielte Partie endete nie. Der Letzte legte sich selbst
  weiter zu, und niemand konnte ihn stoppen.
- **Becherbluff:** die Aufdeckung wurde erst gebaut, nachdem dem Verlierer der
  Würfel genommen war – die Zahl daneben passte nicht zum Bild.
- **Paare:** abgeräumte Karten galten weiter als offen.
- **Kings Cup:** zweimal auf Ziehen tippen zog zwei Karten, die erste sah
  niemand.
- **Patience:** `neu()` hielt die alte Uhr erst an, als sie schon nicht mehr
  erreichbar war.

**Snake misst mit.** Bei sechs Spielern – der vollen Besetzung und damit dem
teuersten Fall – sind es rund 7 KB/s je Spieler bei 7,7 Nachrichten/s. Die
Probe wirft ab 25 KB/s. Das ist die Lehre aus Cubes, wo 148 KB/s je Spieler
erst im Betrieb aufgefallen sind.

**Bedenkzeit prüfen dauert sonst zu lange.** Paare und Kings Cup haben seit dem
09.08. eine Frist je Zug. Ihre Proben starten dafür einen eigenen Server auf
einem freien Port mit `ZUG_MS=1500` und sehen dem Ablauf wirklich zu. Gegen
live (`WS_URL` gesetzt) fällt dieser Teil aus – dort steht die Frist auf ihrem
echten Wert.

## Der Browserlauf ist kein Luxus

Vier echte Fehler sind nur dort aufgefallen, nie in der Probe. Zwei davon
stammen aus Reaktion und Kurven, die es seit dem 09.08.2026 nicht mehr gibt –
sie stehen trotzdem hier, denn der Grund für den Browserlauf gilt unverändert:

- **Reaktion:** verpasste niemand das grüne Signal, endete die Runde nie.
- **Flaschendrehen:** der Client hatte einen `-90`-Versatz; Namen, Markierung
  und Probe waren richtig, und die Flasche zeigte trotzdem eine Vierteldrehung
  daneben.
- **Kurven:** der gemeinsame Punktestand überlappte die Steuerleiste.
- **Wortleger:** die Zahl im Bonusfeld war auf einem 390-Pixel-Handy 8,7 px
  groß. Server und Probe waren grün – Schriftgrößen kommen dort schlicht nicht
  vor. Gefunden hat es `pruefe-wortleger.mjs`, das absichtlich in Handygröße
  läuft und Untergrenzen für Feldbreite und Schriftgröße misst, statt nur zu
  fragen, ob etwas da ist.
- **Cubes:** ein `+1` in Runde 3 wurde ohne Zahl gezeichnet. Die Beschriftung
  hing am Wert („1 zeigt nichts") statt an der Rundenart. In Runde 3 ist die
  Zahl aber das Einzige, was ein Plus- von einem Minusfeld unterscheidet – die
  beiden sehen absichtlich gleich aus. Server und Probe waren die ganze Zeit
  grün.

Vorsicht bei eigenen Prüfskripten: `.overlay` ohne `.an` ist `display:none` –
auf „sichtbar" zu warten geht nie auf. Stattdessen `{ state: 'hidden' }`. Und
Ergebnisse nicht durch `| tail` schicken, sonst maskiert der Exitcode von
`tail` einen Fehlschlag.

## Vorschaubilder

Echte Bildschirmfotos laufender Partien, keine Zeichnungen.

```bash
cp /var/www/html/werkzeug/aufnehmen.mjs /root/werkzeug-screenshots/
cd /root/werkzeug-screenshots
node aufnehmen.mjs <spiel>     # ohne Argument: alle
```

Danach die Datei aus `/root/werkzeug-screenshots/` **zurück** nach `werkzeug/`
kopieren, wenn sie sich geändert hat – nur dort ist sie versioniert.

Ein Bild muss die Mechanik **zeigen**. Beispiele, wo das Arbeit war: bei
Mäxchen wird so lange weitergewürfelt, bis ein gemischter Wurf fällt (bei einem
Mäxchen ist alles grün und die Bildunterschrift widerlegt sich selbst); bei
Wer am ehesten werden die Stimmen absichtlich ungleich verteilt; bei Imposter
wird die **aufgelöste** Runde geknipst – während der Runde zeigt der Bildschirm
nur ein Wort und sonst nichts, und das ist als Kachelbild zu wenig.

Die Bilder landen als WebP in `spiele/bilder/`. Voraussetzungen auf dem Server:
Playwright samt Chromium (**nicht** `--with-deps`, das kaputte MongoDB-Repo
lässt jedes `apt update` scheitern) und die Emoji-Schrift unter
`/usr/local/share/fonts/emoji/`.

## Was die Wurm-Proben gefunden haben (16.08.2026)

`probe.js` hat beim Entfernen der Obergrenze drei echte Fehler gefunden – zwei
davon älter als die Änderung:

- **Rasterabfragen liefen über die Weltkante hinaus.** Beide Ortsraster legen
  ihre Zellen unter `zeile * Breite + spalte` ab. Wer am oberen Rand abfragt,
  bekommt eine negative Zeile; steht er zugleich weit rechts, ist die Spalte
  größer als die Rasterbreite – zusammen ergibt das wieder einen gültigen
  Schlüssel, der auf eine ganz andere Ecke der Welt zeigt. Aufgefallen ist es
  als Ball, der 7 433 Einheiten weit weg gemeldet wurde. Dieselbe Verwechslung
  hätte beim Zusammenstoß einen Tod durch eine Schlange am anderen Ende der
  Welt bedeutet. **Lehre für jedes Ortsraster: Abfragebereiche klemmen, nicht
  nur die gespeicherten Werte.**
- **Kopf-an-Kopf zählte keinem etwas an.** Beide bekamen die Meldung
  „erwischt!", der Zähler blieb bei null, weil der Abschuss nur zählte, wenn
  der Schütze noch lebte. Wem man es sagt, dem zählt man es auch an.
- **Ein vergessener Import kam durch `deno check` durch.** Der Dienst startete
  und starb beim ersten Tick. Steht als vierte Falle in `CLAUDE.md`.

Und `pruefe-wurm.mjs` zwei weitere, beide nur im Browser sichtbar:

- **Der Turboknopf schaltete nicht.** Sein `pointerdown` rief zuerst
  `setPointerCapture` und erst danach den Turbo an. Wirft das Fangen – und das
  tut es, sobald der Browser den Zeiger nicht kennt –, bricht der Rest des
  Handlers ab, und der Finger auf dem Knopf bewirkt nichts. Die Seite sah dabei
  vollkommen gesund aus. Deshalb hört W08 der Konsole **nach** allem Getippe
  noch einmal zu; W01 sieht nur den Aufbau.
- **Der Maßstab war falsch.** Nicht die Probe hat das gefunden, sondern das
  Bildschirmfoto: eine mittelgroße Schlange war länger als der Schirm hoch. In
  einem Spiel, in dem jede Begegnung tödlich ist, ist Sicht die halbe
  Steuerung. Die Lehre für jedes Spiel auf einer Leinwand: **einmal ansehen,
  was man gebaut hat.** Kein Zahlenwert im Server verrät das.
