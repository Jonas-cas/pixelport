# PixelPort – Konventionen

Kurze Hinweise für künftige Änderungen an diesem Repo.

## Spielelemente immer originalgetreu, Drumherum darf bunt sein

Bei jedem Spiel gilt eine klare Trennung:

- **Die eigentlichen Spielelemente** (Brett, Karten, Spielsteine, Figuren)
  sehen aus wie beim echten Vorbild - feste Farben, keine
  Design-Theme-Akzentfarbe (`var(--accent)` / `var(--accent-2)`).
  Beispiele: Schachbrett Beige/Braun, Schachfiguren Elfenbein/Ebenholz,
  Dame-Brett wie Schach, Vier-Gewinnt-Rahmen Blau mit roten/gelben
  Scheiben, Uno-Karten in echten Rot/Gelb/Grün/Blau-Tönen, Mau-Mau-Karten
  mit echten Herz/Karo (rot) und Pik/Kreuz (schwarz) Symbolen,
  Tic-Tac-Toe X/O in zwei festen, klar unterscheidbaren Farben.
- **Alles drumherum** (Hintergrund, Buttons, Status-Anzeigen, Kacheln in
  der Übersicht, Typografie) darf weiterhin die Design-Theme-Akzentfarbe
  nutzen und verspielt/bunt im "2 Player Games"-Stil gestaltet sein -
  ebenso reine UI-Interaktions-Overlays wie Auswahl-Ring oder
  Zielfeld-Markierung auf einem Brett (das ist Bedienungs-Feedback, kein
  Teil des Bretts selbst).

**Bei jedem neuen Spiel von Anfang an mitdenken:** Sobald das Spiel
reale, wiedererkennbare Spielmaterialien hat (Kartendeck, Brett,
Spielsteine, Würfel, ...), deren Farben/Symbole fest verdrahten statt sie
an `var(--accent)` zu hängen.

## Vorbildschirm/Ergebnis-Bildschirm sind bei JEDEM Spiel bunt

`js/game-screens.js` + `css/game-screens.css` rendern für JEDES Spiel
(egal ob dunkles Arcade-Spiel oder helles Brett-/Kartenspiel) denselben
"2 Player Games"-artigen Vorbildschirm: farbiger Kopfbereich
(`.game-setup__header`, accent-gradient) mit Titel/Icon, weiße Karte
darunter (`.game-setup__card`) mit Schwierigkeit/Modus-Auswahl,
Start-Button und einem festen orangen Zurück-Button
(`.game-setup__back`, immer mit `backHref` an `renderSetup()`
übergeben). Der Ergebnis-Bildschirm (`renderResult()`) ist identisch
aufgebaut. Modus-Buttons können ein Emoji-`icon` bekommen (z.B. 🧑‍🤝‍🧑 für
"2 Spieler", 🤖 für "Gegen Bot") - dafür `variant: "mode"` bei
`renderOptionGroup` nutzen.

Das ist unabhängig von der Spielfläche selbst: `css/game-theme-light.css`
(nur von hellen Spielen eingebunden) sorgt zusätzlich dafür, dass auch
`#play-screen` (`.game-play-panel`) während des Spiels hell bleibt -
dunkle Arcade-Spiele binden diese Datei nicht ein und bleiben während
des Spiels beim CRT-Look, auch wenn ihr Vorbildschirm bunt ist.

**Bei jedem neuen Spiel:** `renderSetup()` immer mit `backHref:
CATEGORY_URL` (+ passendem `backLabel`) aufrufen, Modus-Optionen mit
`icon` versehen, wo sinnvoll.
