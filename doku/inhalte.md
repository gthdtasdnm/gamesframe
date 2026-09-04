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

**Drei** Spiele haben 18+-Inhalte: `/nochnie/`, seit dem 19.08.2026
`/amehesten/` und seit dem 02.09.2026 `/imposter/`. Alle nach demselben Muster:

- ein **eigener** Stapel, nie in die harmlosen untergemischt
- eine Voreinstellung ohne 18+ (`harmlos` bzw. `gemischt`)
- eine Abfrage vor dem Umschalten **und** vor dem Beitritt in einen Raum, der
  schon so eingestellt ist – der zweite Fall ist der wichtigere, dort hat man
  die Entscheidung nicht selbst getroffen
- die Bestätigung im `localStorage`, je Spiel ein eigener Schlüssel
  (`nochnie_ab18`, `amehesten_ab18`, `imposter_ab18`)
- die jeweilige `probe.js` weist nach, dass kein 18+-Text in einen der anderen
  Modi durchrutscht

Ob das reicht (JMStG), steht als offene Frage in `RISIKEN-TODO.md` – die gilt
jetzt für alle drei.

Bei **Imposter** hängt das 18+ nicht am Spiel, sondern an *einer* seiner zwei
Betriebsarten: die derben Wortpaare gibt es nur in „Zwei Wörter", die
klassische Art fasst `paare.js` gar nicht erst an. Im Paar steht links das
unverfängliche und rechts das anstößige Wort – eine Zusage, auf der die Probe
steht: kein Wort der rechten Spalte darf in einem harmlosen Raum, im harmlosen
Stapel, in `begriffe.js` oder in der klassischen Art vorkommen. Die linke
Spalte darf sich überschneiden (Sauna, Museum, Angeln).

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

## Glückspilz (03.09.2026)

Seit dem 03.09.2026 gibt es genau ein Spiel, das diesen Satz ernst nimmt:
**`/glueckspilz/`**, ein Spielgeld-Kasino mit elf Glücksspielen und einer
erfundenen Börse. Es ist der Grenzfall, für den der Satz geschrieben wurde,
deshalb steht hier, wie die Grenze gezogen ist:

- **Geld entsteht nur am Knopf.** Ein Druck, ein Cent. Es gibt keine
  Einzahlung, keine Auszahlung, keinen Gutschein, keinen Handel zwischen
  Konten und **keine Verbindung zum Spendenknopf** der Seite. Wer spendet,
  bekommt kein Spielgeld; wer spielt, kann nichts herausnehmen.
- **Die Währung heißt Euro und ist keiner.** Das ist Absicht: eine erfundene
  Währung („Taler“) würde die Mechanik verschleiern, um die es geht. Dafür
  steht auf der Anmeldeseite, in der Hilfe und auf der Kachel derselbe Satz –
  hier läuft kein echtes Geld.
- **Die Auszahlungsquote steht offen da: knapp unter 97 %.** Das Haus gewinnt,
  und das Spiel sagt es. Es sagt auch, was das heißt: auf Dauer verliert man,
  und genau so ist ein Kasino gebaut. Bis zum 04.09.2026 stand dort 99 %, und
  gemessen zahlte das Haus wegen zu häufiger Glücksbringer 142 % aus – eine
  Quote, die auf dem Bildschirm steht und nicht stimmt, ist schlimmer als
  eine niedrige. Was daran geändert wurde, steht in `glueckspilz/README.md`.
- **Jeder Wurf ist nachrechenbar.** Der Hash der Server-Saat steht vorher da;
  wer sie aufdeckt, kann jede alte Runde nachrechnen. Ein Spielgeldhaus, das
  schummelt, wäre nicht harmloser, sondern nur schlechter.

**Jugendschutz** wie bei den drei anderen: eine Abfrage – hier vor dem Anlegen
eines Kontos, nicht vor der ersten Wette, denn wer ein Konto hat, hat schon
angefangen –, die Bestätigung unter `glueckspilz_ab18` im `localStorage`, und
auf der Anmeldeseite wie in der Hilfe der Hinweis auf die kostenlose und
anonyme Beratung der BZgA. Ob das reicht (JMStG), steht wie bei den anderen
als offene Frage in `RISIKEN-TODO.md`.

**Was hier nicht hineingehört:** ein zweites Spiel dieser Art. Das eine trägt
die ganze Abwägung; ein zweites brächte nichts Neues und verdoppelte nur die
Angriffsfläche.
