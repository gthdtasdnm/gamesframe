# inf-zeus.de – Wegweiser

Diese Datei wird in **jeder** Sitzung gelesen. Deshalb steht hier nur, was in
jeder Sitzung gebraucht wird: wo etwas liegt, und die drei Fallen, die sonst
jedes Mal zuschlagen. Alles andere steht in `doku/` und wird **nur bei Bedarf**
geöffnet. Stand: 08.08.2026.

## Was hier liegt

`/var/www/html` ist der DocumentRoot. Darin: zwölf Browserspiele, die
Spieleübersicht, ein Bugreport-Werkzeug, zwei Rechtstexte – und, damit nicht
verwechselt, Nextcloud und zwei Tradingbots.

**Arbeitsbereich sind die Spiele.** `nextcloud`, `tradingbot_value`,
`tradingbot_momentum`, `/reader/` und `_alt-tot-20260807` nur anfassen, wenn
ausdrücklich danach gefragt wird.

## Wohin zum Nachlesen

| Frage | Datei |
|---|---|
| Welche Spiele, welcher Port, welcher Dienst, welches Repo? | **`spiele.json`** – maschinenlesbar, einzige Quelle |
| Neues Spiel bauen | `doku/neues-spiel.md` |
| Was ist gemeinsam, wie wird es verteilt? | `doku/gemeinsam.md` |
| Prüfen, Proben, Screenshots | `doku/pruefen.md` |
| Dienste, Apache, Rechte, Git-Ebenen | `doku/betrieb.md` |
| Was darf inhaltlich auf die Seite? | `doku/inhalte.md` |
| Startseite ändern | `doku/startseite.md` |
| Was als Nächstes gebaut wird | `SPIELE-IDEEN.md` (nicht im Repo, 403) |
| Offene Risiken | `RISIKEN-TODO.md` (nicht im Repo, 403) |

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

## Die drei Fallen

1. **Steuerzeichen-Regex.** `cleanName` enthält `/[\u0000-\u001f\u007f]/g`.
   Wird sie als Literal getippt, landen echte Steuerzeichen in der Datei und
   die Klasse kippt ins Gegenteil. Immer mit `\u`-Escapes schreiben, danach
   `grep -n 'u0000' <datei>` – findet das nichts, stehen rohe Bytes drin.
2. **Deutsche Anführungszeichen in JS-Strings.** `"… „Nur drehen" …"` beendet
   den String zu früh. In `console.log`/`throw` Backticks nehmen. Prüfen:
   ``grep -n '„[^“`]*"' *.js``
3. **`pkill -f "<name>"` trifft die eigene Shell.** Testserver über den Port
   beenden: `ss -tlnp | grep ':PORT '` → `kill <pid>`.

## Zum Schluss immer

```bash
cd /var/www/html
node werkzeug/verteilen.mjs --pruefen        # gemeinsame Teile noch gleich?
jq -r '.spiele[].name' spiele.json | while read p; do
  printf "  /%-12s %s\n" "$p/" "$(curl -s -o /dev/null -w '%{http_code}' https://inf-zeus.de/$p/)"
done
for f in RISIKEN-TODO.md SPIELE-IDEEN.md spiele.json CLAUDE.md; do
  printf "  %-18s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' https://inf-zeus.de/$f)"
done   # alle vier müssen 403 sein
```
