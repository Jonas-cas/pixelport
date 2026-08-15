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
 *   available  true, sobald das Spiel wirklich spielbar ist (aktuell überall false)
 *   url        Pfad zum Spiel (z.B. "games/snake/index.html"), sobald es existiert
 */

const GAME_CATEGORIES = [
  {
    id: "brettspiele-digital",
    name: "Brettspiele (digital)",
    icon: "🎲",
    description: "Klassische Brettspiele digital umgesetzt.",
    games: [
      { id: "schach", name: "Schach", icon: "♟️", available: false, url: null },
      { id: "muehle", name: "Mühle", icon: "⭕", available: false, url: null },
      { id: "dame", name: "Dame", icon: "⚫", available: false, url: null },
      { id: "mensch-aergere-dich-nicht", name: "Mensch ärgere Dich nicht", icon: "🔴", available: false, url: null },
    ],
  },
  {
    id: "spiele-1990",
    name: "1990er Spiele",
    icon: "👾",
    description: "Retro-Klassiker im Stil der 90er Jahre.",
    games: [
      { id: "snake", name: "Snake", icon: "🐍", available: false, url: null },
      { id: "tetris-style", name: "Tetris-Style", icon: "🧱", available: false, url: null },
      { id: "pong", name: "Pong", icon: "🏓", available: false, url: null },
      { id: "minesweeper", name: "Minesweeper", icon: "💣", available: false, url: null },
    ],
  },
  {
    id: "kartenspiele",
    name: "Kartenspiele",
    icon: "🃏",
    description: "Klassische Kartenspiele für zwischendurch.",
    games: [
      { id: "solitaire", name: "Solitaire", icon: "🂡", available: false, url: null },
      { id: "memory", name: "Memory", icon: "🧠", available: false, url: null },
    ],
  },
];

/**
 * Liefert eine Kategorie anhand ihrer ID, oder null, falls sie nicht existiert.
 */
function getCategoryById(id) {
  return GAME_CATEGORIES.find((category) => category.id === id) || null;
}
