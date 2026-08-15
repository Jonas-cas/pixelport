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
