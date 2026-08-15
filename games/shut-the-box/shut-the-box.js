/**
 * shut-the-box.js
 *
 * Shut the Box mit den Klappen 1-9. Jeder Spieler bekommt der Reihe nach
 * eine eigene, frische Runde: würfeln (2 Würfel, sobald 7/8/9 geschlossen
 * sind nur noch 1 Würfel), eine Kombination offener Klappen auswählen,
 * deren Summe genau der Augenzahl entspricht, und schließen. Gibt es keine
 * passende Kombination mehr, endet die Runde - die Summe der noch offenen
 * Klappen zählt als Punktzahl (0 = "Shut the Box", perfekt). Nach beiden
 * Runden gewinnt, wer die niedrigere Summe hat.
 *
 * Schwierigkeit beeinflusst nur die Cleverness des Bots beim Wählen einer
 * Kombination (bevorzugt wenige, hochwertige Klappen zu schließen, um sich
 * mehr Flexibilität für spätere Würfe zu bewahren) - analog zur
 * Bot-"Smartness" bei Mau Mau/Uno.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=wuerfel-partyspiele";
  const BOT_ROLL_DELAY = 700;
  const BOT_CLOSE_DELAY = 900;
  const TURN_HANDOVER_DELAY = 1400;

  const HOW_TO_PLAY =
    "Auf einem Feld liegen Zahlenklappen von 1 bis 9. Du würfelst und schließt eine Kombination offener Klappen, deren Summe der Würfelzahl entspricht - solange die Klappen 7, 8 und 9 noch offen sind, wird mit 2 Würfeln gewürfelt, danach nur noch mit einem. Kannst du keine passende Kombination mehr bilden, endet deine Runde und die Summe deiner noch offenen Klappen zählt als Punktzahl. Danach ist der nächste Spieler dran. Wer am Ende die niedrigere Summe hat, gewinnt - 0 (alle Klappen geschlossen) ist das perfekte Ergebnis.";

  const MODES = [
    { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Beide Seiten spielen abwechselnd ihre eigene Runde." },
    { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Der Bot spielt seine Runde automatisch." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Bot-Cleverness (0..1).
  const DIFFICULTY_SETTINGS = {
    1: { smartness: 0 },
    2: { smartness: 0.25 },
    3: { smartness: 0.5 },
    4: { smartness: 0.75 },
    5: { smartness: 1 },
  };

  const DIE_PIPS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const statusEl = document.getElementById("stb-status");
  const scoreboardEl = document.getElementById("stb-scoreboard");
  const flapsEl = document.getElementById("stb-flaps");
  const diceEl = document.getElementById("stb-dice");
  const targetEl = document.getElementById("stb-target");
  const rollBtn = document.getElementById("stb-roll");
  const confirmBtn = document.getElementById("stb-confirm");
  const resetBtn = document.getElementById("stb-reset-selection");

  let state = null;
  let lastSelection = null;
  let botTimeout = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function rollDie() {
    return 1 + Math.floor(Math.random() * 6);
  }

  function diceCountFor(open) {
    return open.has(7) || open.has(8) || open.has(9) ? 2 : 1;
  }

  /** Alle Teilmengen von open, deren Summe genau target ergibt. */
  function findCombinations(open, target) {
    const flaps = Array.from(open).sort((a, b) => a - b);
    const results = [];
    function rec(index, remaining, chosen) {
      if (remaining === 0) {
        results.push(chosen.slice());
        return;
      }
      if (remaining < 0 || index >= flaps.length) return;
      rec(index + 1, remaining, chosen);
      chosen.push(flaps[index]);
      rec(index + 1, remaining - flaps[index], chosen);
      chosen.pop();
    }
    rec(0, target, []);
    return results;
  }

  function scoreCombo(combo) {
    const highBonus = combo.filter((v) => v >= 7).length * 3;
    return -combo.length * 10 + highBonus + Math.random() * 2;
  }

  function chooseBotCombo(combos, smartness) {
    if (Math.random() > smartness) {
      return combos[Math.floor(Math.random() * combos.length)];
    }
    let best = combos[0];
    let bestScore = -Infinity;
    for (const combo of combos) {
      const score = scoreCombo(combo);
      if (score > bestScore) {
        bestScore = score;
        best = combo;
      }
    }
    return best;
  }

  // ---- Rundensteuerung ----

  function createPlayers(mode) {
    if (mode === "bot") {
      return [
        { name: "Du", isHuman: true, open: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), score: null, done: false },
        { name: "Bot", isHuman: false, open: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), score: null, done: false },
      ];
    }
    return [
      { name: "Spieler 1", isHuman: true, open: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), score: null, done: false },
      { name: "Spieler 2", isHuman: true, open: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), score: null, done: false },
    ];
  }

  function currentPlayer() {
    return state.players[state.currentPlayerIndex];
  }

  function startPlayerTurn() {
    state.dice = [];
    state.target = null;
    state.selected = new Set();
    state.phase = "idle";
    render();

    if (!currentPlayer().isHuman) {
      botTimeout = setTimeout(botTakeTurn, BOT_ROLL_DELAY);
    }
  }

  function finishPlayerTurn() {
    const player = currentPlayer();
    player.score = Array.from(player.open).reduce((a, b) => a + b, 0);
    player.done = true;
    render();

    const nextIndex = state.currentPlayerIndex + 1;
    if (nextIndex >= state.players.length) {
      botTimeout = setTimeout(endGame, TURN_HANDOVER_DELAY);
    } else {
      state.currentPlayerIndex = nextIndex;
      botTimeout = setTimeout(startPlayerTurn, TURN_HANDOVER_DELAY);
    }
  }

  function performRoll() {
    const player = currentPlayer();
    const count = diceCountFor(player.open);
    state.dice = Array.from({ length: count }, () => rollDie());
    state.target = state.dice.reduce((a, b) => a + b, 0);
    state.selected = new Set();

    const combos = findCombinations(player.open, state.target);
    if (combos.length === 0) {
      state.phase = "busted";
      render();
      botTimeout = setTimeout(finishPlayerTurn, player.isHuman ? 1200 : BOT_CLOSE_DELAY);
      return;
    }

    state.phase = "selecting";
    render();
    return combos;
  }

  function closeSelectedFlaps() {
    const player = currentPlayer();
    state.selected.forEach((v) => player.open.delete(v));
    state.selected = new Set();
    state.dice = [];
    state.target = null;

    if (player.open.size === 0) {
      player.score = 0;
      player.done = true;
      render();
      const nextIndex = state.currentPlayerIndex + 1;
      if (nextIndex >= state.players.length) {
        botTimeout = setTimeout(endGame, TURN_HANDOVER_DELAY);
      } else {
        state.currentPlayerIndex = nextIndex;
        botTimeout = setTimeout(startPlayerTurn, TURN_HANDOVER_DELAY);
      }
      return;
    }

    state.phase = "idle";
    render();
    if (!player.isHuman) {
      botTimeout = setTimeout(botTakeTurn, BOT_ROLL_DELAY);
    }
  }

  function botTakeTurn() {
    const combos = performRoll();
    if (!combos) return; // gebustet, performRoll hat schon den Rundenwechsel eingeleitet
    const player = currentPlayer();
    const combo = chooseBotCombo(combos, state.settings.smartness);
    state.selected = new Set(combo);
    render();
    botTimeout = setTimeout(closeSelectedFlaps, BOT_CLOSE_DELAY);
  }

  // ---- Mensch-Interaktion ----

  function handleRollClick() {
    if (!state || state.finished) return;
    const player = currentPlayer();
    if (!player.isHuman || state.phase !== "idle") return;
    performRoll();
  }

  function handleFlapClick(value) {
    if (!state || state.finished) return;
    const player = currentPlayer();
    if (!player.isHuman || state.phase !== "selecting") return;
    if (!player.open.has(value)) return;

    if (state.selected.has(value)) {
      state.selected.delete(value);
    } else {
      state.selected.add(value);
    }
    render();
  }

  function selectedSum() {
    return Array.from(state.selected).reduce((a, b) => a + b, 0);
  }

  function handleConfirmClick() {
    if (!state || state.finished || state.phase !== "selecting") return;
    if (selectedSum() !== state.target) return;
    closeSelectedFlaps();
  }

  function handleResetSelection() {
    if (!state || state.phase !== "selecting") return;
    state.selected = new Set();
    render();
  }

  // ---- Rendering ----

  function renderDie(value) {
    const die = document.createElement("div");
    die.className = "stb-die";
    for (let i = 1; i <= 9; i++) {
      const cell = document.createElement("span");
      if (DIE_PIPS[value].includes(i)) cell.className = "stb-die__pip";
      die.appendChild(cell);
    }
    return die;
  }

  function render() {
    const player = currentPlayer();
    const isHumanTurn = player.isHuman && !state.finished;

    // Punktestand
    scoreboardEl.innerHTML = "";
    state.players.forEach((p, i) => {
      const pill = document.createElement("div");
      pill.className = "stb-score" + (i === state.currentPlayerIndex && !state.finished ? " is-active" : "");
      const label = p.done ? `${p.name}: ${p.score}` : `${p.name}: ${Array.from(p.open).reduce((a, b) => a + b, 0)}`;
      pill.textContent = label;
      scoreboardEl.appendChild(pill);
    });

    // Klappen
    flapsEl.innerHTML = "";
    for (let v = 1; v <= 9; v++) {
      const flap = document.createElement("button");
      flap.type = "button";
      const isOpen = player.open.has(v);
      const isSelected = state.selected.has(v);
      const isSelectable = isHumanTurn && state.phase === "selecting" && isOpen;
      flap.className =
        "stb-flap" + (isOpen ? "" : " is-closed") + (isSelectable ? " is-selectable" : "") + (isSelected ? " is-selected" : "");
      flap.textContent = String(v);
      flap.disabled = !isSelectable;
      if (isSelectable) flap.addEventListener("click", () => handleFlapClick(v));
      flapsEl.appendChild(flap);
    }

    // Würfel
    diceEl.innerHTML = "";
    state.dice.forEach((d) => diceEl.appendChild(renderDie(d)));

    if (state.phase === "selecting") {
      targetEl.textContent = `Ziel: ${state.target}   ·   Ausgewählt: ${selectedSum()}`;
    } else if (state.phase === "busted") {
      targetEl.textContent = `Gewürfelt: ${state.target} - keine passende Kombination mehr möglich.`;
    } else {
      targetEl.textContent = "";
    }

    // Buttons
    rollBtn.hidden = !(isHumanTurn && state.phase === "idle");
    confirmBtn.hidden = !(isHumanTurn && state.phase === "selecting");
    confirmBtn.disabled = selectedSum() !== state.target;
    resetBtn.hidden = !(isHumanTurn && state.phase === "selecting" && state.selected.size > 0);

    // Status
    if (state.finished) {
      // Ergebnis-Bildschirm übernimmt
    } else if (state.phase === "busted") {
      statusEl.textContent = `${player.name}: kein passender Zug mehr - Runde beendet.`;
    } else if (!player.isHuman) {
      statusEl.textContent = `${player.name} ist am Zug ...`;
    } else if (state.phase === "selecting") {
      statusEl.textContent = `${player.name}, wähle Klappen mit Summe ${state.target}.`;
    } else {
      statusEl.textContent = `${player.name} ist am Zug - würfle!`;
    }
  }

  function endGame() {
    state.finished = true;
    const [a, b] = state.players;
    let title;
    let message;
    if (a.score === b.score) {
      title = "🤝 Unentschieden!";
    } else {
      const winner = a.score < b.score ? a : b;
      if (state.mode === "bot") {
        title = winner.isHuman ? "🏆 Du gewinnst!" : "🏆 Der Bot gewinnt!";
      } else {
        title = `🏆 ${winner.name} gewinnt!`;
      }
    }
    message = state.players.map((p) => `${p.name}: ${p.score}`).join(" · ");

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function startGame(selection) {
    lastSelection = selection;
    clearTimeout(botTimeout);

    state = {
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      mode: selection.mode.id,
      players: createPlayers(selection.mode.id),
      currentPlayerIndex: 0,
      dice: [],
      target: null,
      selected: new Set(),
      phase: "idle",
      finished: false,
    };

    showScreen(playScreen);
    startPlayerTurn();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Shut the Box",
      icon: "📦",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "bot",
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zu Würfel- & Partyspiele",
      onStart: startGame,
    });
  }

  rollBtn.addEventListener("click", handleRollClick);
  confirmBtn.addEventListener("click", handleConfirmClick);
  resetBtn.addEventListener("click", handleResetSelection);

  showScreen(setupScreen);
  initSetup();
})();
