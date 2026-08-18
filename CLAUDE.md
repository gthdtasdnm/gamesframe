# inf-zeus.de – Wegweiser

Diese Datei wird in **jeder** Sitzung gelesen. Deshalb steht hier nur, was in
jeder Sitzung gebraucht wird: wo etwas liegt, und die drei Fallen, die sonst
jedes Mal zuschlagen. Alles andere steht in `doku/` und wird **nur bei Bedarf**
geöffnet. Stand: 18.08.2026.

## Was hier liegt

`/var/www/html` ist der DocumentRoot. Darin: sechsundzwanzig Browserspiele, die
Spieleübersicht, ein Bugreport-Werkzeug, zwei Rechtstexte – und, damit nicht
verwechselt, Nextcloud und zwei Tradingbots.

Wie viele es gerade sind, sagt `spiele.json` – nicht dieser Satz:
`jq '[.spiele[]|select(.art!="werkzeug")]|length' spiele.json`

**Arbeitsbereich sind die Spiele.** `nextcloud`, `tradingbot_value`,
`tradingbot_momentum`, `/reader/`, `hochzeit` und `_alt-tot-20260807` nur
anfassen, wenn ausdrücklich danach gefragt wird.

`hochzeit` ist eine private Bildergalerie hinter einem Zugangswort – kein
Spiel, keine Kachel, in keiner Suchmaschine. Details: `doku/hochzeit.md`.

## Wohin zum Nachlesen

| Frage | Datei |
|---|---|
| Welche Spiele, welcher Port, welcher Dienst, welches Repo? | **`spiele.json`** – maschinenlesbar, einzige Quelle |
| Neues Spiel bauen | `doku/neues-spiel.md` – Gerüst: `werkzeug/neuspiel.sh`, solo: `werkzeug/neusolo.sh` |
| Was ist gemeinsam, wie wird es verteilt? | `doku/gemeinsam.md` |
| Prüfen, Proben, Screenshots | `doku/pruefen.md` |
| Dienste, Apache, Rechte, Git-Ebenen | `doku/betrieb.md` |
| Was darf inhaltlich auf die Seite? | `doku/inhalte.md` |
| Startseite ändern | `doku/startseite.md` |
| Hochzeitsseite (`/hochzeit/`, kein Spiel) | `doku/hochzeit.md` |
| Was als Nächstes gebaut wird | `SPIELE-IDEEN.md` (nicht im Repo, 403) |
| Offene Risiken | `RISIKEN-TODO.md` (nicht im Repo, 403) |
| Was bei den neuen Spielen noch fehlt | `OFFEN-NACHZIEHEN.md` (nicht im Repo, 403) |

Ports und Pfade **nicht** aus einer Tabelle in einer Markdown-Datei abschreiben
– es gibt `spiele.json`:

```bash
jq -r '.spiele[] | "\(.name) \(.port // "-") \(.dienst // "-")"' spiele.json
jq -r '.portsFrei[0]' spiele.json     # nächster freier Port
```

## Wie hier gearbeitet wird

Weitgehend autonom, ohne Rückfragen bei Kleinigkeiten. Jedes Spiel bleibt
**eigenständig**: eigener Ordner, eigener Port, eigene Datenbank, eigenes Repo.
Ein Fehler in einem Spiel darf kein anderes mitreißen. Gemeinsame Teile werden
deshalb **kopiert, nicht importiert** – siehe `doku/gemeinsam.md`.

Zu jedem neuen Spiel gehören: Anleitung, Screenshot und eine Kachel auf
`spiele/`. Ohne grünen Prüflauf gilt nichts als fertig.

## Die vier Fallen

1. **Steuerzeichen-Regex.** `cleanName` enthält `/[\u0000-\u001f\u007f]/g`.
   Wird sie als Literal getippt, landen echte Steuerzeichen in der Datei und
   die Klasse kippt ins Gegenteil. Immer mit `\u`-Escapes schreiben, danach
   `grep -n 'u0000' <datei>` – findet das nichts, stehen rohe Bytes drin.
2. **Deutsche Anführungszeichen in JS-Strings.** `"… „Nur drehen" …"` beendet
   den String zu früh. In `console.log`/`throw` Backticks nehmen. Prüfen:
   ``grep -n '„[^“`]*"' *.js``
3. **`pkill -f "<name>"` trifft die eigene Shell.** Testserver über den Port
   beenden: `ss -tlnp | grep ':PORT '` → `kill <pid>`.
4. **`deno check` findet keine vergessenen Importe.** In reinem JS (ohne
   Typannotationen) geht ein unbekannter Name glatt durch – der Dienst startet
   und stirbt erst beim ersten Aufruf der Stelle. Nachgewiesen am 16.08.2026:
   eine Datei mit `return gibtsGarNicht(x)` prüft mit Exitcode 0 durch. Nach
   jedem Herauslösen einer Datei deshalb **`deno task probe` laufen lassen**,
   nicht nur `check` – und `systemctl status <spiel>` ansehen.

## Zum Schluss immer

```bash
cd /var/www/html
node werkzeug/verteilen.mjs --pruefen        # gemeinsame Teile noch gleich?
jq -r '.spiele[].name' spiele.json | while read p; do
  printf "  /%-12s %s\n" "$p/" "$(curl -s -o /dev/null -w '%{http_code}' https://inf-zeus.de/$p/)"
done
for f in RISIKEN-TODO.md SPIELE-IDEEN.md OFFEN-NACHZIEHEN.md spiele.json CLAUDE.md; do
  printf "  %-20s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' https://inf-zeus.de/$f)"
done   # alle fünf müssen 403 sein
```

Wurde irgendwo **committet**, kommt der Repo-Abgleich dazu – ein `push` allein
sagt nicht, dass der Stand auch oben liegt. Befehl in `doku/betrieb.md`
(„Nach dem Committen: kam es auch oben an?").
