# Prüfen

**Ohne grünen Lauf gilt nichts als fertig.**

```bash
# Server-Spiele: gegen die Live-Fassung
cd /var/www/html/<spiel>
DENO_DIR=/tmp/deno-check WS_URL=wss://inf-zeus.de/<spiel>/ws deno task probe

# Gemeinsame Teile noch überall gleich?
cd /var/www/html && node werkzeug/verteilen.mjs --pruefen

# Startseite und Einzelheiten, die man sehen muss: im echten Browser
cd /root/werkzeug-screenshots
node pruefe-startseite.mjs     # alle Kacheln, alle Dialoge, alle Bilder
node pruefe-flasche.mjs        # zeigt die Flasche wirklich auf die Person?
```

`probe.js` ist kein Testrahmen: ein Skript, das wirft, wenn etwas nicht stimmt,
und sonst mitschreibt, was passiert ist. Es prüft Geheimhaltung (wer darf was
sehen), Rechte (wer darf was auslösen), Zähler und den Ausfall einzelner
Spieler. Der letzte Punkt ist seit `raum.js` besonders wichtig: er läuft durch
`beimVerlassen`, `nachVerlassen` und `beimPlatzfrei`.

Kein `probe.js` haben **Seconds** und **Lucky Reflex**. Solange das so ist,
werden die beiden nicht umgebaut – es fehlt der Nachweis.

## Der Browserlauf ist kein Luxus

Drei echte Fehler sind nur dort aufgefallen, nie in der Probe. Zwei davon
stammen aus Reaktion und Kurven, die es seit dem 09.08.2026 nicht mehr gibt –
sie stehen trotzdem hier, denn der Grund für den Browserlauf gilt unverändert:

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
node aufnehmen.mjs <spiel>     # ohne Argument: alle
```

Danach die Datei aus `/root/werkzeug-screenshots/` **zurück** nach `werkzeug/`
kopieren, wenn sie sich geändert hat – nur dort ist sie versioniert.

Ein Bild muss die Mechanik **zeigen**. Beispiele, wo das Arbeit war: bei
Mäxchen wird so lange weitergewürfelt, bis ein gemischter Wurf fällt (bei einem
Mäxchen ist alles grün und die Bildunterschrift widerlegt sich selbst); bei
Wer am ehesten werden die Stimmen absichtlich ungleich verteilt; bei Imposter
wird die Seite eines **Nicht**-Imposters geknipst.

Die Bilder landen als WebP in `spiele/bilder/`. Voraussetzungen auf dem Server:
Playwright samt Chromium (**nicht** `--with-deps`, das kaputte MongoDB-Repo
lässt jedes `apt update` scheitern) und die Emoji-Schrift unter
`/usr/local/share/fonts/emoji/`.
