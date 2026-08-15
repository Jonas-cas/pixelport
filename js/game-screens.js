/**
 * game-screens.js
 *
 * Wiederverwendbares Auswahl- und Ergebnis-Bildschirm-Modul für Spiele im
 * PixelPort. Jedes Spiel bindet diese Datei zusätzlich zu games-data.js ein
 * und nutzt:
 *
 *   PixelPortGameScreens.DIFFICULTIES
 *     Die 5 einheitlichen Schwierigkeitsstufen (id 1-5 + Label). Ein Spiel
 *     übersetzt die gewählte id selbst in seine eigenen Werte (z.B.
 *     Ballgeschwindigkeit bei Pong, Tickrate bei Snake, ...) - dieses Modul
 *     bleibt dadurch komplett spielunabhängig.
 *
 *   PixelPortGameScreens.renderSetup(container, options)
 *     Rendert den Vorbildschirm mit Schwierigkeits- und optionaler
 *     Modus-Auswahl (options.modes weglassen, wenn ein Spiel keine
 *     Modi braucht). Ruft options.onStart({ difficulty, mode }) auf,
 *     sobald "Spiel starten" geklickt wird.
 *
 *   PixelPortGameScreens.renderResult(container, options)
 *     Rendert den Ergebnis-Bildschirm nach Spielende mit "Neu starten"
 *     und "Zurück zur Kategorie".
 *
 * Neues Spiel anbinden: siehe games/pong/pong.js als Referenzbeispiel.
 */

(function () {
  "use strict";

  // Einheitliche Schwierigkeitsstufen für alle Spiele im Portal.
  const DIFFICULTIES = [
    { id: 1, label: "Sehr leicht" },
    { id: 2, label: "Leicht" },
    { id: 3, label: "Mittel" },
    { id: 4, label: "Schwer" },
    { id: 5, label: "Sehr schwer" },
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * Rendert eine Gruppe auswählbarer Buttons mit Radio-Verhalten (genau
   * einer aktiv). Ruft onChange(id) bei jeder Änderung auf.
   */
  function renderOptionGroup(container, { legend, options, selectedId, onChange }) {
    const group = el("div", "game-option-group");
    group.append(el("h2", "game-option-group__title", legend));

    const list = el("div", "game-option-group__options");
    const buttons = options.map((option) => {
      const btn = el("button", "option-button", option.label);
      btn.type = "button";
      if (option.description) btn.title = option.description;
      btn.setAttribute("aria-pressed", String(option.id === selectedId));
      btn.classList.toggle("is-active", option.id === selectedId);
      return btn;
    });

    options.forEach((option, index) => {
      buttons[index].addEventListener("click", () => {
        buttons.forEach((btn, i) => {
          const isActive = i === index;
          btn.classList.toggle("is-active", isActive);
          btn.setAttribute("aria-pressed", String(isActive));
        });
        onChange(option.id);
      });
      list.appendChild(buttons[index]);
    });

    group.appendChild(list);
    container.appendChild(group);
  }

  /**
   * options:
   *   gameName            Anzeigename für die Überschrift
   *   intro                optionaler Hinweistext
   *   modes                optionales Array [{ id, label, description }]
   *   defaultDifficultyId  Standard-Schwierigkeit (Default: 3 = "Mittel")
   *   defaultModeId        Standard-Modus (Default: modes[0].id)
   *   onStart({ difficulty, mode })
   */
  function renderSetup(container, options) {
    const { gameName, intro, modes, defaultDifficultyId = 3, defaultModeId, onStart } = options;

    container.innerHTML = "";
    const wrap = el("div", "game-setup");
    wrap.append(el("h2", "game-setup__title", `${gameName} starten`));
    if (intro) wrap.append(el("p", "game-setup__intro", intro));

    let selectedDifficulty = defaultDifficultyId;
    renderOptionGroup(wrap, {
      legend: "Schwierigkeitsgrad",
      options: DIFFICULTIES,
      selectedId: defaultDifficultyId,
      onChange: (id) => {
        selectedDifficulty = id;
      },
    });

    let selectedMode = modes && modes.length > 0 ? defaultModeId ?? modes[0].id : null;
    if (modes && modes.length > 0) {
      renderOptionGroup(wrap, {
        legend: "Spielmodus",
        options: modes,
        selectedId: selectedMode,
        onChange: (id) => {
          selectedMode = id;
        },
      });
    }

    const startBtn = el("button", "game-setup__start", "▶ Spiel starten");
    startBtn.type = "button";
    startBtn.addEventListener("click", () => {
      const difficulty = DIFFICULTIES.find((d) => d.id === selectedDifficulty);
      const mode = modes ? modes.find((m) => m.id === selectedMode) : null;
      onStart({ difficulty, mode });
    });
    wrap.appendChild(startBtn);

    container.appendChild(wrap);
  }

  /**
   * options:
   *   title         Überschrift, z.B. "🏆 Spieler 1 gewinnt!"
   *   message       optionaler Untertext, z.B. Endstand
   *   restartLabel  Beschriftung des Neustart-Buttons
   *   backHref      Link zurück zur Kategorie-Seite
   *   backLabel     Beschriftung des Zurück-Links
   *   onRestart()   wird beim Klick auf "Neu starten" aufgerufen
   */
  function renderResult(container, options) {
    const {
      title,
      message,
      restartLabel = "🔁 Neu starten",
      backHref,
      backLabel = "← Zurück zur Kategorie",
      onRestart,
    } = options;

    container.innerHTML = "";
    const wrap = el("div", "game-result");
    wrap.append(el("h2", "game-result__title", title));
    if (message) wrap.append(el("p", "game-result__message", message));

    const actions = el("div", "game-result__actions");

    const restartBtn = el("button", "game-setup__start", restartLabel);
    restartBtn.type = "button";
    restartBtn.addEventListener("click", onRestart);
    actions.appendChild(restartBtn);

    const backLink = el("a", "back-link game-result__back", backLabel);
    backLink.href = backHref;
    actions.appendChild(backLink);

    wrap.appendChild(actions);
    container.appendChild(wrap);
  }

  window.PixelPortGameScreens = {
    DIFFICULTIES,
    renderSetup,
    renderResult,
  };
})();
