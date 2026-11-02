# Mitbringen – `/mitbringen/` (kein Spiel, öffentlich seit 21.10.2026)

Angelegt am 20.10.2026. Ein Schwarzes Brett: Leute geben eine Einkaufsliste mit
Betrag fürs Mitbringen auf, wer in der Nähe einkauft, schreibt sie an; oder Leute
tragen sich als Fahrer mit festem Preis je Einkauf ein und werden angeschrieben.
Konto, Chat, Benachrichtigungen, Melden. **Über die Seite fließt kein Geld** –
bezahlt wird an der Haustür, nach Kassenbon.

Wer dort arbeitet: **`mitbringen/CLAUDE.md`** (das Wo) und
**`mitbringen/README.md`** (das Warum, die Sicherheit).

## Was der Seitenrahmen davon wissen muss

* **Zwei Ports, ein Dienst** (`systemctl status mitbringen`): 8093 die Seite,
  8094 der Admin-Bereich. Apache (`conf-available/mitbringen.conf`) lässt
  `/mitbringen/admin/` nur mit `dashboard.htpasswd` durch – dieselbe wie
  Tradingbots und Lader. Der öffentliche Port kennt `/admin` gar nicht.
* **Steht unter `still`** in `spiele.json` (kein Spiel, keine Kachel auf
  `/spiele/`), ist aber seit 21.10.2026 **öffentlich**: breite Kachel unter dem
  Raster der Startseite (`index.html`, `.kachel.breit`), kein `noindex` mehr –
  nur `/mitbringen/admin/` bleibt draußen. Trägt nur `sprache.js`, kein
  `lobbyCss` – eigenes, helles Aussehen.
* **Daten:** eine SQLite-Datei `mitbringen/daten/mitbringen.db`
  (`node:sqlite`, in Deno eingebaut). Außerhalb von `public/`, Apache kommt
  bei `/mitbringen/` nicht ans Dateisystem.
* **Rechtstexte:** Regeln/Nutzungsbedingungen in `mitbringen/public/regeln.html`,
  Datenschutz als Abschnitt `#mitbringen` in `/recht/datenschutz/`, ein Absatz
  unter „Art des Angebots“ in `/recht/impressum/` (DSA-Kontaktstelle).
* **Läuft NICHT als `www-data`**, sondern als eigener Benutzer `mitbringen`:
  `daten/` gehört ihm und ist 0700, damit ein geknacktes Spiel nicht an die
  Chats kommt. Ein hausweites `chown -R www-data` schadet nicht – die Unit
  stellt die Rechte bei jedem Start wieder her (`ExecStartPre=+`).
* **Chats, Telefon, Adresse sind verschlüsselt gespeichert** (AES-256-GCM,
  `mitbringen/krypto.js`). Schlüssel: `/etc/mitbringen/schluessel` (root,
  0600), per `LoadCredential` in den Dienst. **Ohne Schlüssel startet der
  Dienst nicht, und verloren ist alles** – getrennt mitsichern.

## Prüfen

```bash
cd /var/www/html/mitbringen && deno task probe     # eigener Server, eigene Daten, ~95 Prüfungen
cd /root/werkzeug-screenshots && node pruefe-mitbringen.mjs /tmp   # Bilder, braucht Testdaten
```

`probe.js` läuft **nie gegen live** – es legt Konten an und löscht sie.

## Live seit 21.10.2026

Zum Start geleert: Testkonten, alle Anzeigen, Chats, Meldungen und Hinweise.
Übrig blieben nur die beiden eigenen Konten des Betreibers. Testdaten gibt es
weiter auf Knopfdruck im Admin – sie tragen auf der Seite ein gelbes
„TEST“-Schild, also nach dem Ausprobieren wieder löschen.
