# Die Startseite

`spiele/index.html` ist eine einzelne Datei mit Inline-CSS. Zwei Kategorien,
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

## Die Kategorie oben

Ganz oben steht „Am meisten gespielt" – vier Kacheln, die nicht von Hand
dorthin gesetzt wurden, sondern von `werkzeug/rangfolge.mjs` aus gezählten
Aufrufen. Das Skript **schreibt in diese Datei**; nach einem Wechsel steht sie
deshalb in `git status`. Wie es zählt und welche Hürden davor stehen:
`doku/beliebt.md`.

Die verschobenen Kacheln tragen `data-heimat` und `data-platz` – den Rückweg
in ihre eigentliche Kategorie. Nie von Hand entfernen.

**Nicht rückgängig machen:** Die Kacheln bleiben statisches HTML. Die
Ideendatei schlägt vor, die Liste als JS-Datenfeld zu führen; dann zeigte die
Seite ohne JavaScript gar keine Spiele mehr, und die Übersicht ist der einzige
Teil dieser Seite, der auch ohne JS etwas wert ist. `spiele.json` ist die
Quelle für **Betrieb** (Ports, Dienste), nicht für die Anzeige.

## Beim Hinzufügen mitziehen

- die **Kategorie** wählen,
- das **Zahlwort** im Untertitel und in `<meta name="description">` (zweimal),
- den **Statuspunkt** (kommt automatisch aus dem Link),
- den **Fußtext**, falls er eine Ausnahme nennt.

Danach `node pruefe-startseite.mjs` – der Lauf prüft alle Kacheln, alle Dialoge
und alle Bilder.
