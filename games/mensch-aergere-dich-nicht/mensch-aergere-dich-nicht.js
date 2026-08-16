/**
 * mensch-aergere-dich-nicht.js
 *
 * Klassisches Mensch-ärgere-dich-nicht für bis zu 4 Spieler (Mensch +
 * Bots). Jeder Spieler hat 4 Figuren im Startbereich, eine gemeinsame
 * 40-Felder-Laufstrecke (10 Felder pro Spieler, eigener Startpunkt) und
 * eine private 4-Felder-Zielgerade.
 *
 * Regeln: Nur mit einer 6 darf eine Figur aus dem Start auf die
 * Laufstrecke; eine 6 gibt einen weiteren Wurf (maximal 3x in Folge -
 * die dritte 6 hintereinander verfällt, klassische Regel gegen
 * Endlosschleifen). Landet eine Figur exakt auf einem gegnerischen Feld,
 * wird diese rausgeschmissen und muss von vorne starten. Auf ein Feld
 * mit einer eigenen Figur darf nicht gezogen werden. Die Zielgerade hat
 * 4 einzelne Plätze - eine Figur ist sicher, sobald sie auf irgendeinem
 * freien Platz darin steht (nicht zwingend dem hintersten); ein Wurf, der
 * über den letzten Platz hinausschießen würde, ist für diese Figur
 * ungültig. Wer zuerst alle 4 Figuren in der Zielgerade hat, gewinnt.
 *
 * Vereinfachung gegenüber Turnierregeln: keine "Doppelblockade" (zwei
 * eigene Figuren auf einem Feld sperren es für Gegner nicht zusätzlich).
 *
 * Schwierigkeit beeinflusst nur die Bot-Strategie bei der Figurenwahl,
 * wenn mehrere Züge möglich sind (0..1 "Smartness", gleiches Muster wie
 * bei Mau Mau/Uno/Shut the Box): bevorzugt Schlagen, Start-Befreiung und
 * das Voranbringen der am weitesten fortgeschrittenen Figur.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=wuerfel-partyspiele";
  const BOT_ROLL_DELAY = 650;
  const BOT_MOVE_DELAY = 750;
  const TURN_HANDOVER_DELAY = 900;

  const HOW_TO_PLAY =
    "Bis zu vier Spieler würfeln reihum und bewegen ihre vier Spielfiguren vom Start über die gemeinsame Runde bis in ihre eigene Zielgerade. Nur mit einer 6 darf eine Figur aus dem Start auf das Feld - eine 6 gibt außerdem einen weiteren Wurf. Landest du exakt auf dem Feld einer gegnerischen Figur, wird diese rausgeworfen und muss von vorne starten; auf eine eigene Figur darfst du nicht ziehen. Für die Zielgerade brauchst du einen exakt passenden Wurf. Wer zuerst alle vier Figuren sicher im Ziel hat, gewinnt.";

  const MODES = [
    { id: "1bot", label: "1 Bot", icon: "🤖", description: "Du spielst gegen einen Bot." },
    { id: "2bots", label: "2 Bots", icon: "🤖", description: "Du spielst gegen zwei Bots." },
    { id: "3bots", label: "3 Bots", icon: "🤖", description: "Du spielst gegen drei Bots." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Bot-Cleverness (0..1).
  const DIFFICULTY_SETTINGS = {
    1: { smartness: 0 },
    2: { smartness: 0.25 },
    3: { smartness: 0.5 },
    4: { smartness: 0.75 },
    5: { smartness: 1 },
  };

  const RING_SIZE = 40;
  const CELLS_PER_PLAYER = 10;
  const HOME_LEN = 4;
  const PIECES = 4;

  // Reihenfolge = Reihenfolge der Startecken auf dem Brett im Uhrzeigersinn
  // (oben-rechts, unten-rechts, unten-links, oben-links), wie beim
  // klassischen Brett. Startspieler (Mensch) ist immer Grün.
  const PLAYER_DEFS = [
    { color: "green", label: "Grün" },
    { color: "red", label: "Rot" },
    { color: "black", label: "Schwarz" },
    { color: "yellow", label: "Gelb" },
  ];

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const statusEl = document.getElementById("mad-status");
  const scoreboardEl = document.getElementById("mad-scoreboard");
  const boardEl = document.getElementById("mad-board");
  const rollBtn = document.getElementById("mad-roll");

  let state = null;
  let lastSelection = null;
  let botTimeout = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  // ---- Spielregeln ----

  function createPlayers(count) {
    return PLAYER_DEFS.slice(0, count).map((def, i) => ({
      ...def,
      index: i,
      entry: i * CELLS_PER_PLAYER,
      isHuman: i === 0,
      pieces: Array.from({ length: PIECES }, () => ({ steps: -1 })), // -1 = im Start, 0..39 = Laufstrecke, 40..43 = Zielgerade
      finished: false,
    }));
  }

  function globalCell(player, steps) {
    return (player.entry + steps) % RING_SIZE;
  }

  function piecesOnGlobalCell(state, cell, excludePlayerIdx, excludePieceIdx) {
    const hits = [];
    state.players.forEach((p, pi) => {
      p.pieces.forEach((piece, ci) => {
        if (pi === excludePlayerIdx && ci === excludePieceIdx) return;
        if (piece.steps >= 0 && piece.steps <= 39 && globalCell(p, piece.steps) === cell) {
          hits.push({ playerIndex: pi, pieceIndex: ci });
        }
      });
    });
    return hits;
  }

  /** Liefert die Liste gültiger Züge {pieceIndex, newSteps, capture} für player bei Wurf r. */
  function getValidMoves(state, player, r) {
    const moves = [];
    player.pieces.forEach((piece, pieceIndex) => {
      if (piece.steps === -1) {
        if (r !== 6) return;
        const entryCell = globalCell(player, 0);
        const ownBlock = piecesOnGlobalCell(state, entryCell, player.index, pieceIndex).some(
          (h) => h.playerIndex === player.index
        );
        if (ownBlock) return;
        const opponent = piecesOnGlobalCell(state, entryCell, player.index, pieceIndex).find(
          (h) => h.playerIndex !== player.index
        );
        moves.push({ pieceIndex, newSteps: 0, capture: opponent || null, fromStart: true });
        return;
      }
      if (piece.steps >= 40) return; // schon sicher in der Zielgerade angekommen

      const newSteps = piece.steps + r;
      if (newSteps > 43) return; // Zielgerade würde überschritten

      if (newSteps <= 39) {
        const cell = globalCell(player, newSteps);
        const hits = piecesOnGlobalCell(state, cell, player.index, pieceIndex);
        if (hits.some((h) => h.playerIndex === player.index)) return; // eigene Figur blockiert
        const capture = hits.find((h) => h.playerIndex !== player.index) || null;
        moves.push({ pieceIndex, newSteps, capture, fromStart: false });
      } else {
        // Zielgerade (40..43): private Bahn, nur eigene Blockade möglich
        const ownInHome = player.pieces.some((other, oi) => oi !== pieceIndex && other.steps === newSteps);
        if (ownInHome) return;
        moves.push({ pieceIndex, newSteps, capture: null, fromStart: false });
      }
    });
    return moves;
  }

  function applyMove(state, player, move) {
    if (move.capture) {
      const opponent = state.players[move.capture.playerIndex];
      opponent.pieces[move.capture.pieceIndex].steps = -1;
    }
    player.pieces[move.pieceIndex].steps = move.newSteps;
    if (player.pieces.every((p) => p.steps >= 40)) {
      player.finished = true;
    }
  }

  // ---- Bot-KI ----

  function scoreMove(move) {
    let score = move.newSteps * 0.6;
    if (move.capture) score += 45;
    if (move.fromStart) score += 18;
    if (move.newSteps >= 40) score += 12;
    return score + Math.random() * 3;
  }

  function chooseBotMove(moves, smartness) {
    if (Math.random() > smartness) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
      const score = scoreMove(move);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  // ---- Rundensteuerung ----

  function currentPlayer() {
    return state.players[state.currentPlayerIndex];
  }

  function rollDie() {
    return 1 + Math.floor(Math.random() * 6);
  }

  function advanceToNextPlayer() {
    state.consecutiveSixes = 0;
    let nextIndex = state.currentPlayerIndex;
    for (let i = 0; i < state.players.length; i++) {
      nextIndex = (nextIndex + 1) % state.players.length;
      if (!state.players[nextIndex].finished) break;
    }
    state.currentPlayerIndex = nextIndex;
    state.pendingMoves = null;
    state.lastRoll = null;
    render();
    scheduleTurn();
  }

  function scheduleTurn() {
    if (checkGameEnd()) return;
    if (!currentPlayer().isHuman) {
      botTimeout = setTimeout(botRoll, BOT_ROLL_DELAY);
    }
  }

  function checkGameEnd() {
    const remaining = state.players.filter((p) => !p.finished);
    if (remaining.length <= 1) {
      endGame();
      return true;
    }
    return false;
  }

  function handleRoll() {
    if (!state || state.finished) return;
    const player = currentPlayer();
    if (!player.isHuman || state.pendingMoves) return;
    doRoll();
  }

  function doRoll() {
    const player = currentPlayer();
    const r = rollDie();
    state.lastRoll = r;

    if (r === 6) {
      state.consecutiveSixes++;
      if (state.consecutiveSixes >= 3) {
        state.pendingMoves = null;
        render();
        botTimeout = setTimeout(advanceToNextPlayer, TURN_HANDOVER_DELAY);
        return;
      }
    } else {
      state.consecutiveSixes = 0;
    }

    const moves = getValidMoves(state, player, r);
    if (moves.length === 0) {
      state.pendingMoves = null;
      render();
      if (r === 6) {
        botTimeout = setTimeout(doRoll, TURN_HANDOVER_DELAY);
      } else {
        botTimeout = setTimeout(advanceToNextPlayer, TURN_HANDOVER_DELAY);
      }
      return;
    }

    if (moves.length === 1) {
      state.pendingMoves = null;
      render();
      botTimeout = setTimeout(() => resolveMove(moves[0]), player.isHuman ? 350 : BOT_MOVE_DELAY);
      return;
    }

    if (player.isHuman) {
      state.pendingMoves = moves;
      render();
    } else {
      const move = chooseBotMove(moves, state.settings.smartness);
      state.pendingMoves = null;
      render();
      botTimeout = setTimeout(() => resolveMove(move), BOT_MOVE_DELAY);
    }
  }

  function resolveMove(move) {
    const player = currentPlayer();
    applyMove(state, player, move);
    state.pendingMoves = null;
    render();

    if (player.finished || checkGameEnd()) return;

    if (state.lastRoll === 6) {
      state.lastRoll = null;
      botTimeout = setTimeout(() => {
        if (currentPlayer().isHuman) render();
        else doRoll();
      }, TURN_HANDOVER_DELAY / 2);
    } else {
      botTimeout = setTimeout(advanceToNextPlayer, TURN_HANDOVER_DELAY);
    }
  }

  function handlePieceClick(pieceIndex) {
    if (!state || state.finished || !state.pendingMoves) return;
    const player = currentPlayer();
    if (!player.isHuman) return;
    const move = state.pendingMoves.find((m) => m.pieceIndex === pieceIndex);
    if (!move) return;
    resolveMove(move);
  }

  function botRoll() {
    if (!state || state.finished) return;
    doRoll();
  }

  // ---- Rendering ----
  //
  // Das Brett wird als klassisches Kreuz auf einem 13x13-Raster nachgebaut
  // (4 Eckboxen à 5x5 Felder, dazwischen 3 Felder breite Arme). Die
  // Koordinaten unten wurden anhand dieses Rasters von Hand abgeleitet:
  // RING_CELLS ist die 40 Felder lange gemeinsame Laufstrecke (im
  // Uhrzeigersinn, Start = Feld 0 direkt neben der grünen Startecke),
  // HOME_LANE_CELLS je Farbe die 4 Zielfelder von außen nach innen,
  // START_SLOT_CELLS die 4 Stellplätze in der jeweiligen Startecke.
  // Die Spiellogik (getValidMoves/applyMove/globalCell) kennt diese
  // Koordinaten nicht - sie rechnet nur mit abstrakten Schritten - daher
  // betrifft dieses Layout ausschließlich die Darstellung.

  const GRID_N = 13;

  const RING_CELLS = [
    [0, 7], [1, 7], [2, 7], [3, 7], [4, 7],
    [5, 8], [5, 9], [5, 10], [5, 11], [5, 12],
    [7, 12], [7, 11], [7, 10], [7, 9], [7, 8],
    [8, 7], [9, 7], [10, 7], [11, 7], [12, 7],
    [12, 5], [11, 5], [10, 5], [9, 5], [8, 5],
    [7, 4], [7, 3], [7, 2], [7, 1], [7, 0],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4],
    [4, 5], [3, 5], [2, 5], [1, 5], [0, 5],
  ];

  // Dekorative Felder an den 4 Armspitzen (verbinden die beiden Ringspuren
  // optisch, sind aber kein Teil der 40 begehbaren Felder).
  const CAP_CELLS = [[0, 6], [6, 12], [12, 6], [6, 0]];

  const HOME_LANE_CELLS = {
    green: [[1, 6], [2, 6], [3, 6], [4, 6]],
    red: [[6, 11], [6, 10], [6, 9], [6, 8]],
    black: [[11, 6], [10, 6], [9, 6], [8, 6]],
    yellow: [[6, 1], [6, 2], [6, 3], [6, 4]],
  };

  const START_SLOT_CELLS = {
    green: [[1, 9], [1, 11], [3, 9], [3, 11]],
    red: [[9, 9], [9, 11], [11, 9], [11, 11]],
    black: [[9, 1], [9, 3], [11, 1], [11, 3]],
    yellow: [[1, 1], [1, 3], [3, 1], [3, 3]],
  };

  const CORNER_BOX_CELLS = {
    green: { row: 0, col: 8 },
    red: { row: 8, col: 8 },
    black: { row: 8, col: 0 },
    yellow: { row: 0, col: 0 },
  };

  function gridPos(row, col) {
    return {
      left: ((col + 0.5) / GRID_N) * 100,
      top: ((row + 0.5) / GRID_N) * 100,
    };
  }

  function el(tag, className) {
    const node = document.createElement("div");
    node.className = className || "";
    return node;
  }

  function buildBoardStructure() {
    boardEl.innerHTML = "";

    // Farbige Eckboxen (Startbereiche) im Hintergrund
    state.players.forEach((player) => {
      const box = CORNER_BOX_CELLS[player.color];
      const boxEl = el("div", "mad-corner-box mad-color--" + player.color);
      boxEl.style.left = (box.col / GRID_N) * 100 + "%";
      boxEl.style.top = (box.row / GRID_N) * 100 + "%";
      boxEl.style.width = (5 / GRID_N) * 100 + "%";
      boxEl.style.height = (5 / GRID_N) * 100 + "%";
      boardEl.appendChild(boxEl);
    });

    // Ringfelder (gemeinsame Laufstrecke)
    RING_CELLS.forEach(([row, col], i) => {
      const { left, top } = gridPos(row, col);
      const cell = el("div", "mad-cell");
      cell.style.left = left + "%";
      cell.style.top = top + "%";
      cell.dataset.ring = String(i);
      boardEl.appendChild(cell);
    });

    // Dekorative Kappen an den Armspitzen
    CAP_CELLS.forEach(([row, col]) => {
      const { left, top } = gridPos(row, col);
      const cell = el("div", "mad-cell");
      cell.style.left = left + "%";
      cell.style.top = top + "%";
      boardEl.appendChild(cell);
    });

    // Zielgeraden + Startplätze pro Spieler
    state.players.forEach((player) => {
      HOME_LANE_CELLS[player.color].forEach(([row, col]) => {
        const { left, top } = gridPos(row, col);
        const cell = el("div", "mad-cell mad-cell--home mad-color--" + player.color);
        cell.style.left = left + "%";
        cell.style.top = top + "%";
        boardEl.appendChild(cell);
      });

      START_SLOT_CELLS[player.color].forEach(([row, col]) => {
        const { left, top } = gridPos(row, col);
        const slot = el("div", "mad-start-slot mad-color--" + player.color);
        slot.style.left = left + "%";
        slot.style.top = top + "%";
        boardEl.appendChild(slot);
      });
    });

    const center = el("div", "mad-center");
    center.textContent = "🏁";
    boardEl.appendChild(center);
  }

  function piecePosition(player, steps) {
    if (steps === -1) return null; // wird separat über Startplätze gerendert
    if (steps <= 39) {
      const [row, col] = RING_CELLS[globalCell(player, steps)];
      return gridPos(row, col);
    }
    const [row, col] = HOME_LANE_CELLS[player.color][steps - 40];
    return gridPos(row, col);
  }

  function render() {
    if (!boardEl.dataset.built) {
      buildBoardStructure();
      boardEl.dataset.built = "1";
    }

    // vorhandene Figuren entfernen und neu zeichnen
    boardEl.querySelectorAll(".mad-piece").forEach((p) => p.remove());

    const player = currentPlayer();
    const movablePieceIndices = new Set((state.pendingMoves || []).map((m) => m.pieceIndex));

    state.players.forEach((p) => {
      let startSlotUsed = 0;

      p.pieces.forEach((piece, pieceIndex) => {
        const isMovable = p.index === state.currentPlayerIndex && p.isHuman && movablePieceIndices.has(pieceIndex);
        const pieceEl = el("div", "mad-piece mad-color--" + p.color + (isMovable ? " is-movable" : ""));

        let pos;
        if (piece.steps === -1) {
          const [row, col] = START_SLOT_CELLS[p.color][startSlotUsed++];
          pos = gridPos(row, col);
        } else {
          pos = piecePosition(p, piece.steps);
        }
        pieceEl.style.left = pos.left + "%";
        pieceEl.style.top = pos.top + "%";
        if (isMovable) pieceEl.addEventListener("click", () => handlePieceClick(pieceIndex));
        boardEl.appendChild(pieceEl);
      });
    });

    // Punktestand / aktiver Spieler
    scoreboardEl.innerHTML = "";
    state.players.forEach((p) => {
      const pill = el("div", "mad-player-pill" + (p.index === state.currentPlayerIndex && !state.finished ? " is-active" : ""));
      if (p.index === state.currentPlayerIndex && !state.finished) {
        pill.style.background = colorHex(p.color);
        pill.style.borderColor = colorHex(p.color);
      }
      const dot = el("div", "mad-player-dot mad-color--" + p.color);
      const homeCount = p.pieces.filter((pc) => pc.steps >= 40).length;
      const label = document.createElement("span");
      label.textContent = `${p.isHuman ? "Du" : p.label} (${homeCount}/4 im Ziel)`;
      pill.append(dot, label);
      scoreboardEl.appendChild(pill);
    });

    // Buttons + Status
    rollBtn.hidden = !(player.isHuman && !state.pendingMoves && !state.finished);

    if (state.finished) {
      // Ergebnis-Bildschirm übernimmt
    } else if (state.pendingMoves) {
      statusEl.textContent = player.isHuman ? "Wähle eine Figur zum Ziehen." : `${player.label} überlegt ...`;
    } else if (!player.isHuman) {
      statusEl.textContent = `${player.label} ist am Zug ...`;
    } else {
      statusEl.textContent = "Du bist am Zug - würfle!";
    }
  }

  function colorHex(color) {
    return { green: "#16a34a", red: "#dc2626", black: "#1f2937", yellow: "#eab308" }[color];
  }

  function endGame() {
    state.finished = true;
    const winner = state.players.find((p) => p.finished);
    const title = winner ? (winner.isHuman ? "🏆 Du gewinnst!" : `🏆 ${winner.label} gewinnt!`) : "🤝 Unentschieden!";
    const message = state.players
      .map((p) => `${p.isHuman ? "Du" : p.label}: ${p.pieces.filter((pc) => pc.steps >= 40).length}/4 im Ziel`)
      .join(" · ");

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
    render();
  }

  function startGame(selection) {
    lastSelection = selection;
    clearTimeout(botTimeout);

    const botCount = { "1bot": 1, "2bots": 2, "3bots": 3 }[selection.mode.id];
    boardEl.dataset.built = "";

    state = {
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      players: createPlayers(botCount + 1),
      currentPlayerIndex: 0,
      pendingMoves: null,
      lastRoll: null,
      consecutiveSixes: 0,
      finished: false,
    };

    showScreen(playScreen);
    render();
    scheduleTurn();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Mensch-ärgere-dich-nicht",
      icon: "🟢🔴⚫🟡",
      intro: "Wähle Schwierigkeit und Anzahl der Bots, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "1bot",
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zu Würfel- & Partyspiele",
      onStart: startGame,
    });
  }

  rollBtn.addEventListener("click", handleRoll);

  showScreen(setupScreen);
  initSetup();
})();
