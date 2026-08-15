/**
 * games-data.js
 *
 * Zentrale Datenquelle für alle Kategorien und Spiele im PixelPort.
 * Hier werden später einfach neue Einträge ergänzt, die restliche Seite
 * (Startseite + Kategorie-Seite) rendert daraus automatisch die Kacheln.
 *
 * Neue Kategorie hinzufügen:
 *   -> neues Objekt in GAME_CATEGORIES anlegen. Optionales Feld
 *      theme: "light" markiert eine Kategorie als hell/verspielt
 *      (größere, "knuffigere" Kacheln auf der Kategorie-Seite,
 *      siehe js/category.js) - weglassen für den normalen dunklen Look.
 *
 * Neues Spiel hinzufügen:
 *   -> neues Objekt in das "games"-Array der passenden Kategorie einfügen.
 *
 * Spiel-Objekt:
 *   id         eindeutige ID innerhalb der Kategorie
 *   name       Anzeigename
 *   icon       Emoji-Icon für die Kachel
 *   available  true, sobald das Spiel wirklich spielbar ist
 *   url        Pfad zum Spiel (z.B. "games/pong/index.html"), sobald es existiert
 *   howToPlay  optional: 2-4 kurze Sätze, die das Spielprinzip für absolute
 *              Anfänger erklären. Wird über den "❓ Wie spiele ich das?"-Button
 *              auf der Kachel angezeigt (js/category.js + js/game-screens.js).
 *              Weglassen -> Button erscheint einfach nicht auf der Kachel.
 *   isNew      optional, nur bei available:true relevant: zeigt ein kleines
 *              "✨ Neu"-Badge auf der Kachel. Von Hand wieder entfernen
 *              (Feld löschen oder auf false setzen), sobald das Spiel nicht
 *              mehr "neu" ist.
 */

const GAME_CATEGORIES = [
  {
    id: "brettspiele-digital",
    name: "Brettspiele (digital)",
    icon: "🎲",
    theme: "light",
    description: "Klassische Brettspiele digital umgesetzt.",
    games: [
      {
        id: "vier-gewinnt",
        name: "Vier Gewinnt",
        icon: "🔴🟡",
        available: true,
        url: "games/vier-gewinnt/index.html",
        howToPlay:
          "Zwei Spieler werfen abwechselnd Spielsteine in eines von mehreren senkrechten Feldern, die sich von unten füllen. Ziel ist es, als Erster vier eigene Steine in einer Reihe zu bekommen - waagerecht, senkrecht oder diagonal. Wer das zuerst schafft, gewinnt.",
      },
      {
        id: "tic-tac-toe",
        name: "Tic-Tac-Toe",
        icon: "❌⭕",
        available: true,
        url: "games/tic-tac-toe/index.html",
        howToPlay:
          "Auf einem 3x3-Feld setzen zwei Spieler abwechselnd ihr Symbol (X oder O) in ein freies Feld. Wer zuerst drei eigene Symbole in einer Reihe hat - waagerecht, senkrecht oder diagonal - gewinnt. Sind alle Felder voll ohne Gewinner, endet die Partie unentschieden.",
      },
      {
        id: "schach",
        name: "Schach",
        icon: "♟️",
        available: true,
        url: "games/chess/index.html",
        howToPlay:
          "Zwei Spieler bewegen abwechselnd ihre Figuren auf einem 8x8-Feld, wobei jede Figur eigene Zugregeln hat. Ziel ist es, den gegnerischen König so anzugreifen, dass er nicht mehr entkommen kann (Schachmatt). Zieht eine eigene Figur auf das Feld einer gegnerischen, wird diese geschlagen.",
      },
      {
        id: "dame",
        name: "Dame",
        icon: "⚫⚪",
        available: true,
        url: "games/dame/index.html",
        howToPlay:
          "Zwei Spieler bewegen ihre Steine diagonal über ein Schachbrett-Feld. Springt man diagonal über einen gegnerischen Stein und die Landefläche dahinter ist frei, wird dieser geschlagen und entfernt. Wer alle gegnerischen Steine schlägt oder bewegungsunfähig macht, gewinnt. Ist ein Schlagzug möglich, muss geschlagen werden (Schlagzwang).",
      },
      {
        id: "memory",
        name: "Memory",
        icon: "🎴",
        available: false,
        url: null,
        howToPlay:
          "Auf dem Spielfeld liegen verdeckte Kartenpaare. Du deckst nacheinander zwei Karten auf - stimmen sie überein, darfst du sie behalten und nochmal ziehen. Passen sie nicht zusammen, werden beide wieder umgedreht. Am Ende gewinnt, wer die meisten Paare gefunden hat.",
      },
      {
        id: "reversi",
        name: "Reversi",
        icon: "⚪⚫",
        available: true,
        url: "games/reversi/index.html",
        howToPlay:
          "Zwei Spieler legen abwechselnd Steine auf ein 8x8-Feld. Schließt dein neuer Stein eine gerade Reihe gegnerischer Steine zwischen zwei eigenen Steinen ein, werden alle eingeschlossenen Steine zu deiner Farbe gedreht. Am Ende gewinnt, wer die meisten Steine seiner Farbe auf dem Brett hat.",
      },
      {
        id: "muehle",
        name: "Mühle",
        icon: "🕸️",
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler setzen abwechselnd ihre Steine auf die Kreuzungspunkte eines Linienmusters. Bringst du drei eigene Steine in eine gerade Reihe (eine 'Mühle'), darfst du einen gegnerischen Stein entfernen. Nach dem Setzen aller Steine werden sie entlang der Linien verschoben. Wer nur noch zwei Steine hat oder sich nicht mehr bewegen kann, verliert.",
      },
      {
        id: "backgammon",
        name: "Backgammon",
        icon: "🎲",
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler würfeln und bewegen ihre 15 Steine entlang des Brettes in Richtung ihres Zielfelds. Trifft man auf ein Feld mit genau einem gegnerischen Stein, wird dieser rausgeworfen und muss von vorne starten. Wer zuerst alle eigenen Steine ins Ziel gebracht hat, gewinnt.",
      },
      {
        id: "mastermind",
        name: "Mastermind",
        icon: "🧠",
        available: false,
        url: null,
        howToPlay:
          "Der Computer wählt eine geheime Farbkombination. Du versuchst, sie in möglichst wenigen Versuchen zu erraten - nach jedem Tipp zeigen dir Stifte, wie viele Farben richtig und an der richtigen Position sind. So näherst du dich Schritt für Schritt der Lösung.",
      },
    ],
  },
  {
    id: "spiele-1990",
    name: "1990er Spiele",
    icon: "👾",
    description: "Retro-Klassiker im Stil der 90er Jahre.",
    games: [
      {
        id: "pong",
        name: "Pong",
        icon: "🏓",
        available: true,
        url: "games/pong/index.html",
        isNew: true,
        howToPlay:
          "Zwei Schläger, einer links und einer rechts, bewegen sich rauf und runter. Ihr müsst den Ball mit eurem Schläger zurückschlagen, bevor er hinter euch vorbeifliegt. Verfehlt ihr den Ball, bekommt der Gegner einen Punkt. Wer zuerst 10 Punkte erreicht, gewinnt.",
      },
      {
        id: "snake",
        name: "Snake",
        icon: "🐍",
        available: true,
        url: "games/snake/index.html",
        howToPlay:
          "Du steuerst eine Schlange, die sich über das Spielfeld bewegt und ständig weiter wächst. Ziel ist es, Futter einzusammeln, ohne gegen die Wand oder den eigenen Schlangenkörper zu stoßen. Mit jedem gefressenen Futter wird die Schlange länger und das Spiel schwieriger.",
      },
      {
        id: "breakout",
        name: "Breakout",
        icon: "🧱",
        available: true,
        url: "games/breakout/index.html",
        howToPlay:
          "Mit einem beweglichen Schläger am unteren Rand hältst du einen Ball im Spiel. Der Ball soll die bunten Steine am oberen Bildschirmrand zerstören, indem er sie trifft. Fällt der Ball nach unten durch, ohne dass du ihn triffst, verlierst du ein Leben. Sind alle Steine zerstört, hast du gewonnen.",
      },
      {
        id: "tetris",
        name: "Tetris",
        icon: "🟦🟨",
        available: true,
        url: "games/tetris/index.html",
        howToPlay:
          "Verschiedene Blockformen fallen von oben ins Spielfeld. Du drehst und verschiebst sie, damit sie möglichst lückenlos ganze Reihen füllen. Volle Reihen verschwinden und bringen Punkte - stapeln sich die Blöcke bis nach oben, ist das Spiel vorbei.",
      },
      {
        id: "space-invaders",
        name: "Space Invaders",
        icon: "👽",
        available: true,
        url: "games/space-invaders/index.html",
        howToPlay:
          "Am unteren Bildschirmrand steuerst du ein Raumschiff und schießt auf Reihen von Alien-Gegnern, die sich langsam nach unten bewegen. Ziel ist es, alle Aliens abzuschießen, bevor sie den unteren Rand erreichen. Weiche dabei den Schüssen der Gegner aus.",
      },
      {
        id: "asteroids",
        name: "Asteroids",
        icon: "☄️",
        available: false,
        url: null,
        howToPlay:
          "Du steuerst ein Raumschiff, das sich frei im Weltall dreht und schwebt. Schieße die umherfliegenden Asteroiden ab, bevor sie dich rammen - große Brocken zerbrechen dabei in kleinere. Weiche außerdem den Trümmern aus, um zu überleben.",
      },
      {
        id: "labyrinth-jaeger",
        name: "Labyrinth-Jäger",
        icon: "🟡",
        available: false,
        url: null,
        howToPlay:
          "Du steuerst eine Figur durch ein Labyrinth und sammelst dabei alle Punkte ein. Gegnerische Geister jagen dich durch die Gänge - berühren sie dich, verlierst du ein Leben. Sammle spezielle Power-Pillen, um die Geister kurzzeitig selbst jagen zu können.",
      },
      {
        id: "frogger",
        name: "Frogger",
        icon: "🐸",
        available: false,
        url: null,
        howToPlay:
          "Du steuerst einen Frosch, der eine belebte Straße und einen Fluss voller Hindernisse überqueren muss. Auf der Straße weichst du Fahrzeugen aus, auf dem Fluss hüpfst du auf Baumstämme und Schildkröten, um nicht unterzugehen. Erreichst du das sichere Ufer, hast du die Runde geschafft.",
      },
    ],
  },
  {
    id: "kartenspiele",
    name: "Kartenspiele",
    icon: "🃏",
    theme: "light",
    description: "Klassische Kartenspiele für zwischendurch.",
    games: [
      {
        id: "mau-mau",
        name: "Mau Mau",
        icon: "🃏",
        available: true,
        url: "games/mau-mau/index.html",
        howToPlay:
          "Reihum legt ihr eine Karte, die zur Farbe oder zum Wert der obersten Karte passt. Eine 7 zwingt den nächsten Spieler, 2 Karten zu ziehen (mehrere 7en hintereinander addieren sich), eine 8 lässt den nächsten Spieler aussetzen, und ein Bube erlaubt es, eine neue Farbe zu wünschen. Kannst du keine passende Karte legen, musst du eine Karte ziehen. Wer zuerst alle Karten losgeworden ist, gewinnt.",
      },
      {
        id: "uno",
        name: "Uno",
        icon: "🔴🟡",
        available: true,
        url: "games/uno/index.html",
        howToPlay:
          "Reihum legt ihr eine Karte, die in Farbe oder Zahl/Symbol zur obersten Karte passt. Aussetzen überspringt den nächsten Spieler, Richtungswechsel dreht die Reihenfolge um, und +2 zwingt den nächsten Spieler, 2 Karten zu ziehen und auszusetzen. Die Farbwahl-Karten sind immer legal - die schwarze +4-Karte zwingt den nächsten Spieler zusätzlich, 4 Karten zu ziehen. Kannst du keine passende Karte legen, musst du eine Karte ziehen. Wer zuerst alle Karten losgeworden ist, gewinnt.",
      },
      {
        id: "solitaire",
        name: "Solitär",
        icon: "🂡",
        available: true,
        url: "games/solitaire/index.html",
        howToPlay:
          "Du sortierst Spielkarten in absteigender Reihenfolge und abwechselnder Farbe auf mehreren Tableau-Stapeln. Ziel ist es, alle Karten nach Farbe sortiert von Ass bis König auf vier Ablage-Stapel zu legen. Der Nachziehstapel hilft dir, wenn du im Tableau nicht mehr weiterkommst.",
      },
      {
        id: "skat",
        name: "Skat",
        icon: "♠️",
        available: false,
        url: null,
        howToPlay:
          "Drei Spieler erhalten Karten, einer davon spielt (je nach Reizung) allein gegen die anderen beiden. Es wird nach Farbe bedient, die höchste Karte gewinnt den Stich. Am Ende zählen die Kartenwerte der eigenen Stiche - der Alleinspieler gewinnt, wenn er genug Punkte sammelt.",
      },
      {
        id: "kriegsspiel",
        name: "Kriegsspiel",
        icon: "⚔️",
        available: false,
        url: null,
        howToPlay:
          "Das Kartendeck wird gleichmäßig auf zwei Spieler verteilt. Beide decken gleichzeitig ihre oberste Karte auf - wer die höhere Karte hat, gewinnt beide Karten. Bei Gleichstand kommt es zum 'Krieg': weitere Karten werden verdeckt und aufgedeckt eingesetzt. Wer am Ende alle Karten hat, gewinnt.",
      },
      {
        id: "schwimmen",
        name: "Schwimmen (31)",
        icon: "🏊",
        available: false,
        url: null,
        howToPlay:
          "Jeder Spieler hat drei Karten auf der Hand und tauscht reihum Karten mit der offenen Tischauslage, um möglichst viele Punkte in einer Farbe zu sammeln (Höchstwert: 31 mit Ass, König und Dame/Bube derselben Farbe). Wer zufrieden ist, klopft und beendet die Runde damit bald. Wer am Ende die wenigsten Punkte hat, verliert ein Leben.",
      },
    ],
  },
  {
    id: "duell-wasd-pfeiltasten",
    name: "Duell (WASD vs. Pfeiltasten)",
    icon: "⚔️",
    description: "Lokale 2-Spieler-Duelle: WASD gegen Pfeiltasten, auf derselben Tastatur.",
    games: [
      {
        id: "tron-duell",
        name: "Tron-Duell",
        icon: "🏍️",
        available: true,
        url: "games/tron-duell/index.html",
        howToPlay:
          "Zwei Spieler steuern Lichtmotorräder, die eine permanente Spur hinter sich herziehen. Fährst du gegen die Wand, deine eigene Spur oder die Spur des Gegners, verlierst du die Runde. Wer zuerst 3 Runden gewinnt, gewinnt das Duell.",
      },
      {
        id: "panzer-duell",
        name: "Panzer-Duell",
        icon: "🎯",
        available: true,
        url: "games/panzer-duell/index.html",
        howToPlay:
          "Zwei Panzer treten auf einem Feld mit Hindernissen gegeneinander an. Spieler 1 steuert mit WASD und schießt mit der Leertaste, Spieler 2 mit den Pfeiltasten und schießt mit Enter oder Strg. Trefft ihr den gegnerischen Panzer, gewinnt ihr die Runde - weicht dabei Hindernissen und gegnerischen Schüssen aus. Wer zuerst 3 Runden gewinnt, gewinnt das Duell.",
      },
      {
        id: "air-hockey",
        name: "Air Hockey",
        icon: "🏒",
        available: false,
        url: null,
        howToPlay:
          "Ein Puck wird zwischen zwei frei beweglichen Schlägern hin- und hergeschossen. Ihr bewegt eure Schläger in alle Richtungen, um den Puck ins gegnerische Tor zu befördern und das eigene zu verteidigen. Wer zuerst eine festgelegte Punktzahl erreicht, gewinnt.",
      },
      {
        id: "sumo-duell",
        name: "Sumo-Duell",
        icon: "🤼",
        available: false,
        url: null,
        howToPlay:
          "Zwei Ringer versuchen, sich gegenseitig aus einem runden Ring zu schubsen. Wer den Ring verlässt oder zu Boden geht, verliert die Runde. Wer zuerst genug Runden gewinnt, gewinnt das Duell.",
      },
      {
        id: "bomben-duell",
        name: "Bomben-Duell",
        icon: "💣",
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler legen in einem Labyrinth aus Mauern Bomben, die nach kurzer Zeit explodieren und alles in ihrer Reichweite zerstören - inklusive Wänden und dem Gegner. Weicht den Explosionen aus und sammelt Power-Ups ein, um stärker zu werden. Wer den Gegner zuerst erwischt, gewinnt.",
      },
    ],
  },
  {
    id: "wuerfel-partyspiele",
    name: "Würfel- & Partyspiele",
    icon: "🎉",
    theme: "light",
    description: "Klassische Würfel- und Gesellschaftsspiele für mehrere Spieler.",
    games: [
      {
        id: "shut-the-box",
        name: "Shut the Box",
        icon: "📦",
        available: true,
        url: "games/shut-the-box/index.html",
        howToPlay:
          "Auf einem Feld liegen Zahlenklappen von 1 bis 9. Du würfelst und schließt eine Kombination offener Klappen, deren Summe der Würfelzahl entspricht. Kannst du keine passende Kombination mehr bilden, endet dein Zug - deine offene Zahlensumme zählt als Minuspunkte. Ziel ist es, möglichst wenige oder gar keine Klappen übrig zu behalten.",
      },
      {
        id: "mensch-aergere-dich-nicht",
        name: "Mensch-ärgere-dich-nicht",
        icon: "🔴🔵🟡🟢",
        available: false,
        url: null,
        howToPlay:
          "Bis zu vier Spieler würfeln reihum und bewegen ihre vier Spielfiguren vom Startfeld über die Runde bis in ihr Zielhaus. Landest du auf dem Feld einer gegnerischen Figur, wird diese rausgeworfen und muss von vorne starten. Wer zuerst alle vier Figuren sicher im Ziel hat, gewinnt.",
      },
      {
        id: "kniffel",
        name: "Kniffel",
        icon: "🎲",
        available: false,
        url: null,
        howToPlay:
          "Du würfelst mit 5 Würfeln bis zu dreimal pro Runde und darfst dabei einzelne Würfel beiseitelegen. Am Ende der Runde trägst du das Ergebnis in eine von mehreren Kategorien ein (z.B. Dreierpasch, Kniffel, Full House). Nach 13 Runden gewinnt, wer die meisten Punkte gesammelt hat.",
      },
    ],
  },
];

/**
 * Liefert eine Kategorie anhand ihrer ID, oder null, falls sie nicht existiert.
 */
function getCategoryById(id) {
  return GAME_CATEGORIES.find((category) => category.id === id) || null;
}
