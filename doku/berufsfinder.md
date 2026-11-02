# Berufsfinder (`/berufsfinder/`)

Seit 20.10.2026. Kein Spiel, kein Dienst, kein Port: Apache liefert den Ordner
aus, gerechnet wird im Browser. **Nur Deutsch** – keine `sprache.js`, keine
`data-t`, auch die Kachel auf der Startseite nicht.

## Was er tut

50 Fragen, eine je Bildschirm (Zahlen 1–9 und ← gehen auch):

| Abschnitt | Fragen | Art | wirkt auf |
|---|---|---|---|
| Was dich zieht | 22 | fünf Stufen Nein … Ja | Interessen, ein wenig Stil |
| Situationen | 8 | eine Antwort | Interessen, Stil |
| Wie du arbeitest | 12 | zwei Pole, fünf Punkte | Stil |
| Schule | 2 | bis zu 3 Lieblings-/Hassfächer | Interessen |
| Was dir wichtig ist | 1 | genau 3 Werte | Passung der Berufe |
| Wo du stehst | 5 | Abschluss, Lerndauer, Geld, Theorie | Wegempfehlung, Pfade |

Ergebnis: ein Typ aus den zwei stärksten Interessen („Analytischer
Technikmensch"), Netzdiagramm über zehn Interessen, sechs Stil-Achsen, eine
Wegempfehlung (Studium / dual / Ausbildung / direkt), Branchen, die Top 5 mit
Gehalt und Weg als Zeitstrahl, „Daran denkt kaum jemand" (Berufe mit
`selten: true`), sechs bekannte Menschen zum Vergleich (aufs Netz legbar) und
alle 124 Berufe zum Durchsuchen.

## Dateien

| Datei | Was |
|---|---|
| `fragen.js` | Achsen, Fragen mit Gewichten, Fächer, Werte, Vergleichspersonen |
| `berufe.js` | die Berufe: Interessen 1–3, Stilziele −1…1, Werte, Weg, Zugang, Gehalt |
| `rechnen.js` | Profil, Passung, Wege, Typ, Vergleich, Teilen – ohne DOM |
| `app.js` | Bildschirme, Netzdiagramm, Ergebnis |
| `probe.mjs` | rechnet ohne Browser: Verteilung der Prozente, sieben gezielte Personen |

## Rechnung

- Interessen 0–100: Punkte geteilt durch das auf der Achse höchstens Mögliche.
  Stil −100…100 ebenso.
- Passung = 0,6 Interessen (halb absolut, halb *was bei dir heraussticht*) +
  0,22 Stil + 0,1 Werte + 0,08 Lerndauer. Angezeigt über `prozent()`, geeicht
  mit `probe.mjs` (Zufallsprofile: Median um 55, klares Profil oben um 90).
- Der Pfad jedes Berufs beginnt mit dem nötigen Schulabschluss; fehlt er dem
  Menschen, steht er gestrichelt da mit dem Weg zum Nachholen.
- Bekannte Menschen: Profile **geschätzt aus dem Lebenslauf**, so steht es auch
  auf der Seite. Verglichen wird die Form (Interessen minus eigener Mittelwert)
  plus Stil, per Kosinus.

## Ändern

Neuer Beruf: eine Zeile `B(...)` in `berufe.js`, dann `node berufsfinder/probe.mjs`
– die Probe sagt, ob die gezielten Personen noch ihre Berufe finden und ob ein
Beruf plötzlich bei jedem oben steht. Die Zahl „124 Berufe" steht auf der
Startseite des Finders im HTML; `50 Fragen` ebenso, auch in der Kachel.

Gespeichert wird nur im `localStorage` des Besuchers (`berufsfinder.v1`).
Geteilt wird über `#e=<Antworten>` in der Adresse – ändert sich die Zahl der
Fragen, sind alte Links ungültig und landen auf der Startseite des Finders.

Eigenes lokales Git in `berufsfinder/`, wie bei `noten/`.
