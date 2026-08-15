/**
 * games-data.js
 *
 * Zentrale Datenquelle für alle Kategorien und Spiele im PixelPort.
 * Hier werden später einfach neue Einträge ergänzt, die restliche Seite
 * (Startseite + Kategorie-Seite) rendert daraus automatisch die Kacheln.
 *
 * Neue Kategorie hinzufügen:
 *   -> neues Objekt in GAME_CATEGORIES anlegen.
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
    description: "Klassische Brettspiele digital umgesetzt.",
    games: [
      {
        id: "vier-gewinnt",
        name: "Vier Gewinnt",
        icon: "🔴🟡",
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler werfen abwechselnd Spielsteine in eines von mehreren senkrechten Feldern, die sich von unten füllen. Ziel ist es, als Erster vier eigene Steine in einer Reihe zu bekommen - waagerecht, senkrecht oder diagonal. Wer das zuerst schafft, gewinnt.",
      },
      {
        id: "tic-tac-toe",
        name: "Tic-Tac-Toe",
        icon: "❌⭕",
        available: false,
        url: null,
        howToPlay:
          "Auf einem 3x3-Feld setzen zwei Spieler abwechselnd ihr Symbol (X oder O) in ein freies Feld. Wer zuerst drei eigene Symbole in einer Reihe hat - waagerecht, senkrecht oder diagonal - gewinnt. Sind alle Felder voll ohne Gewinner, endet die Partie unentschieden.",
      },
      {
        id: "schach",
        name: "Schach",
        icon: "♟️",
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler bewegen abwechselnd ihre Figuren auf einem 8x8-Feld, wobei jede Figur eigene Zugregeln hat. Ziel ist es, den gegnerischen König so anzugreifen, dass er nicht mehr entkommen kann (Schachmatt). Zieht eine eigene Figur auf das Feld einer gegnerischen, wird diese geschlagen.",
      },
      {
        id: "dame",
        name: "Dame",
        icon: "⚫⚪",
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler bewegen ihre Steine diagonal über ein Schachbrett-Feld. Springt man diagonal über einen gegnerischen Stein und die Landefläche dahinter ist frei, wird dieser geschlagen und entfernt. Wer alle gegnerischen Steine schlägt oder bewegungsunfähig macht, gewinnt.",
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
        available: false,
        url: null,
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
        available: false,
        url: null,
        howToPlay:
          "Verschiedene Blockformen fallen von oben ins Spielfeld. Du drehst und verschiebst sie, damit sie möglichst lückenlos ganze Reihen füllen. Volle Reihen verschwinden und bringen Punkte - stapeln sich die Blöcke bis nach oben, ist das Spiel vorbei.",
      },
      {
        id: "space-invaders",
        name: "Space Invaders",
        icon: "👽",
        available: false,
        url: null,
        howToPlay:
          "Am unteren Bildschirmrand steuerst du ein Raumschiff und schießt auf Reihen von Alien-Gegnern, die sich langsam nach unten bewegen. Ziel ist es, alle Aliens abzuschießen, bevor sie den unteren Rand erreichen. Weiche dabei den Schüssen der Gegner aus.",
      },
    ],
  },
  {
    id: "kartenspiele",
    name: "Kartenspiele",
    icon: "🃏",
    description: "Klassische Kartenspiele für zwischendurch.",
    games: [
      {
        id: "solitaire",
        name: "Solitaire",
        icon: "🂡",
        available: false,
        url: null,
        howToPlay:
          "Du sortierst Spielkarten in absteigender Reihenfolge und abwechselnder Farbe auf mehreren Tableau-Stapeln. Ziel ist es, alle Karten nach Farbe sortiert von Ass bis König auf vier Ablage-Stapel zu legen. Der Nachziehstapel hilft dir, wenn du im Tableau nicht mehr weiterkommst.",
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
        available: false,
        url: null,
        howToPlay:
          "Zwei Spieler steuern Lichtmotorräder, die eine permanente Spur hinter sich herziehen. Fährst du gegen die Wand, deine eigene Spur oder die Spur des Gegners, verlierst du. Wer als Letzter noch fährt, gewinnt das Duell.",
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
