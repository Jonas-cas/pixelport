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
 *   PixelPortGameScreens.renderHowToPlayButton(container, { gameName, text })
 *     Hängt einen "❓ Wie spiele ich das?"-Button an, der beim Klick ein
 *     Overlay mit einer kurzen Spielerklärung öffnet. Wird sowohl von
 *     js/category.js (Spiel-Kacheln) als auch optional von renderSetup()
 *     genutzt. Ohne text passiert nichts (kein Button).
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
   * einer aktiv). Ruft onChange(id) bei jeder Änderung auf. Mit
   * variant: "mode" werden große, runde Buttons mit Icon + Label gerendert
   * (für die Modus-Auswahl) statt der kompakten Text-Pills (Schwierigkeit).
   */
  function renderOptionGroup(container, { legend, options, selectedId, onChange, variant }) {
    const group = el("div", "game-option-group" + (variant ? " game-option-group--" + variant : ""));
    group.append(el("h2", "game-option-group__title", legend));

    const list = el("div", "game-option-group__options");
    const buttons = options.map((option) => {
      const btn = el("button", "option-button" + (variant === "mode" ? " option-button--mode" : ""));
      btn.type = "button";
      if (option.description) btn.title = option.description;
      btn.setAttribute("aria-pressed", String(option.id === selectedId));
      btn.classList.toggle("is-active", option.id === selectedId);

      if (variant === "mode" && option.icon) {
        btn.append(el("span", "option-button__icon", option.icon));
        btn.append(el("span", "option-button__label", option.label));
      } else {
        btn.textContent = option.label;
      }
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
   *   icon                 optionales Emoji, groß über dem Titel als Maskottchen
   *   intro                optionaler Hinweistext
   *   howToPlay            optionaler Spielerklärungs-Text (siehe renderHowToPlayButton)
   *   modes                optionales Array [{ id, label, description, icon }]
   *   defaultDifficultyId  Standard-Schwierigkeit (Default: 3 = "Mittel")
   *   defaultModeId        Standard-Modus (Default: modes[0].id)
   *   backHref             optionaler Link zurück zur Kategorie-Seite (Button unten in der Karte)
   *   backLabel            Beschriftung des Zurück-Buttons
   *   onStart({ difficulty, mode })
   *
   * Aufbau: farbiger Kopfbereich (Icon/Titel/Intro) + weiße Karte darunter
   * mit Howto-Button, Auswahl-Gruppen, Start- und Zurück-Button - siehe
   * css/game-screens.css für den "2 Player Games"-artigen Look.
   */
  function renderSetup(container, options) {
    const {
      gameName,
      icon,
      intro,
      howToPlay,
      modes,
      defaultDifficultyId = 3,
      defaultModeId,
      backHref,
      backLabel = "← Zurück zur Kategorie",
      onStart,
    } = options;

    container.innerHTML = "";
    const wrap = el("div", "game-setup");

    const header = el("div", "game-setup__header");
    if (icon) header.append(el("div", "game-setup__icon", icon));
    header.append(el("h2", "game-setup__title", `${gameName} starten`));
    if (intro) header.append(el("p", "game-setup__intro", intro));
    wrap.appendChild(header);

    const card = el("div", "game-setup__card");

    if (howToPlay) {
      const howtoWrap = el("div", "game-setup__howto");
      renderHowToPlayButton(howtoWrap, { gameName, text: howToPlay });
      card.appendChild(howtoWrap);
    }

    let selectedDifficulty = defaultDifficultyId;
    renderOptionGroup(card, {
      legend: "Schwierigkeitsgrad",
      options: DIFFICULTIES,
      selectedId: defaultDifficultyId,
      onChange: (id) => {
        selectedDifficulty = id;
      },
    });

    let selectedMode = modes && modes.length > 0 ? defaultModeId ?? modes[0].id : null;
    if (modes && modes.length > 0) {
      renderOptionGroup(card, {
        legend: "Spielmodus",
        options: modes,
        selectedId: selectedMode,
        variant: "mode",
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
    card.appendChild(startBtn);

    if (backHref) {
      const backBtn = el("a", "game-setup__back", backLabel);
      backBtn.href = backHref;
      card.appendChild(backBtn);
    }

    wrap.appendChild(card);
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

    const header = el("div", "game-result__header");
    header.append(el("h2", "game-result__title", title));
    wrap.appendChild(header);

    const card = el("div", "game-result__card");
    if (message) card.append(el("p", "game-result__message", message));

    const actions = el("div", "game-result__actions");

    const restartBtn = el("button", "game-setup__start", restartLabel);
    restartBtn.type = "button";
    restartBtn.addEventListener("click", onRestart);
    actions.appendChild(restartBtn);

    const backLink = el("a", "game-setup__back", backLabel);
    backLink.href = backHref;
    actions.appendChild(backLink);

    card.appendChild(actions);
    wrap.appendChild(card);
    container.appendChild(wrap);
  }

  // ---- "Wie spiele ich das?"-Overlay ----
  // Ein einzelnes Overlay-Element wird lazy erzeugt und für alle Aufrufe
  // wiederverwendet (mehrere Kacheln auf einer Seite brauchen keine eigenen).

  let modalEl = null;

  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = el("div", "pp-modal");
    modalEl.hidden = true;

    const box = el("div", "pp-modal__box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const closeBtn = el("button", "pp-modal__close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Schließen");
    closeBtn.addEventListener("click", hideHowToPlay);

    const titleEl = el("h2", "pp-modal__title");
    const textEl = el("p", "pp-modal__text");

    box.append(closeBtn, titleEl, textEl);
    modalEl.appendChild(box);

    // Klick auf den dunklen Hintergrund schließt das Overlay, Klick in die Box nicht.
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) hideHowToPlay();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modalEl.hidden) hideHowToPlay();
    });

    document.body.appendChild(modalEl);
    return modalEl;
  }

  function showHowToPlay(title, text) {
    const modal = ensureModal();
    modal.querySelector(".pp-modal__title").textContent = title;
    modal.querySelector(".pp-modal__text").textContent = text;
    modal.hidden = false;
  }

  function hideHowToPlay() {
    if (modalEl) modalEl.hidden = true;
  }

  /**
   * Hängt einen "❓ Wie spiele ich das?"-Button an container, der beim Klick
   * das Overlay mit text öffnet. Ohne text wird nichts gerendert - so kann
   * ein Spiel (z.B. ein "Bald verfügbar"-Platzhalter) den Button einfach
   * weglassen, indem es kein howToPlay in games-data.js einträgt.
   */
  function renderHowToPlayButton(container, { gameName, text }) {
    if (!text) return null;

    const btn = el("button", "howto-button", "❓ Wie spiele ich das?");
    btn.type = "button";
    btn.addEventListener("click", (event) => {
      // Kachel kann ein <a> sein (spielbare Spiele) - Navigation verhindern.
      event.preventDefault();
      event.stopPropagation();
      showHowToPlay(`❓ ${gameName} – Wie spiele ich das?`, text);
    });
    container.appendChild(btn);
    return btn;
  }

  window.PixelPortGameScreens = {
    DIFFICULTIES,
    renderSetup,
    renderResult,
    renderHowToPlayButton,
  };
})();
