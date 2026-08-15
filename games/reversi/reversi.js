/**
 * reversi.js
 *
 * Klassisches Reversi/Othello auf 8x8-Feld. Ein Spieler legt eine Scheibe
 * so, dass sie in mindestens einer der 8 Richtungen eine gerade Reihe
 * gegnerischer Scheiben zwischen der neuen und einer eigenen Scheibe
 * einschließt - alle eingeschlossenen Scheiben werden umgedreht. Hat ein
 * Spieler keinen gültigen Zug, setzt er automatisch aus; haben beide
 * keinen Zug mehr, endet die Partie und die meisten Scheiben gewinnen.
 *
 * KI: Negamax mit Alpha-Beta-Pruning und zeitbegrenzter iterativer
 * Tiefensuche (gleiches Muster wie Schach/Dame/Vier Gewinnt). Bewertung
 * kombiniert eine klassische Positions-Gewichtsmatrix (Ecken sehr wertvoll,
 * Felder direkt neben einer leeren Ecke riskant) mit der Mobilität
 * (Differenz der jeweils möglichen Züge).
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=brettspiele-digital";

  const HOW_TO_PLAY =
    "Zwei Spieler legen abwechselnd Steine auf ein 8x8-Feld. Schließt dein neuer Stein eine gerade Reihe gegnerischer Steine zwischen zwei eigenen Steinen ein, werden alle eingeschlossenen Steine zu deiner Farbe gedreht. Hast du keinen gültigen Zug, setzt du automatisch aus. Am Ende gewinnt, wer die meisten Steine seiner Farbe auf dem Brett hat.";

  const MODES = [
    { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Beide Seiten werden von Menschen gesteuert." },
    { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Weiß wird von einer KI gesteuert, Schwarz spielst du." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Suchtiefe + Zufallsanteil.
  const DIFFICULTY_SETTINGS = {
    1: { maxDepth: 1, timeLimit: 200, randomness: 0.55 },
    2: { maxDepth: 2, timeLimit: 300, randomness: 0.3 },
    3: { maxDepth: 3, timeLimit: 500, randomness: 0.1 },
    4: { maxDepth: 5, timeLimit: 900, randomness: 0 },
    5: { maxDepth: 7, timeLimit: 1600, randomness: 0 },
  };

  const SIZE = 8;
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];

  // Klassische Positions-Gewichtsmatrix: Ecken sehr wertvoll, Felder direkt
  // neben einer Ecke riskant (öffnen der Ecke für den Gegner).
  const WEIGHTS = [
    [100, -20, 10, 5, 5, 10, -20, 100],
    [-20, -50, -2, -2, -2, -2, -50, -20],
    [10, -2, -1, -1, -1, -1, -2, 10],
    [5, -2, -1, -1, -1, -1, -2, 5],
    [5, -2, -1, -1, -1, -1, -2, 5],
    [10, -2, -1, -1, -1, -1, -2, 10],
    [-20, -50, -2, -2, -2, -2, -50, -20],
    [100, -20, 10, 5, 5, 10, -20, 100],
  ];

  const AI_THINK_DELAY = 350;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const boardEl = document.getElementById("reversi-board");
  const statusEl = document.getElementById("reversi-status");
  const scoreEl = document.getElementById("reversi-score");

  let gameState = null;
  let lastSelection = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function opponentOf(player) {
    return player === "b" ? "w" : "b";
  }

  function createInitialBoard() {
    const board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
    board[3][3] = "w";
    board[3][4] = "b";
    board[4][3] = "b";
    board[4][4] = "w";
    return board;
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  /** Liefert alle Felder, die beim Legen auf (r,c) für player umgedreht würden (leer, falls ungültig). */
  function getFlips(board, r, c, player) {
    if (board[r][c]) return [];
    const opponent = opponentOf(player);
    const flips = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc) && board[nr][nc] === opponent) {
        line.push([nr, nc]);
        nr += dr;
        nc += dc;
      }
      if (line.length > 0 && inBounds(nr, nc) && board[nr][nc] === player) {
        flips.push(...line);
      }
    }
    return flips;
  }

  function getValidMoves(board, player) {
    const moves = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const flips = getFlips(board, r, c, player);
        if (flips.length > 0) moves.push({ r, c, flips });
      }
    }
    return moves;
  }

  function applyMove(board, move, player) {
    const next = board.map((row) => row.slice());
    next[move.r][move.c] = player;
    move.flips.forEach(([r, c]) => {
      next[r][c] = player;
    });
    return next;
  }

  function countDiscs(board) {
    let b = 0;
    let w = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] === "b") b++;
        else if (board[r][c] === "w") w++;
      }
    }
    return { b, w };
  }

  // ---- KI ----

  function evaluateBoard(board, aiPlayer, humanPlayer) {
    let positional = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = board[r][c];
        if (!v) continue;
        positional += WEIGHTS[r][c] * (v === aiPlayer ? 1 : -1);
      }
    }
    const mobility = (getValidMoves(board, aiPlayer).length - getValidMoves(board, humanPlayer).length) * 3;
    return positional + mobility;
  }

  function terminalScore(board, player, opponent) {
    const counts = countDiscs(board);
    const diff = counts[player] - counts[opponent];
    if (diff > 0) return 1000000 + diff;
    if (diff < 0) return -1000000 + diff;
    return 0;
  }

  let searchDeadline = 0;
  let nodeCount = 0;
  function SearchTimeout() {}
  SearchTimeout.prototype = Object.create(Error.prototype);

  function negamax(board, depth, alpha, beta, player, opponent, aiPlayer) {
    nodeCount++;
    if ((nodeCount & 1023) === 0 && performance.now() > searchDeadline) throw new SearchTimeout();

    const movesPlayer = getValidMoves(board, player);
    if (movesPlayer.length === 0) {
      const movesOpp = getValidMoves(board, opponent);
      if (movesOpp.length === 0) {
        const raw = terminalScore(board, player, opponent);
        return raw;
      }
      if (depth === 0) {
        const raw = evaluateBoard(board, aiPlayer, player === aiPlayer ? opponent : player);
        return player === aiPlayer ? raw : -raw;
      }
      return -negamax(board, depth - 1, -beta, -alpha, opponent, player, aiPlayer);
    }

    if (depth === 0) {
      const raw = evaluateBoard(board, aiPlayer, player === aiPlayer ? opponent : player);
      return player === aiPlayer ? raw : -raw;
    }

    let best = -Infinity;
    for (const move of movesPlayer) {
      const next = applyMove(board, move, player);
      const score = -negamax(next, depth - 1, -beta, -alpha, opponent, player, aiPlayer);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function findBestMoveWithinTime(board, aiPlayer, humanPlayer, maxDepth, timeLimitMs) {
    const validMoves = getValidMoves(board, aiPlayer);
    if (validMoves.length === 0) return null;

    searchDeadline = performance.now() + timeLimitMs;
    nodeCount = 0;

    let best = validMoves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        let depthBest = validMoves[0];
        let depthBestScore = -Infinity;
        for (const move of validMoves) {
          const next = applyMove(board, move, aiPlayer);
          const score = -negamax(next, depth - 1, -Infinity, Infinity, humanPlayer, aiPlayer, aiPlayer);
          if (score > depthBestScore) {
            depthBestScore = score;
            depthBest = move;
          }
        }
        best = depthBest;
      } catch (err) {
        if (err instanceof SearchTimeout) break;
        throw err;
      }
      if (performance.now() > searchDeadline) break;
    }
    return best;
  }

  function chooseAiMove(board, aiPlayer, humanPlayer, settings) {
    const validMoves = getValidMoves(board, aiPlayer);
    if (validMoves.length === 0) return null;
    if (Math.random() < settings.randomness) {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
    const move = findBestMoveWithinTime(board, aiPlayer, humanPlayer, settings.maxDepth, settings.timeLimit);
    return move || validMoves[0];
  }

  // ---- Spielsteuerung ----

  function playerLabel(player, mode) {
    if (mode === "bot") return player === "b" ? "Du" : "Der Bot";
    return player === "b" ? "Spieler 1" : "Spieler 2";
  }

  function nextTurn(state) {
    const mover = state.turn;
    const opponent = opponentOf(mover);
    state.skipMessage = null;
    if (getValidMoves(state.board, opponent).length > 0) {
      state.turn = opponent;
    } else if (getValidMoves(state.board, mover).length > 0) {
      state.turn = mover;
      state.skipMessage = `${playerLabel(opponent, state.mode)} setzt aus (kein Zug möglich).`;
    } else {
      state.finished = true;
    }
  }

  function playMove(move) {
    const state = gameState;
    state.board = applyMove(state.board, move, state.turn);
    nextTurn(state);

    if (state.finished) {
      render();
      endGame();
      return;
    }

    render();

    if (state.mode === "bot" && state.turn === "w") {
      state.aiThinking = true;
      render();
      setTimeout(runAiMove, AI_THINK_DELAY);
    }
  }

  function handleSquareClick(r, c) {
    const state = gameState;
    if (!state || state.finished || state.aiThinking) return;
    if (state.mode === "bot" && state.turn === "w") return;
    const flips = getFlips(state.board, r, c, state.turn);
    if (flips.length === 0) return;
    playMove({ r, c, flips });
  }

  function runAiMove() {
    const state = gameState;
    if (!state || state.finished) return;
    const move = chooseAiMove(state.board, "w", "b", state.settings);
    state.aiThinking = false;
    if (!move) {
      render();
      return;
    }
    playMove(move);
  }

  function updateStatus() {
    const state = gameState;
    if (state.finished) return;
    if (state.aiThinking) {
      statusEl.textContent = "🤔 Der Bot denkt nach ...";
      return;
    }
    if (state.skipMessage) {
      statusEl.textContent = state.skipMessage;
      return;
    }
    statusEl.textContent = `${playerLabel(state.turn, state.mode)} ist am Zug (${state.turn === "b" ? "Schwarz" : "Weiß"})`;
  }

  function render() {
    const state = gameState;
    updateStatus();

    const counts = countDiscs(state.board);
    scoreEl.textContent = `Schwarz: ${counts.b}   ·   Weiß: ${counts.w}`;

    const clickable =
      !state.finished && !state.aiThinking && !(state.mode === "bot" && state.turn === "w");
    const validMoves = clickable ? getValidMoves(state.board, state.turn) : [];
    const validSet = new Set(validMoves.map((m) => `${m.r},${m.c}`));

    boardEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const square = document.createElement("div");
        const isTarget = validSet.has(`${r},${c}`);
        square.className = "reversi-square" + (isTarget ? " is-clickable is-target" : "");
        if (isTarget) square.addEventListener("click", () => handleSquareClick(r, c));

        const value = state.board[r][c];
        if (value) {
          const disc = document.createElement("div");
          disc.className = "reversi-disc reversi-disc--" + value;
          square.appendChild(disc);
        }
        boardEl.appendChild(square);
      }
    }
  }

  function endGame() {
    const state = gameState;
    const counts = countDiscs(state.board);
    let title;
    let winner = null;
    if (counts.b > counts.w) winner = "b";
    else if (counts.w > counts.b) winner = "w";

    if (!winner) {
      title = "🤝 Unentschieden!";
    } else if (state.mode === "bot") {
      title = winner === "b" ? "🏆 Du gewinnst!" : "🏆 Der Bot gewinnt!";
    } else {
      title = winner === "b" ? "🏆 Spieler 1 gewinnt!" : "🏆 Spieler 2 gewinnt!";
    }

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message: `Endstand – Schwarz: ${counts.b} · Weiß: ${counts.w}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function startGame(selection) {
    lastSelection = selection;
    gameState = {
      board: createInitialBoard(),
      turn: "b",
      mode: selection.mode.id,
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      finished: false,
      aiThinking: false,
      skipMessage: null,
    };
    showScreen(playScreen);
    render();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Reversi",
      icon: "⚪⚫",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zu Brettspiele",
      onStart: startGame,
    });
  }

  showScreen(setupScreen);
  initSetup();
})();
