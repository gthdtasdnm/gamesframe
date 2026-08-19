# Was auf die Seite darf

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

## Jugendschutz

**Zwei** Spiele haben 18+-Inhalte: `/nochnie/` und – seit dem 19.08.2026 –
`/amehesten/`. Beide nach demselben Muster:

- ein **eigener** Stapel, nie in die harmlosen untergemischt
- eine Voreinstellung ohne 18+ (`harmlos` bzw. `gemischt`)
- eine Abfrage vor dem Umschalten **und** vor dem Beitritt in einen Raum, der
  schon so eingestellt ist – der zweite Fall ist der wichtigere, dort hat man
  die Entscheidung nicht selbst getroffen
- die Bestätigung im `localStorage`, je Spiel ein eigener Schlüssel
  (`nochnie_ab18`, `amehesten_ab18`)
- die jeweilige `probe.js` weist nach, dass kein 18+-Text in einen der anderen
  Modi durchrutscht

Ob das reicht (JMStG), steht als offene Frage in `RISIKEN-TODO.md` – die gilt
jetzt für beide.

**Flaschendrehen** umgeht das weiterhin bewusst: seine Karten kommen ohne
Alkohol, Sex und Körperkontakt aus. `probe.js` prüft dort jede Karte gegen eine
Wortliste und schlägt an, sobald jemand die Grenze verschiebt.

Bei **Wer am ehesten** gilt die Trennlinie innerhalb des Spiels: `HARMLOS` und
`FRECH` bleiben frei von Alkohol, Sex und Körperlichem, „frech" heißt dort
peinlich. Alles andere gehört in `SCHMUTZIG`.

**Wer einen harmlosen Stapel erweitert, holt sich die ganze
Jugendschutz-Abwägung mit dazu** – dann gilt, was `SPIELE-IDEEN.md` für die
Trinkspiel-Sparte verlangt: eigener Bereich, 18-plus-Hinweis, trinkfreie
Voreinstellung.

Poker o. ä.: **nur Spielgeld, keine Verbindung zum Spendenknopf.** Sobald Geld
hineingeht, ist es Glücksspiel (§ 284 StGB / GlüStV) und erlaubnispflichtig.
