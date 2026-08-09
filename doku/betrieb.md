# Betrieb

Ports, Dienste und Pfade stehen in **`spiele.json`**, nicht hier.

```bash
jq -r '.spiele[] | "\(.name)\t\(.port // "-")\t\(.dienst // "-")"' spiele.json
jq -r '.portsFrei[0]' spiele.json      # nächster freier Port
jq -r '.portsFremd' spiele.json        # belegt, aber nicht von Spielen
```

Alle Spiele binden auf `127.0.0.1` und stehen nicht in UFW; nach außen führt
ausschließlich Apache.

## Dienste

Zehn laufen unter **systemd**, zwei unter **PM2** (Keep, Card Chaos).
`systemctl is-active keep` sagt „inactive", obwohl das Spiel läuft – für die
beiden ist `pm2 list` zuständig.

```bash
systemctl restart <spiel> && journalctl -u <spiel> -n 20 --no-pager
```

Vorlagen: `/etc/systemd/system/amehesten.service` und
`/etc/apache2/conf-available/amehesten.conf`. Beide unterscheiden sich zwischen
den Spielen nur in Name, Beschreibung, Pfad und Port.

Zwei Dinge, ohne die der Dienst nicht startet: `User=www-data` und
`DENO_DIR=/tmp/deno-cache` – www-data darf nicht in sein Home schreiben. Und
nach jedem Schreiben in einen Spielordner als root:
`chown -R www-data:www-data /var/www/html/<spiel>`.

In der Apache-Konfiguration muss die `/ws`-Regel **vor** der allgemeinen
stehen.

## Speicher

Nachgemessen am 09.08.2026, nicht geschätzt:

```bash
for s in $(jq -r '.spiele[]|select(.dienst=="systemd").name' spiele.json); do
  printf "%-12s %s\n" "$s" "$(systemctl show $s -p MemoryCurrent | sed 's/.*=//')"
done
```

Ein Deno-Dienst belegt im Leerlauf **rund 17 MB**, alle zehn plus Bugreport
zusammen **176 MB** von 7,7 GB. Die frühere Angabe hier (60 MB je Dienst,
550 MB gesamt) war zu hoch gegriffen.

Ausreißer ist **Wortleger mit 25 MB** – die 5,4-MB-Wortliste liegt im Speicher.
Sie liegt dort als roher Bytepuffer und nicht als `Set`, genau deshalb sind es
25 und nicht rund 100 MB; die Begründung samt Messung steht in
`wortleger/woerter.js`.

Unkritisch, aber nicht beliebig skalierbar: ab etwa zwanzig Spielen wird daraus
ein Thema. Dann wäre Start auf Anfrage die Lösung – heute wäre das Aufwand ohne
Anlass.

## Was nicht ins Netz darf

`.htaccess` sperrt auf 403: `RISIKEN-TODO.md`, `SPIELE-IDEEN.md`, `CLAUDE.md`,
`spiele.json`, `/werkzeug/`, `/gemeinsam/`, `/doku/` und `/.git/`. Nach dem
Anlegen neuer interner Dateien dort nachsehen und danach prüfen:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://inf-zeus.de/spiele.json   # 403
```

`README.md` ist dagegen bewusst öffentlich. `CLAUDE.md` ist im Repo, aber nicht
im Netz – sie nennt Serverpfade.

## Versionsverwaltung

**Vier getrennte Ebenen, nicht vermischen:**

1. **Der Seitenrahmen** (`/var/www/html`, Remote vorhanden). Seine
   `.gitignore` ist eine **Freigabeliste**: erst alles ignorieren, dann
   einzeln zulassen. Neue Spielordner sind dadurch automatisch draußen – das
   ist beabsichtigt und soll so bleiben. `gemeinsam/`, `doku/`, `werkzeug/`
   und `spiele.json` sind freigegeben: sie beschreiben den Rahmen.
2. **Die vier alten Spiele** und der Bugreport: eigene GitHub-Repos.
3. **Die sieben neueren Spiele**: eigenes Repo je Spiel. Welches, steht in
   `spiele.json` unter `repo`; `null` heißt: noch keins angelegt.
4. **`RISIKEN-TODO.md` und `SPIELE-IDEEN.md`**: in **keinem** Repo.

Der Schlüssel `/root/.ssh/id_ed25519_github` authentifiziert sich als
`gthdtasdnm`. **`gh` ist nicht installiert** – leere Repos anlegen ist Sache
des Nutzers, danach:

```bash
git -C /var/www/html/<spiel> remote add origin git@github.com:gthdtasdnm/<repo>.git
git -C /var/www/html/<spiel> push -u origin main
```

`git config --global --add safe.directory <pfad>` ist für jedes Repo nötig
(die Ordner gehören `www-data`, git läuft als root). Für alle bestehenden ist
das schon eingetragen.

Commit-Nachrichten sind hier ausführlich und begründen **warum**, nicht was.
Am Ende:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### Nach dem Committen: kam es auch oben an?

Ein erfolgreicher `push` sagt das nicht, und `repo` in `spiele.json` erst recht
nicht – das heißt nur „es gibt eine Gegenstelle". Am 09.08.2026 hatten fünf
Repos je einen Commit, der seit Wochen nur lokal lag. Verglichen wird deshalb
der Commit selbst:

```bash
cd /var/www/html
jq -r '.spiele[] | select(.repo != null) | "\(.name) \(.repo)"' spiele.json |
while read name url; do
  lokal=$(git -C "/var/www/html/$name" rev-parse HEAD)
  fern=$(git ls-remote "$url" refs/heads/main | cut -f1)
  [ "$lokal" = "$fern" ] || echo "  $name weicht ab"
done
```

Keine Ausgabe heißt: alle gleich. Der Lauf dauert eine halbe Minute (eine
Netzabfrage je Repo) und gehört in jede Sitzung, in der irgendwo committet
wurde – sonst fällt so etwas erst beim nächsten Plattenschaden auf.

**`git checkout -- <datei>` stellt aus dem Index wieder her**, nicht aus HEAD.
Nach einem `git add` ist das nicht, was man will – `git checkout HEAD -- <datei>`
nehmen.
